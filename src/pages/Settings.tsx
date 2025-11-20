import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
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
  ShieldOff
} from "lucide-react";
import { RecomputePositionsDialog } from "@/components/RecomputePositionsDialog";
import { useAdmin } from "@/hooks/useAdmin";
import { adminRepo, type HealthCheckResponse, type UserEntity } from "@/integrations/api/repo";
import { toast } from "sonner";

const Settings = () => {
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
      toast.success(data.message || "Daily stock snapshot triggered successfully");
      refetchHealth();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to trigger daily stock snapshot");
    },
  });

  // Database init mutation
  const initMutation = useMutation({
    mutationFn: () => adminRepo.initDatabase(),
    onSuccess: (data) => {
      toast.success(data.message || "Database initialization completed");
      refetchHealth();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to initialize database");
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
      toast.success(data.message || `Admin status ${variables.isAdmin ? "granted" : "revoked"}`);
      refetchUsers();
      // Refresh admin status if updating current user
      queryClient.invalidateQueries({ queryKey: ["user", "me"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update admin status");
    },
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      return new Date(dateString).toLocaleString();
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
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">Manage system settings and preferences</p>
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
                      System Health
                    </CardTitle>
                    <CardDescription>Current system status and performance metrics</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchHealth()}
                    disabled={healthLoading}
                  >
                    <RefreshCw className={`w-4 h-4 ${healthLoading ? "animate-spin" : ""}`} />
                    Refresh
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
                          <p className="font-medium">Database</p>
                          <p className="text-sm text-muted-foreground">
                            {health.database.host} / {health.database.database}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {health.database.status === "connected" ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                            <Badge variant="default" className="bg-green-500">
                              Connected
                            </Badge>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-5 h-5 text-red-500" />
                            <Badge variant="destructive">Disconnected</Badge>
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
                          <p className="font-medium">Server</p>
                          <p className="text-sm text-muted-foreground">
                            Node {health.server.nodeVersion} • {health.server.environment}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">Uptime: {health.server.uptime}</p>
                        <p className="text-xs text-muted-foreground">
                          Memory: {health.server.memory.used} / {health.server.memory.total}
                        </p>
                      </div>
                    </div>

                    {/* Daily Stock Snapshot */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">Daily Stock Snapshot</p>
                          <p className="text-sm text-muted-foreground">
                            Last run: {formatDate(health.dailyStockSnapshot.lastRun)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Scheduled: {health.dailyStockSnapshot.scheduledTime}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-5 h-5" />
                    <p>Failed to load health data</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Admin Actions Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  Admin Actions
                </CardTitle>
                <CardDescription>System maintenance and management tools</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Trigger Daily Snapshot */}
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Daily Stock Snapshot</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Manually trigger the daily stock snapshot job
                    </p>
                    <Button
                      onClick={() => snapshotMutation.mutate()}
                      disabled={snapshotMutation.isPending}
                      className="w-full"
                    >
                      {snapshotMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Trigger Snapshot
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Database Initialization */}
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Database Initialization</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Re-run database schema initialization
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm("Are you sure you want to reinitialize the database? This will recreate all tables and functions.")) {
                          initMutation.mutate();
                        }
                      }}
                      disabled={initMutation.isPending}
                      className="w-full"
                    >
                      {initMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Initializing...
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4" />
                          Initialize Database
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Recompute Positions */}
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Recompute Stock Positions</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Recalculate and fill gaps in daily stock positions
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setRecomputeDialogOpen(true)}
                    className="w-full"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Recompute Positions
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* User Management Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  User Management
                </CardTitle>
                <CardDescription>Manage user accounts and admin permissions</CardDescription>
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
                                <Badge variant="secondary" className="text-xs">You</Badge>
                              )}
                              {isUserAdmin && (
                                <Badge variant="default" className="bg-primary">
                                  <Shield className="w-3 h-3 mr-1" />
                                  Admin
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Joined: {new Date(user.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isUserAdmin ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (isCurrentUser) {
                                    toast.error("Cannot remove admin status from yourself");
                                    return;
                                  }
                                  if (
                                    confirm(
                                      `Are you sure you want to remove admin status from ${user.email}?`
                                    )
                                  ) {
                                    updateAdminMutation.mutate({ userId: user.id, isAdmin: false });
                                  }
                                }}
                                disabled={updateAdminMutation.isPending || isCurrentUser}
                              >
                                <ShieldOff className="w-4 h-4 mr-1" />
                                Remove Admin
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Are you sure you want to grant admin status to ${user.email}?`
                                    )
                                  ) {
                                    updateAdminMutation.mutate({ userId: user.id, isAdmin: true });
                                  }
                                }}
                                disabled={updateAdminMutation.isPending}
                              >
                                <Shield className="w-4 h-4 mr-1" />
                                Make Admin
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No users found</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="border-t pt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (
                      confirm(
                        "⚠️ WARNING: This will delete ALL users except you. The next user to sign up will become admin.\n\nAre you absolutely sure?"
                      )
                    ) {
                      adminRepo.clearUsers().then(() => {
                        toast.success("Users cleared. Next signup will be admin.");
                        refetchUsers();
                        queryClient.invalidateQueries({ queryKey: ["user", "me"] });
                      }).catch((error: Error) => {
                        toast.error(error.message || "Failed to clear users");
                      });
                    }
                  }}
                  className="w-full sm:w-auto"
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Clear All Users (Reset)
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Admin access required to view system settings</p>
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

