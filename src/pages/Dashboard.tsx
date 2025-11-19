import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, Package, Users, UserPlus, DollarSign } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { invoicesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { useTranslation } from "react-i18next";

const Dashboard = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    invoicesCount: 0,
    productsCount: 0,
    customersCount: 0,
    suppliersCount: 0,
    revenue: 0,
    todayInvoicesCount: 0,
    todayProductsCount: 0,
    todayRevenue: 0,
    todayTotalQuantity: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    
    const fetchStats = async () => {
      setLoading(true);
      try {
        const [statsData, recentData] = await Promise.all([
          invoicesRepo.stats(),
          invoicesRepo.listRecent(3),
        ]);

        if (cancelled) return;

        setStats(statsData);
        setRecentInvoices(recentData || []);
      } catch (error: any) {
        if (cancelled) return;
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchStats();
    
    return () => {
      cancelled = true;
    };
  }, []);

  const statsDisplay = [
    {
      title: t('dashboard.todayInvoices'),
      value: (stats.todayInvoicesCount ?? 0).toString(),
      icon: Receipt,
      description: t('dashboard.todayInvoices'),
      color: "text-primary",
    },
    {
      title: t('inventory.title'),
      value: (stats.todayProductsCount ?? 0).toString(),
      icon: Package,
      description: t('inventory.subtitle'),
      color: "text-success",
    },
    {
      title: t('customers.title'),
      value: stats.customersCount.toString(),
      icon: Users,
      description: t('customers.subtitle'),
      color: "text-warning",
    },
    {
      title: t('suppliers.title'),
      value: stats.suppliersCount.toString(),
      icon: UserPlus,
      description: t('suppliers.subtitle'),
      color: "text-destructive",
    },
    {
      title: t('dashboard.totalSales'),
      value: `$${(stats.todayRevenue ?? 0).toFixed(2)}`,
      icon: DollarSign,
      description: t('dashboard.totalSales'),
      color: "text-primary",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 sm:space-y-8 animate-fade-in">
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            {t('dashboard.title')}
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">{t('dashboard.subtitle')}</p>
        </div>

        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
                  <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
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
                {t('dashboard.recentInvoices')}
              </CardTitle>
              <CardDescription>{t('dashboard.recentInvoices')}</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              {recentInvoices.length > 0 ? (
                <div className="space-y-4">
                  {recentInvoices.map((invoice, idx) => (
                    <div 
                      key={invoice.id} 
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 p-3 rounded-lg hover:bg-muted/50 transition-colors border-b last:border-0 animate-fade-in"
                      style={{ animationDelay: `${idx * 0.1}s` }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {invoice.invoice_type === 'sell' ? invoice.customers?.name : invoice.suppliers?.name}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                          {formatDateTimeLebanon(invoice.invoice_date, "MMM dd, yyyy")}
                        </p>
                      </div>
                      <div className="text-left sm:text-right w-full sm:w-auto">
                        <p className="font-bold text-base sm:text-lg">${Number(invoice.total_amount).toFixed(2)}</p>
                        <p className={`text-xs px-2 py-1 rounded-full inline-block ${invoice.is_paid ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                          {invoice.is_paid ? `✓ ${t('dashboard.paid')}` : `○ ${t('dashboard.pending')}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('common.noData')}</p>
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
