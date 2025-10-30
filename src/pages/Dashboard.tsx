import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, Package, Users, UserPlus, DollarSign } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { invoicesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const Dashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    invoicesCount: 0,
    productsCount: 0,
    customersCount: 0,
    suppliersCount: 0,
    revenue: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const stats = await invoicesRepo.stats();
        const recent = await invoicesRepo.listRecent(3);

        setStats(stats);
        setRecentInvoices(recent || []);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statsDisplay = [
    {
      title: "Total Invoices",
      value: stats.invoicesCount.toString(),
      icon: Receipt,
      description: "All time",
      color: "text-primary",
    },
    {
      title: "Products",
      value: stats.productsCount.toString(),
      icon: Package,
      description: "In inventory",
      color: "text-success",
    },
    {
      title: "Customers",
      value: stats.customersCount.toString(),
      icon: Users,
      description: "Active customers",
      color: "text-warning",
    },
    {
      title: "Suppliers",
      value: stats.suppliersCount.toString(),
      icon: UserPlus,
      description: "Active suppliers",
      color: "text-destructive",
    },
    {
      title: "Revenue",
      value: `$${stats.revenue.toFixed(2)}`,
      icon: DollarSign,
      description: "Total sell invoices",
      color: "text-primary",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="space-y-2">
          <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            Dashboard
          </h2>
          <p className="text-muted-foreground text-lg">Welcome to your invoice management system</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            Array(5).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse border-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="h-4 w-24 bg-muted rounded"></div>
                  <div className="h-5 w-5 bg-muted rounded"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-20 bg-muted rounded mb-2"></div>
                  <div className="h-3 w-16 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))
          ) : (
            statsDisplay.map((stat, index) => (
              <Card 
                key={stat.title} 
                className="group relative overflow-hidden border-2 hover:border-primary/50 transition-all cursor-pointer hover:scale-[1.02] duration-300 shadow-card hover:shadow-elegant animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
                onClick={() => {
                  if (stat.title === "Total Invoices") navigate("/invoices");
                  else if (stat.title === "Products") navigate("/products");
                  else if (stat.title === "Customers") navigate("/customers");
                  else if (stat.title === "Suppliers") navigate("/suppliers");
                  else if (stat.title === "Revenue") navigate("/invoices");
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="grid gap-6">
          <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300 group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary" />
                Recent Invoices
              </CardTitle>
              <CardDescription>Your latest transactions</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              {recentInvoices.length > 0 ? (
                <div className="space-y-4">
                  {recentInvoices.map((invoice, idx) => (
                    <div 
                      key={invoice.id} 
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border-b last:border-0 animate-fade-in"
                      style={{ animationDelay: `${idx * 0.1}s` }}
                    >
                      <div>
                        <p className="font-semibold text-foreground">
                          {invoice.invoice_type === 'sell' ? invoice.customers?.name : invoice.suppliers?.name}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                          {format(new Date(invoice.invoice_date), "MMM dd, yyyy")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">${Number(invoice.total_amount).toFixed(2)}</p>
                        <p className={`text-xs px-2 py-1 rounded-full ${invoice.is_paid ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                          {invoice.is_paid ? '✓ Paid' : '○ Pending'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No invoices yet. Create your first invoice to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
