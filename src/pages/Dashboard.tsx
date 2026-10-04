import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, Package, Users, UserPlus, DollarSign } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { StatusPill, PaymentStatusPill } from "@/components/page-ui/StatusPill";
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
      color: "text-primary-strong",
    },
    {
      title: t('inventory.title'),
      value: (stats.todayProductsCount ?? 0).toString(),
      icon: Package,
      description: t('inventory.subtitle'),
      color: "text-success-strong",
    },
    {
      title: t('customers.title'),
      value: stats.customersCount.toString(),
      icon: Users,
      description: t('customers.subtitle'),
      color: "text-warning-strong",
    },
    {
      title: t('suppliers.title'),
      value: stats.suppliersCount.toString(),
      icon: UserPlus,
      description: t('suppliers.subtitle'),
      color: "text-destructive-strong",
    },
    {
      title: t('dashboard.totalSales'),
      value: `$${(stats.todayRevenue ?? 0).toFixed(2)}`,
      icon: DollarSign,
      description: t('dashboard.totalSales'),
      color: "text-primary-strong",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <InvoicePageHeader
          icon={Receipt}
          title={t('dashboard.title')}
          description={t('dashboard.subtitle')}
        />

        <div className="grid gap-2 grid-cols-2 lg:grid-cols-3">
          {loading ? (
            Array(5).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse rounded-xl border border-border">
                <CardHeader className="flex flex-row items-start justify-between gap-1 space-y-0 pb-1.5 pt-2 px-2">
                  <div className="h-3.5 w-full max-w-[6rem] bg-muted rounded"></div>
                  <div className="h-4 w-4 bg-muted rounded shrink-0"></div>
                </CardHeader>
                <CardContent className="px-2 pb-2">
                  <div className="h-5 w-20 bg-muted rounded mb-1"></div>
                  <div className="h-3 w-14 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))
          ) : (
            statsDisplay.map((stat, index) => (
              <Card 
                key={stat.title} 
                className="group relative overflow-hidden rounded-xl border border-border hover:border-primary/50 transition-colors cursor-pointer duration-300 animate-slide-up"
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
                <CardHeader className="flex flex-row items-start justify-between gap-1 space-y-0 pb-1.5 pt-2 px-2">
                  <CardTitle className="text-[11px] leading-tight font-medium text-muted-foreground group-hover:text-foreground transition-colors min-w-0 break-words">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className={`h-3.5 w-3.5 shrink-0 ${stat.color}`} aria-hidden="true" />
                </CardHeader>
                <CardContent className="px-2 pb-2">
                  <div className="text-base font-bold tabular-nums truncate">
                    {stat.value}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{stat.description}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="grid gap-2">
          <SectionCard icon={Receipt} title={t('dashboard.recentInvoices')}>
              {recentInvoices.length > 0 ? (
                <div className="space-y-1.5">
                  {recentInvoices.map((invoice, idx) => {
                    const typeChip = (
                      <StatusPill tone={invoice.invoice_type === 'sell' ? 'sell' : 'buy'}>
                        {invoice.invoice_type === 'sell' ? t('invoices.sell') : t('invoices.buy')}
                      </StatusPill>
                    );

                    return (
                      <div
                        key={invoice.id}
                        className="flex items-center justify-between gap-2 sm:grid sm:grid-cols-3 sm:items-center p-2 rounded-lg hover:bg-muted/50 transition-colors border-b last:border-0 animate-fade-in"
                        style={{ animationDelay: `${idx * 0.1}s` }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[13px] text-foreground truncate">
                            {invoice.invoice_type === 'sell' ? invoice.customers?.name : invoice.suppliers?.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 whitespace-nowrap tabular-nums">
                              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                              {formatDateTimeLebanon(invoice.invoice_date, "MMM dd, yyyy")}
                            </p>
                            {/* On phones the type sits inline with the date instead of
                                taking a row of its own. */}
                            <span className="sm:hidden flex items-center">
                              {typeChip}
                            </span>
                          </div>
                        </div>
                        <div className="hidden sm:flex items-center justify-center self-center mx-auto">
                          {typeChip}
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="font-bold text-[13px] tabular-nums whitespace-nowrap">${Number(invoice.total_amount).toFixed(2)}</p>
                          <PaymentStatusPill status={invoice.payment_status}>
                            {invoice.payment_status === 'paid' ? t('dashboard.paid') : invoice.payment_status === 'partial' ? t('dashboard.partial') : t('dashboard.pending')}
                          </PaymentStatusPill>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-[13px]">{t('common.noData')}</p>
                </div>
              )}
          </SectionCard>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
