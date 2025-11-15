import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { invoicesRepo, productsRepo, productCostsRepo, customersRepo, suppliersRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { FileText, TrendingUp, TrendingDown, Package, Download, BarChart3, DollarSign } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

const Reports = () => {
  const { toast } = useToast();
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

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [all, products, customers, suppliers] = await Promise.all([
        invoicesRepo.listWithRelations(),
        productsRepo.list(),
        customersRepo.list(),
        suppliersRepo.list(),
      ]);
      
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
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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
        const status = inv.payment_status || (inv.is_paid ? 'paid' : 'pending');
        if (status === 'paid') statusCounts.paid++;
        else if (status === 'partial') statusCounts.partial++;
        else statusCounts.pending++;
      });
      setPaymentStatusData([
        { name: 'Paid', value: statusCounts.paid, color: COLORS[0] },
        { name: 'Partial', value: statusCounts.partial, color: COLORS[1] },
        { name: 'Pending', value: statusCounts.pending, color: COLORS[2] },
      ]);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text('Business Analytics Report', 14, 22);
      doc.setFontSize(12);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
      
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Reports & Analytics</h2>
            <p className="text-muted-foreground">Comprehensive business insights and trends</p>
          </div>
          <Button onClick={exportToPDF} className="gap-2">
            <Download className="w-4 h-4" />
            Export PDF
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-4">
            {Array(4).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-2"><div className="h-4 w-24 bg-muted rounded"></div></CardHeader>
                <CardContent><div className="h-8 w-32 bg-muted rounded"></div></CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                  <TrendingUp className="h-5 w-5 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-success">${summary.totalSales.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">Revenue from sell invoices</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
                  <TrendingDown className="h-5 w-5 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-destructive">${summary.totalPurchases.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">Cost from buy invoices</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                  <DollarSign className="h-5 w-5 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-warning">${summary.netProfit.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">Sales minus purchases</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
                  <Package className="h-5 w-5 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-accent">{summary.averageMargin.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">Average margin percentage</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Monthly Sales & Purchases
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="sales" stroke="#10b981" name="Sales" />
                      <Line type="monotone" dataKey="purchases" stroke="#ef4444" name="Purchases" />
                      <Line type="monotone" dataKey="profit" stroke="#3b82f6" name="Profit" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Payment Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={paymentStatusData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={80} fill="#8884d8" dataKey="value">
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

            <Card>
              <CardHeader>
                <CardTitle>Monthly Sales Trend (Last 12 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sales" fill="#10b981" name="Sales" />
                    <Bar dataKey="purchases" fill="#ef4444" name="Purchases" />
                    <Bar dataKey="profit" fill="#3b82f6" name="Profit" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top 10 Products by Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={topProducts} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={150} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top 10 Customers by Sales</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={topCustomers} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={150} />
                      <Tooltip />
                      <Bar dataKey="total" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="border-2 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  Product Cost Tracking
                </CardTitle>
                <CardDescription>
                  Average costs calculated from purchase history for accurate profit analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  <div className="flex justify-between items-center mb-2">
                    <span>Products with cost data:</span>
                    <span className="font-semibold">{productCosts.size} / {summary.totalProducts}</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all"
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
