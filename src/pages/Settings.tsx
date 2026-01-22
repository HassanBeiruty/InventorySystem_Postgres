import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Settings as SettingsIcon, 
  RefreshCw, 
  Database, 
  Activity, 
  Play, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Server,
  HardDrive,
  Users,
  Shield,
  ShieldOff,
  Trash2,
  Download,
  FileSpreadsheet,
  ChevronDown
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RecomputePositionsDialog } from "@/components/RecomputePositionsDialog";
import { useAdmin } from "@/hooks/useAdmin";
import { adminRepo, type HealthCheckResponse, type UserEntity } from "@/integrations/api/repo";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const Settings = () => {
  const { t } = useTranslation();
  const { isAdmin, isLoading: isAdminLoading, userInfo } = useAdmin();
  const [recomputeDialogOpen, setRecomputeDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Health check query with React Query for caching and performance
  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery<HealthCheckResponse>({
    queryKey: ["admin", "health"],
    queryFn: () => adminRepo.healthCheck(),
    enabled: !isAdminLoading && isAdmin, // Only fetch if admin check is complete and user is admin
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider data fresh for 10 seconds
  });

  // Daily snapshot mutation
  const snapshotMutation = useMutation({
    mutationFn: () => adminRepo.triggerDailySnapshot(),
    onSuccess: (data) => {
      toast.success(data.message || t("settings.dailyStockSnapshotTriggered"));
      // Invalidate all related queries to force immediate refresh
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["daily-stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "health"] });
      refetchHealth();
    },
    onError: (error: Error) => {
      toast.error(error.message || t("settings.failedToTriggerSnapshot"));
    },
  });

  // Database init mutation
  const initMutation = useMutation({
    mutationFn: () => adminRepo.initDatabase(),
    onSuccess: (data) => {
      toast.success(data.message || t("settings.databaseInitializationCompleted"));
      refetchHealth();
    },
    onError: (error: Error) => {
      toast.error(error.message || t("settings.failedToInitializeDatabase"));
    },
  });

  // Seed master data mutation
  const seedMasterDataMutation = useMutation({
    mutationFn: () => adminRepo.seedMasterData(),
    onSuccess: (data) => {
      toast.success(data.message || "Master data seeded successfully");
      refetchHealth();
      // Refresh the page to show updated data
      setTimeout(() => window.location.reload(), 2000);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to seed master data");
    },
  });

  // Clear transactions only mutation
  const clearTransactionsOnlyMutation = useMutation({
    mutationFn: () => adminRepo.clearTransactionsOnly(),
    onSuccess: (data) => {
      toast.success(data.message || "Transactions cleared successfully");
      refetchHealth();
      // Refresh the page to show updated data
      setTimeout(() => window.location.reload(), 2000);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to clear transactions");
    },
  });

  // Clear everything mutation
  const clearEverythingMutation = useMutation({
    mutationFn: () => adminRepo.clearEverything(),
    onSuccess: (data) => {
      toast.success(data.message || "All data cleared successfully");
      refetchHealth();
      // Refresh the page to show updated data
      setTimeout(() => window.location.reload(), 2000);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to clear data");
    },
  });

  // Users query
  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useQuery<UserEntity[]>({
    queryKey: ["admin", "users"],
    queryFn: () => adminRepo.listUsers(),
    enabled: !isAdminLoading && isAdmin, // Only fetch if admin check is complete and user is admin
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // Update admin status mutation
  const updateAdminMutation = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: number; isAdmin: boolean }) =>
      adminRepo.updateUserAdminStatus(userId, isAdmin),
    onSuccess: (data, variables) => {
      toast.success(data.message || (variables.isAdmin ? t("settings.adminStatusGranted") || "Admin status granted" : t("settings.adminStatusRevoked") || "Admin status revoked"));
      refetchUsers();
      // Refresh admin status if updating current user
      queryClient.invalidateQueries({ queryKey: ["user", "me"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || t("settings.failedToUpdateAdminStatus"));
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => adminRepo.deleteUser(userId),
    onSuccess: (data) => {
      toast.success(data.message || t("settings.userDeleted") || "User deleted successfully");
      refetchUsers();
      // Refresh admin status if deleting current user (shouldn't happen, but just in case)
      queryClient.invalidateQueries({ queryKey: ["user", "me"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || t("settings.failedToDeleteUser") || "Failed to delete user");
    },
  });

  // Memoize formatDate to avoid recreating function on every render
  const formatDate = useCallback((dateString: string | null) => {
    if (!dateString) return t("settings.never");
    try {
      return formatDateTimeLebanon(dateString, "MMM dd, yyyy HH:mm");
    } catch {
      return dateString;
    }
  }, [t]);

  // Wait for admin check to complete before rendering anything
  // This prevents the flash of content/access denied
  if (isAdminLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-2 sm:space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-2 sm:space-y-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold flex items-center gap-1.5">
            
            ⚙️ {t("settings.title")}
          </h1>
          <p className="text-[10px] sm:text-xs text-muted-foreground">{t("settings.subtitle")}</p>
        </div>

        {/* Admin Section */}
        {isAdmin ? (
          <div className="space-y-2 sm:space-y-3">
            {/* System Health Card */}
            <Card className="border-2">
              <CardHeader className="p-2 sm:p-3 border-b">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm">
                      <Activity className="w-4 h-4" />
                      {t("settings.systemHealth")}
                    </CardTitle>
                    <CardDescription className="text-[10px] sm:text-xs">{t("settings.systemHealthDescription")}</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchHealth()}
                    disabled={healthLoading}
                    className="h-7 text-[10px] sm:text-xs"
                  >
                    <RefreshCw className={`w-3 h-3 ${healthLoading ? "animate-spin" : ""}`} />
                    {t("settings.refresh")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-2 sm:p-3">
                {healthLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : health ? (
                  <div className="space-y-2">
                    {/* Database Status */}
                    <div className="flex items-center justify-between p-2 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-primary" />
                        <div>
                          <p className="font-medium text-xs sm:text-sm">{t("settings.database")}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">
                            {health.database.host} / {health.database.database}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {health.database.status === "connected" ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-success" />
                            <Badge variant="success" className="text-[10px] px-1.5 py-0">
                              {t("settings.connected")}
                            </Badge>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-destructive" />
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{t("settings.disconnected")}</Badge>
                          </>
                        )}
                        <span className="text-[10px] sm:text-xs text-muted-foreground">
                          {health.database.responseTime}
                        </span>
                      </div>
                    </div>

                    {/* Server Status */}
                    <div className="flex items-center justify-between p-2 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-primary" />
                        <div>
                          <p className="font-medium text-xs sm:text-sm">{t("settings.server")}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">
                            Node {health.server.nodeVersion} • {health.server.environment}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] sm:text-xs font-medium">{t("settings.uptime")}: {health.server.uptime}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {t("settings.memory")}: {health.server.memory.used} / {health.server.memory.total}
                        </p>
                      </div>
                    </div>

                    {/* Daily Stock Snapshot */}
                    <div className="flex items-center justify-between p-2 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" />
                        <div>
                          <p className="font-medium text-xs sm:text-sm">{t("settings.dailyStockSnapshot")}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">
                            {t("settings.lastRun")}: {formatDate(health.dailyStockSnapshot.lastRun)}
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            {t("settings.scheduled")}: {health.dailyStockSnapshot.scheduledTime}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    <p className="text-xs">{t("settings.failedToLoad")}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Admin Actions Card */}
            <Card className="border-2">
              <CardHeader className="p-2 sm:p-3 border-b">
                <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <HardDrive className="w-4 h-4" />
                  {t("settings.adminActions")}
                </CardTitle>
                <CardDescription className="text-[10px] sm:text-xs">{t("settings.adminActionsDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3 p-2 sm:p-3">
                <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Trigger Daily Snapshot */}
                  <div className="p-2 border rounded-lg flex flex-col">
                    <h4 className="font-medium mb-1 text-xs sm:text-sm">{t("settings.dailyStockSnapshotTitle")}</h4>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 flex-1 min-h-[2.5rem]">
                      {t("settings.dailyStockSnapshotDescription")}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => snapshotMutation.mutate()}
                      disabled={snapshotMutation.isPending}
                      className="w-full h-7 text-[10px] sm:text-xs mt-auto"
                    >
                      {snapshotMutation.isPending ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          {t("settings.running")}
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          {t("settings.triggerSnapshot")}
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Database Initialization */}
                  <div className="p-2 border rounded-lg flex flex-col">
                    <h4 className="font-medium mb-1 text-xs sm:text-sm">{t("settings.databaseInitialization")}</h4>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 flex-1 min-h-[2.5rem]">
                      {t("settings.databaseInitializationDescription")}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm(t("settings.reinitializeConfirm"))) {
                          initMutation.mutate();
                        }
                      }}
                      disabled={initMutation.isPending}
                      className="w-full h-7 text-[10px] sm:text-xs mt-auto"
                    >
                      {initMutation.isPending ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          {t("settings.initializing")}
                        </>
                      ) : (
                        <>
                          <Database className="w-3 h-3" />
                          {t("settings.initializeDatabase")}
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Seed Master Data */}
                  <div className="p-2 border rounded-lg flex flex-col">
                    <h4 className="font-medium mb-1 text-xs sm:text-sm">Seed Master Data</h4>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 flex-1 min-h-[2.5rem]">
                      Clear all data and seed fresh master data (categories, products with barcode/SKU/shelf, prices, customers, suppliers). No invoices created.
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                          disabled={seedMasterDataMutation.isPending || clearTransactionsOnlyMutation.isPending || clearEverythingMutation.isPending}
                      className="w-full h-7 text-[10px] sm:text-xs mt-auto"
                    >
                          {seedMasterDataMutation.isPending || clearTransactionsOnlyMutation.isPending || clearEverythingMutation.isPending ? (
                        <>
                              <RefreshCw className="w-3 h-3 animate-spin mr-1.5" />
                              Processing...
                        </>
                      ) : (
                        <>
                              <Database className="w-3 h-3 mr-1.5" />
                          Seed Master Data
                              <ChevronDown className="w-3 h-3 ml-1.5" />
                        </>
                      )}
                    </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onClick={() => {
                            if (confirm("⚠️ WARNING: This will DELETE ALL TRANSACTIONS (invoices, payments, stock movements, daily stock, product prices) but KEEP entities (categories, products, customers, suppliers). Are you sure?")) {
                              clearTransactionsOnlyMutation.mutate();
                            }
                          }}
                          disabled={clearTransactionsOnlyMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove Everything Except Entities
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (confirm("⚠️ WARNING: This will DELETE ALL DATA (including entities like categories, products, customers, suppliers). Fresh start. Are you sure?")) {
                              clearEverythingMutation.mutate();
                            }
                          }}
                          disabled={clearEverythingMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove Everything (Fresh Start)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Recompute Positions */}
                  <div className="p-2 border rounded-lg flex flex-col">
                    <h4 className="font-medium mb-1 text-xs sm:text-sm">{t("settings.recomputeStockPositions")}</h4>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 flex-1 min-h-[2.5rem]">
                      {t("settings.recomputeStockPositionsDescription")}
                    </p>
                    <Button
                      onClick={() => setRecomputeDialogOpen(true)}
                      className="w-full h-7 text-[10px] sm:text-xs mt-auto"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {t("settings.recomputePositions") || "Recompute Positions"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Templates Card */}
            <Card className="border-2">
              <CardHeader className="p-2 sm:p-3 border-b">
                  <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                  {t("settings.templates") || "Import Templates"}
                </CardTitle>
                <CardDescription className="text-[10px] sm:text-xs">{t("settings.templatesDescription") || "Download Excel templates for importing products and invoices"}</CardDescription>
              </CardHeader>
              <CardContent className="p-2 sm:p-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto h-7 text-[10px] sm:text-xs">
                      <FileSpreadsheet className="w-3 h-3 mr-1.5" />
                      <span className="whitespace-nowrap">{t("settings.downloadTemplates") || "Download Templates"}</span>
                      <ChevronDown className="w-3 h-3 ml-1.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={async () => {
                      try {
                        const API_BASE_URL = import.meta.env.VITE_API_URL || '';
                        const token = localStorage.getItem('auth_token');
                        
                        const url = API_BASE_URL 
                          ? `${API_BASE_URL.replace(/\/$/, '')}/api/templates/products`
                          : '/api/templates/products';
                        
                        const response = await fetch(url, {
                          method: 'GET',
                          headers: {
                            'Authorization': `Bearer ${token}`,
                          },
                        });
                        
                        if (!response.ok) {
                          throw new Error('Failed to download template');
                        }
                        
                        const blob = await response.blob();
                        const blobUrl = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = 'products_import_template.xlsx';
                        document.body.appendChild(link);
                        link.click();
                        setTimeout(() => {
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(blobUrl);
                        }, 100);
                        
                        toast.success(t("settings.templateDownloaded") || "Product template downloaded successfully");
                      } catch (error: any) {
                        toast.error(error.message || (t("settings.failedToDownloadTemplate") || "Failed to download template"));
                      }
                    }}>
                      <Download className="w-4 h-4 mr-2" />
                      {t("settings.productTemplate") || "Product Import Template"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={async () => {
                      try {
                        const API_BASE_URL = import.meta.env.VITE_API_URL || '';
                        const token = localStorage.getItem('auth_token');
                        
                        const url = API_BASE_URL 
                          ? `${API_BASE_URL.replace(/\/$/, '')}/api/templates/invoices`
                          : '/api/templates/invoices';
                        
                        const response = await fetch(url, {
                          method: 'GET',
                          headers: {
                            'Authorization': `Bearer ${token}`,
                          },
                        });
                        
                        if (!response.ok) {
                          throw new Error('Failed to download template');
                        }
                        
                        const blob = await response.blob();
                        const blobUrl = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = 'invoice_import_template.xlsx';
                        document.body.appendChild(link);
                        link.click();
                        setTimeout(() => {
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(blobUrl);
                        }, 100);
                        
                        toast.success(t("settings.templateDownloaded") || "Invoice template downloaded successfully");
                      } catch (error: any) {
                        toast.error(error.message || (t("settings.failedToDownloadTemplate") || "Failed to download template"));
                      }
                    }}>
                      <Download className="w-4 h-4 mr-2" />
                      {t("settings.invoiceTemplate") || "Invoice Import Template"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>

            {/* User Management Card */}
            <Card className="border-2">
              <CardHeader className="p-2 sm:p-3 border-b">
                <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Users className="w-4 h-4" />
                  {t("settings.userManagement")}
                </CardTitle>
                <CardDescription className="text-[10px] sm:text-xs">{t("settings.userManagementDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="p-2 sm:p-3">
                {usersLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : users && users.length > 0 ? (
                  <div className="space-y-2">
                    {users.map((user) => {
                      const isCurrentUser = user.id === userInfo?.id;
                      const isUserAdmin = Boolean(user.is_admin);
                      
                      return (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-2 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-xs sm:text-sm truncate">{user.email}</p>
                              {isCurrentUser && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0">{t("settings.you")}</Badge>
                              )}
                              {isUserAdmin && (
                                <Badge variant="default" className="bg-primary text-[9px] px-1 py-0">
                                  <Shield className="w-2.5 h-2.5 mr-0.5" />
                                  {t("settings.admin")}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                              {t("settings.joined")}: {formatDateTimeLebanon(user.created_at, "MMM dd, yyyy")}
                            </p>
                          </div>
                          {!isCurrentUser && (
                            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                              {isUserAdmin ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          t("settings.removeAdminConfirm", { email: user.email }) || `Are you sure you want to remove admin status from ${user.email}?`
                                        )
                                      ) {
                                        updateAdminMutation.mutate({ userId: user.id, isAdmin: false });
                                      }
                                    }}
                                    disabled={updateAdminMutation.isPending}
                                    className="h-7 text-[10px] sm:text-xs px-2"
                                  >
                                    <ShieldOff className="w-3 h-3 mr-1" />
                                    {t("settings.removeAdmin")}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          t("settings.deleteUserConfirm", { email: user.email }) || `Are you sure you want to delete user ${user.email}? This action cannot be undone.`
                                        )
                                      ) {
                                        deleteUserMutation.mutate(user.id);
                                      }
                                    }}
                                    disabled={deleteUserMutation.isPending}
                                    className="h-7 text-[10px] sm:text-xs px-2"
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    {t("settings.removeUser") || "Remove User"}
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          t("settings.makeAdminConfirm", { email: user.email }) || `Are you sure you want to grant admin status to ${user.email}?`
                                        )
                                      ) {
                                        updateAdminMutation.mutate({ userId: user.id, isAdmin: true });
                                      }
                                    }}
                                    disabled={updateAdminMutation.isPending}
                                    className="h-7 text-[10px] sm:text-xs px-2"
                                  >
                                    <Shield className="w-3 h-3 mr-1" />
                                    {t("settings.makeAdmin")}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          t("settings.deleteUserConfirm", { email: user.email }) || `Are you sure you want to delete user ${user.email}? This action cannot be undone.`
                                        )
                                      ) {
                                        deleteUserMutation.mutate(user.id);
                                      }
                                    }}
                                    disabled={deleteUserMutation.isPending}
                                    className="h-7 text-[10px] sm:text-xs px-2"
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    {t("settings.removeUser") || "Remove User"}
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">{t("settings.noUsers")}</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="border-t pt-2 p-2 sm:p-3">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (
                      confirm(t("settings.clearAllUsersConfirm"))
                    ) {
                      adminRepo.clearUsers().then(() => {
                        toast.success(t("settings.usersCleared") || "Users cleared. Next signup will be admin.");
                        refetchUsers();
                        queryClient.invalidateQueries({ queryKey: ["user", "me"] });
                      }).catch((error: Error) => {
                        toast.error(error.message || t("settings.failedToClearUsers") || "Failed to clear users");
                      });
                    }
                  }}
                  className="w-full sm:w-auto h-7 text-[10px] sm:text-xs"
                >
                  <AlertCircle className="w-3 h-3 mr-1.5" />
                  {t("settings.clearAllUsers")}
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : (
          <Card className="border-2">
            <CardContent className="p-3 sm:p-4 text-center">
              <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">{t("settings.adminAccessRequired")}</p>
            </CardContent>
          </Card>
        )}

        <RecomputePositionsDialog 
          open={recomputeDialogOpen}
          onOpenChange={setRecomputeDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default Settings;

