import { useEffect, useState, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { invoicesRepo, productsRepo, productCostsRepo, customersRepo, suppliersRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { FileText, TrendingUp, TrendingDown, Package, Download, BarChart3, DollarSign, AlertCircle } from "lucide-react";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useAdmin } from "@/hooks/useAdmin";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

// Helper function to get CSS variable color as hex
const getThemeColor = (varName: string): string => {
  if (typeof window === "undefined") return "#000000";
  const root = document.documentElement;
  const hsl = getComputedStyle(root).getPropertyValue(varName).trim();
  if (!hsl) return "#000000";
  
  // Convert HSL to RGB to Hex
  const match = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!match) return "#000000";
  
  const h = parseFloat(match[1]) / 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;
  
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  
  let r = 0, g = 0, b = 0;
  
  if (h < 1/6) { r = c; g = x; b = 0; }
  else if (h < 2/6) { r = x; g = c; b = 0; }
  else if (h < 3/6) { r = 0; g = c; b = x; }
  else if (h < 4/6) { r = 0; g = x; b = c; }
  else if (h < 5/6) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// Get theme colors for charts
const getChartColors = () => {
  return {
    success: getThemeColor('--success'),
    warning: getThemeColor('--warning'),
    destructive: getThemeColor('--destructive'),
    primary: getThemeColor('--primary'),
    secondary: getThemeColor('--secondary'),
  };
};

const Reports = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalPurchases: 0,
    netProfit: 0,
    actualProfit: 0,
    averageMargin: 0,
    totalProducts: 0,
    totalCustomers: 0,
    totalSuppliers: 0,
  });
  const [productCosts, setProductCosts] = useState<Map<string, number>>(new Map());
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [paymentStatusData, setPaymentStatusData] = useState<any[]>([]);
  
  // Memoize chart colors to avoid recalculating on every render
  const chartColors = useMemo(() => getChartColors(), []);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const [all, productsResponse, customers, suppliers] = await Promise.all([
        invoicesRepo.listWithRelations(),
        productsRepo.list({ limit: 1000 }),
        customersRepo.list(),
        suppliersRepo.list(),
      ]);
      const products = Array.isArray(productsResponse) ? productsResponse : productsResponse.data;
      
      const sales = (all || []).filter((i: any) => i.invoice_type === "sell");
      const purchases = (all || []).filter((i: any) => i.invoice_type === "buy");
      
      // Fetch all average costs in ONE API call instead of one per product
      const costsMap = new Map<string, number>();
      try {
        const allCosts = await productCostsRepo.getAllAverageCosts();
        Object.entries(allCosts).forEach(([productId, cost]) => {
          if (cost > 0) costsMap.set(productId, cost);
        });
      } catch (e) {
        console.error('Failed to fetch average costs:', e);
      }
      setProductCosts(costsMap);
      
      const totalSales = sales.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0) || 0;
      const totalPurchases = purchases.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0) || 0;

      setSummary({
        totalSales,
        totalPurchases,
        netProfit: totalSales - totalPurchases,
        actualProfit: 0,
        averageMargin: totalSales > 0 ? ((totalSales - totalPurchases) / totalSales) * 100 : 0,
        totalProducts: (products || []).length,
        totalCustomers: (customers || []).length,
        totalSuppliers: (suppliers || []).length,
      });
      
      // Monthly analytics
      const monthlyMap = new Map<string, { sales: number; purchases: number; profit: number; month: string }>();
      all?.forEach((inv: any) => {
        const date = new Date(inv.invoice_date);
        // Get month name in Lebanon timezone
        const monthName = formatDateTimeLebanon(inv.invoice_date, "MMM yyyy");
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { sales: 0, purchases: 0, profit: 0, month: monthName });
        }
        const data = monthlyMap.get(monthKey)!;
        if (inv.invoice_type === 'sell') data.sales += Number(inv.total_amount) || 0;
        else data.purchases += Number(inv.total_amount) || 0;
        data.profit = data.sales - data.purchases;
      });
      setMonthlyData(Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month)).slice(-12));
      
      // Top products
      const productSales = new Map<string, { name: string; revenue: number }>();
      sales.forEach((inv: any) => {
        (inv.invoice_items || []).forEach((item: any) => {
          const productId = String(item.product_id);
          const product = products?.find((p: any) => String(p.id) === productId);
          if (!productSales.has(productId)) {
            productSales.set(productId, { name: product?.name || `Product #${productId}`, revenue: 0 });
          }
          productSales.get(productId)!.revenue += Number(item.total_price) || 0;
        });
      });
      setTopProducts(Array.from(productSales.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
      
      // Top customers
      const customerSales = new Map<string, { name: string; total: number }>();
      sales.filter((inv: any) => inv.customer_id).forEach((inv: any) => {
        const customerId = String(inv.customer_id);
        if (!customerSales.has(customerId)) {
          customerSales.set(customerId, { name: inv.customers?.name || `Customer #${customerId}`, total: 0 });
        }
        customerSales.get(customerId)!.total += Number(inv.total_amount) || 0;
      });
      setTopCustomers(Array.from(customerSales.values()).sort((a, b) => b.total - a.total).slice(0, 10));
      
      // Payment status
      const statusCounts = { paid: 0, partial: 0, pending: 0 };
      all?.forEach((inv: any) => {
        const status = inv.payment_status || 'pending';
        if (status === 'paid') statusCounts.paid++;
        else if (status === 'partial') statusCounts.partial++;
        else statusCounts.pending++;
      });
      setPaymentStatusData([
        { name: 'Paid', value: statusCounts.paid, color: chartColors.success },
        { name: 'Partial', value: statusCounts.partial, color: chartColors.warning },
        { name: 'Pending', value: statusCounts.pending, color: chartColors.secondary },
      ]);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]); // chartColors is memoized and stable, no need to include

  useEffect(() => {
    if (!isAdmin || isAdminLoading) return;
    fetchReports();
  }, [isAdmin, isAdminLoading, fetchReports]);

  const exportToPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text('Business Analytics Report', 14, 22);
      doc.setFontSize(12);
      doc.text(`Generated: ${formatDateTimeLebanon(new Date(), "MMM dd, yyyy")}`, 14, 30);
      
      autoTable(doc, {
        startY: 40,
        head: [['Metric', 'Value']],
        body: [
          ['Total Sales', `$${summary.totalSales.toFixed(2)}`],
          ['Total Purchases', `$${summary.totalPurchases.toFixed(2)}`],
          ['Net Profit', `$${summary.netProfit.toFixed(2)}`],
          ['Profit Margin', `${summary.averageMargin.toFixed(1)}%`],
          ['Total Products', summary.totalProducts.toString()],
          ['Total Customers', summary.totalCustomers.toString()],
          ['Total Suppliers', summary.totalSuppliers.toString()],
        ],
      });
      
      if (topProducts.length > 0) {
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 20,
          head: [['Product', 'Revenue']],
          body: topProducts.map(p => [p.name, `$${p.revenue.toFixed(2)}`]),
        });
      }
      
      if (topCustomers.length > 0) {
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 20,
          head: [['Customer', 'Total Sales']],
          body: topCustomers.map(c => [c.name, `$${c.total.toFixed(2)}`]),
        });
      }
      
      doc.save(`business-report-${new Date().toISOString().split('T')[0]}.pdf`);
      toast({ title: "Success", description: "PDF report downloaded successfully" });
    } catch (error: any) {
      console.error("PDF export error:", error);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    }
  };

  // While checking admin status, show skeleton layout (same style as Settings/ExchangeRates)
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
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
              📊 {t("reports.title")}
            </h2>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {t("reports.subtitle")}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={exportToPDF} className="gap-1.5 h-7 text-[10px] sm:text-xs">
              <Download className="w-3 h-3" />
              Export PDF
            </Button>
          )}
        </div>

        {!isAdmin ? (
          <Card className="border-2">
            <CardContent className="p-3 sm:p-4 text-center">
              <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">{t("settings.adminAccessRequired")}</p>
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="grid gap-2 sm:gap-3 md:grid-cols-4">
            {Array(4).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse border-2">
                <CardHeader className="pb-1.5 p-2"><div className="h-3 w-20 bg-muted rounded"></div></CardHeader>
                <CardContent className="p-2"><div className="h-6 w-24 bg-muted rounded"></div></CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:gap-3 md:grid-cols-4">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 border-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-2 px-2.5">
                  <CardTitle className="text-xs sm:text-sm font-medium">Total Sales</CardTitle>
                  <TrendingUp className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent className="px-2.5 pb-2">
                  <div className="text-base sm:text-lg font-bold text-success">${summary.totalSales.toFixed(2)}</div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Revenue from sell invoices</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20 border-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-2 px-2.5">
                  <CardTitle className="text-xs sm:text-sm font-medium">Total Purchases</CardTitle>
                  <TrendingDown className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent className="px-2.5 pb-2">
                  <div className="text-base sm:text-lg font-bold text-destructive">${summary.totalPurchases.toFixed(2)}</div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Cost from buy invoices</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20 border-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-2 px-2.5">
                  <CardTitle className="text-xs sm:text-sm font-medium">Net Profit</CardTitle>
                  <DollarSign className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent className="px-2.5 pb-2">
                  <div className="text-base sm:text-lg font-bold text-warning">${summary.netProfit.toFixed(2)}</div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Sales minus purchases</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20 border-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-2 px-2.5">
                  <CardTitle className="text-xs sm:text-sm font-medium">Profit Margin</CardTitle>
                  <Package className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent className="px-2.5 pb-2">
                  <div className="text-base sm:text-lg font-bold text-accent">{summary.averageMargin.toFixed(1)}%</div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Average margin percentage</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
              <Card className="border-2">
                <CardHeader className="p-2 sm:p-3 border-b">
                  <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm">
                    <BarChart3 className="w-4 h-4" />
                    Monthly Sales & Purchases
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="sales" stroke={chartColors.success} name="Sales" />
                      <Line type="monotone" dataKey="purchases" stroke={chartColors.destructive} name="Purchases" />
                      <Line type="monotone" dataKey="profit" stroke={chartColors.secondary} name="Profit" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-2">
                <CardHeader className="p-2 sm:p-3 border-b">
                  <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm">
                    <FileText className="w-4 h-4" />
                    Payment Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={paymentStatusData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={80} fill={chartColors.primary} dataKey="value">
                        {paymentStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="border-2">
              <CardHeader className="p-2 sm:p-3 border-b">
                <CardTitle className="text-xs sm:text-sm">Monthly Sales Trend (Last 12 Months)</CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-3">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sales" fill={chartColors.success} name="Sales" />
                    <Bar dataKey="purchases" fill={chartColors.destructive} name="Purchases" />
                    <Bar dataKey="profit" fill={chartColors.secondary} name="Profit" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
              <Card className="border-2">
                <CardHeader className="p-2 sm:p-3 border-b">
                  <CardTitle className="text-xs sm:text-sm">Top 10 Products by Revenue</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topProducts} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={150} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill={chartColors.primary} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-2">
                <CardHeader className="p-2 sm:p-3 border-b">
                  <CardTitle className="text-xs sm:text-sm">Top 10 Customers by Sales</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topCustomers} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={150} />
                      <Tooltip />
                      <Bar dataKey="total" fill={chartColors.warning} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="border-2 shadow-card">
              <CardHeader className="p-2 sm:p-3 border-b">
                <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Package className="w-4 h-4 text-primary" />
                  Product Cost Tracking
                </CardTitle>
                <CardDescription className="text-[10px] sm:text-xs">
                  Average costs calculated from purchase history for accurate profit analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="p-2 sm:p-3">
                <div className="text-xs text-muted-foreground">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] sm:text-xs">Products with cost data:</span>
                    <span className="font-semibold text-xs sm:text-sm">{productCosts.size} / {summary.totalProducts}</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-1.5">
                    <div 
                      className="bg-primary h-1.5 rounded-full transition-all"
                      style={{ width: `${summary.totalProducts > 0 ? (productCosts.size / summary.totalProducts) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Reports;
