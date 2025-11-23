import { useState } from "react";
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
  Trash2
} from "lucide-react";
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t("settings.never");
    try {
      return formatDateTimeLebanon(dateString, "MMM dd, yyyy HH:mm");
    } catch {
      return dateString;
    }
  };

  // Wait for admin check to complete before rendering anything
  // This prevents the flash of content/access denied
  if (isAdminLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 p-4 sm:p-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <SettingsIcon className="w-8 h-8" />
            {t("settings.title")}
          </h1>
          <p className="text-muted-foreground mt-2">{t("settings.subtitle")}</p>
        </div>

        {/* Admin Section */}
        {isAdmin ? (
          <div className="space-y-6">
            {/* System Health Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      {t("settings.systemHealth")}
                    </CardTitle>
                    <CardDescription>{t("settings.systemHealthDescription")}</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchHealth()}
                    disabled={healthLoading}
                  >
                    <RefreshCw className={`w-4 h-4 ${healthLoading ? "animate-spin" : ""}`} />
                    {t("settings.refresh")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {healthLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : health ? (
                  <div className="space-y-4">
                    {/* Database Status */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Database className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">{t("settings.database")}</p>
                          <p className="text-sm text-muted-foreground">
                            {health.database.host} / {health.database.database}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {health.database.status === "connected" ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 text-success" />
                            <Badge variant="success">
                              {t("settings.connected")}
                            </Badge>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-5 h-5 text-destructive" />
                            <Badge variant="destructive">{t("settings.disconnected")}</Badge>
                          </>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {health.database.responseTime}
                        </span>
                      </div>
                    </div>

                    {/* Server Status */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Server className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">{t("settings.server")}</p>
                          <p className="text-sm text-muted-foreground">
                            Node {health.server.nodeVersion} • {health.server.environment}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{t("settings.uptime")}: {health.server.uptime}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.memory")}: {health.server.memory.used} / {health.server.memory.total}
                        </p>
                      </div>
                    </div>

                    {/* Daily Stock Snapshot */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">{t("settings.dailyStockSnapshot")}</p>
                          <p className="text-sm text-muted-foreground">
                            {t("settings.lastRun")}: {formatDate(health.dailyStockSnapshot.lastRun)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("settings.scheduled")}: {health.dailyStockSnapshot.scheduledTime}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-5 h-5" />
                    <p>{t("settings.failedToLoad")}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Admin Actions Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  {t("settings.adminActions")}
                </CardTitle>
                <CardDescription>{t("settings.adminActionsDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  {/* Trigger Daily Snapshot */}
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">{t("settings.dailyStockSnapshotTitle")}</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t("settings.dailyStockSnapshotDescription")}
                    </p>
                    <Button
                      onClick={() => snapshotMutation.mutate()}
                      disabled={snapshotMutation.isPending}
                      className="w-full"
                    >
                      {snapshotMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          {t("settings.running")}
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          {t("settings.triggerSnapshot")}
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Database Initialization */}
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">{t("settings.databaseInitialization")}</h4>
                    <p className="text-sm text-muted-foreground mb-4">
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
                      className="w-full"
                    >
                      {initMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          {t("settings.initializing")}
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4" />
                          {t("settings.initializeDatabase")}
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Seed Master Data */}
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Seed Master Data</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Clear all data and seed fresh master data (categories, products with barcode/SKU/shelf, prices, customers, suppliers). No invoices created.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm("⚠️ WARNING: This will DELETE ALL DATA (including invoices) and seed fresh master data. Are you sure?")) {
                          seedMasterDataMutation.mutate();
                        }
                      }}
                      disabled={seedMasterDataMutation.isPending}
                      className="w-full"
                    >
                      {seedMasterDataMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Seeding...
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4" />
                          Seed Master Data
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Recompute Positions */}
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">{t("settings.recomputeStockPositions")}</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t("settings.recomputeStockPositionsDescription")}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setRecomputeDialogOpen(true)}
                      className="w-full"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {t("settings.recomputePositions") || "Recompute Positions"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* User Management Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {t("settings.userManagement")}
                </CardTitle>
                <CardDescription>{t("settings.userManagementDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : users && users.length > 0 ? (
                  <div className="space-y-3">
                    {users.map((user) => {
                      const isCurrentUser = user.id === userInfo?.id;
                      const isUserAdmin = user.is_admin === true || user.is_admin === 1;
                      
                      return (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{user.email}</p>
                              {isCurrentUser && (
                                <Badge variant="secondary" className="text-xs">{t("settings.you")}</Badge>
                              )}
                              {isUserAdmin && (
                                <Badge variant="default" className="bg-primary">
                                  <Shield className="w-3 h-3 mr-1" />
                                  {t("settings.admin")}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t("settings.joined")}: {formatDateTimeLebanon(user.created_at, "MMM dd, yyyy")}
                            </p>
                          </div>
                          {!isCurrentUser && (
                            <div className="flex items-center gap-2">
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
                                  >
                                    <ShieldOff className="w-4 h-4 mr-1" />
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
                                  >
                                    <Trash2 className="w-4 h-4 mr-1" />
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
                                  >
                                    <Shield className="w-4 h-4 mr-1" />
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
                                  >
                                    <Trash2 className="w-4 h-4 mr-1" />
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
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>{t("settings.noUsers")}</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="border-t pt-4">
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
                  className="w-full sm:w-auto"
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  {t("settings.clearAllUsers")}
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t("settings.adminAccessRequired")}</p>
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

