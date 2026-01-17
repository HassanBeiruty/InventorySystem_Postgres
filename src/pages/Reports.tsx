import { useEffect, useState, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invoicesRepo, productsRepo, productCostsRepo, customersRepo, suppliersRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { FileText, TrendingUp, TrendingDown, Package, Download, BarChart3, DollarSign, AlertCircle, Calendar, X } from "lucide-react";
import { formatDateTimeLebanon, getTodayLebanon } from "@/utils/dateUtils";
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
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [chartPeriod, setChartPeriod] = useState<string>("month");
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

  // Helper function to format date for comparison (YYYY-MM-DD)
  const formatDateForComparison = useCallback((date: Date | string): string => {
    if (typeof date === 'string') {
      // Extract date part from datetime string (e.g., "2025-11-22 23:35:00" -> "2025-11-22")
      return date.split(' ')[0].split('T')[0];
    }
    const d = new Date(date);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Beirut',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  }, []);

  // Helper function to filter invoices by date range
  // Includes invoices on startDate and endDate (inclusive boundaries)
  const filterByDateRange = useCallback((invoices: any[]) => {
    if ((!startDate || startDate === "") && (!endDate || endDate === "")) return invoices;
    return invoices.filter((inv: any) => {
      const invDate = formatDateForComparison(inv.invoice_date);
      // Exclude invoices before startDate (invoices on startDate are included)
      if (startDate && startDate !== "" && invDate < startDate) return false;
      // Exclude invoices after endDate (invoices on endDate are included)
      if (endDate && endDate !== "" && invDate > endDate) return false;
      // Include invoice (it's within the date range or on boundary dates)
      return true;
    });
  }, [startDate, endDate, formatDateForComparison]);

  // Helper function to generate chart data based on period
  // Note: Charts use period-based filtering (today, week, month, etc.), not date range
  const generateChartData = useCallback((period: string, invoices: any[]) => {
    const today = new Date();
    
    let periodStart: Date;
    let groupBy: 'hour' | 'day' | 'week' | 'month';
    
    switch (period) {
      case 'today':
        periodStart = new Date(today);
        periodStart.setHours(0, 0, 0, 0);
        groupBy = 'hour';
        break;
      case 'week':
        periodStart = new Date(today);
        periodStart.setDate(periodStart.getDate() - 7);
        groupBy = 'day';
        break;
      case 'month':
        periodStart = new Date(today);
        periodStart.setDate(periodStart.getDate() - 30);
        groupBy = 'day';
        break;
      case 'quarter':
        periodStart = new Date(today);
        periodStart.setMonth(periodStart.getMonth() - 3);
        groupBy = 'week';
        break;
      case 'year':
        periodStart = new Date(today);
        periodStart.setMonth(periodStart.getMonth() - 12);
        groupBy = 'month';
        break;
      default: // 'all'
        groupBy = 'month';
        periodStart = new Date(0);
    }

    const dataMap = new Map<string, { sales: number; purchases: number; profit: number; label: string }>();
    
    invoices.forEach((inv: any) => {
      const invDate = new Date(inv.invoice_date);
      
      // Skip if invoice is before period start
      if (period !== 'all' && invDate < periodStart) return;
      
      let key: string;
      let label: string;
      
      switch (groupBy) {
        case 'hour':
          key = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}-${String(invDate.getDate()).padStart(2, '0')}-${String(invDate.getHours()).padStart(2, '0')}`;
          label = formatDateTimeLebanon(inv.invoice_date, "HH:mm");
          break;
        case 'day':
          key = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}-${String(invDate.getDate()).padStart(2, '0')}`;
          label = formatDateTimeLebanon(inv.invoice_date, "MMM dd");
          break;
        case 'week':
          // Calculate week start (Sunday = 0)
          const weekStart = new Date(invDate);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          weekStart.setHours(0, 0, 0, 0);
          // Use year-month-week format for unique key
          const firstDayOfMonth = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
          const weekNumber = Math.ceil((weekStart.getDate() + firstDayOfMonth.getDay()) / 7);
          key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-W${String(weekNumber).padStart(2, '0')}`;
          label = formatDateTimeLebanon(weekStart, "MMM dd");
          break;
        case 'month':
        default:
          key = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}`;
          label = formatDateTimeLebanon(inv.invoice_date, "MMM yyyy");
          break;
      }
      
      if (!dataMap.has(key)) {
        dataMap.set(key, { sales: 0, purchases: 0, profit: 0, label });
      }
      
      const data = dataMap.get(key)!;
      if (inv.invoice_type === 'sell') {
        data.sales += Number(inv.total_amount) || 0;
      } else {
        data.purchases += Number(inv.total_amount) || 0;
      }
      data.profit = data.sales - data.purchases;
    });
    
    return Array.from(dataMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, []);

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
      
      // Filter invoices by date range
      const filteredAll = filterByDateRange(all || []);
      
      const sales = filteredAll.filter((i: any) => i.invoice_type === "sell");
      const purchases = filteredAll.filter((i: any) => i.invoice_type === "buy");
      
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

      // Calculate actual profit: For each sell invoice item, calculate quantity * (unit_price - cost_at_invoice_date)
      // Fetch daily_stock history up to end_date to get cost at invoice date (need historical costs even if purchases were before startDate)
      let actualProfit = 0;
      try {
        // Only use end_date filter, not start_date, to get all historical costs up to invoice dates
        // This ensures we have cost data for products purchased before the selected date range
        // Request high limit (5000) to ensure we get all historical cost data for profit calculation
        // Note: Backend has max limit of 5000, which should be sufficient for most use cases
        const dailyStockHistory = await inventoryRepo.dailyHistory({
          end_date: endDate || undefined,
          limit: 5000 // Request max limit to get all historical cost data
        });

        // Build a map of (product_id, date) -> avg_cost
        // For each date, we'll use the latest snapshot on or before that date
        const costMap = new Map<string, number>(); // key: "product_id:date" -> avg_cost
        
        // Group by product and date, keeping latest for each date
        const productDateMap = new Map<string, { date: string; avg_cost: number }>();
        // Pre-build product cost arrays for faster lookup (optimization)
        const productCostArrays = new Map<string, Array<{ date: string; avg_cost: number }>>();
        
        (dailyStockHistory || []).forEach((snapshot: any) => {
          const productId = String(snapshot.product_id);
          const date = snapshot.date ? formatDateForComparison(snapshot.date) : '';
          const key = `${productId}:${date}`;
          if (date && snapshot.avg_cost !== undefined) {
            const existing = productDateMap.get(key);
            if (!existing || new Date(snapshot.updated_at || snapshot.created_at) > new Date(existing.date)) {
              productDateMap.set(key, { date, avg_cost: parseFloat(snapshot.avg_cost) || 0 });
              
              // Build sorted cost arrays for each product (optimization)
              if (!productCostArrays.has(productId)) {
                productCostArrays.set(productId, []);
              }
              const costs = productCostArrays.get(productId)!;
              const existingCost = costs.find(c => c.date === date);
              if (!existingCost) {
                costs.push({ date, avg_cost: parseFloat(snapshot.avg_cost) || 0 });
              }
            }
          }
        });
        
        // Sort each product's cost array by date descending for efficient lookup
        productCostArrays.forEach((costs) => {
          costs.sort((a, b) => b.date.localeCompare(a.date));
        });

        // For each sell invoice, calculate profit per item
        sales.forEach((invoice: any) => {
          const invoiceDate = formatDateForComparison(invoice.invoice_date);
          (invoice.invoice_items || []).forEach((item: any) => {
            const productId = String(item.product_id);
            const quantity = parseFloat(item.quantity) || 0;
            // Use effective price (private_price_amount if private, else unit_price)
            const sellPrice = item.is_private_price && item.private_price_amount 
              ? parseFloat(item.private_price_amount) 
              : parseFloat(item.unit_price) || 0;

            // Find cost at invoice date - look for exact date or latest before (optimized lookup)
            let cost = 0;
            const exactKey = `${productId}:${invoiceDate}`;
            if (productDateMap.has(exactKey)) {
              cost = productDateMap.get(exactKey)!.avg_cost;
            } else {
              // Use pre-built sorted cost array for efficient lookup (O(log n) instead of O(n))
              const productCosts = productCostArrays.get(productId);
              if (productCosts && productCosts.length > 0) {
                // Array is already sorted by date descending, find first cost on or before invoice date
                const foundCost = productCosts.find(c => c.date <= invoiceDate);
                if (foundCost) {
                  cost = foundCost.avg_cost;
                } else {
                  // Fallback to current avg_cost if no historical data
                  cost = costsMap.get(productId) || 0;
                }
              } else {
                // Fallback to current avg_cost if no historical data
                cost = costsMap.get(productId) || 0;
              }
            }

            // Profit = quantity * (sell_price - cost)
            const itemProfit = quantity * (sellPrice - cost);
            actualProfit += itemProfit;
          });
        });
      } catch (e) {
        console.error('Failed to calculate actual profit:', e);
        // Fallback to simple calculation if daily_stock fetch fails
        actualProfit = totalSales - totalPurchases;
      }

      setSummary({
        totalSales,
        totalPurchases,
        netProfit: totalSales - totalPurchases, // Simple calculation: Sales - Purchases (for reference)
        actualProfit, // Correct profit calculation: Sum of (quantity × (price - cost)) per item
        averageMargin: totalSales > 0 ? (actualProfit / totalSales) * 100 : 0,
        totalProducts: (products || []).length,
        totalCustomers: (customers || []).length,
        totalSuppliers: (suppliers || []).length,
      });
      
      // Generate chart data based on selected period
      const chartData = generateChartData(chartPeriod, all || []);
      // Ensure chart data uses 'month' key for compatibility with existing chart components
      const formattedChartData = chartData.map(item => ({
        ...item,
        month: item.label
      }));
      setMonthlyData(formattedChartData);
      
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
      filteredAll.forEach((inv: any) => {
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
  }, [toast, t, startDate, endDate, chartPeriod, filterByDateRange, generateChartData]);

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
          ['Profit', `$${summary.actualProfit.toFixed(2)}`],
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
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
              <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                {t("reports.title")}
              </h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {t("reports.subtitle")}
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={exportToPDF} className="gap-1.5 h-7 text-[10px] sm:text-xs">
              <Download className="w-3 h-3" />
              Export PDF
            </Button>
          )}
        </div>

        {/* Date Range Filter for Summary Data */}
        {isAdmin && (
          <Card className="border-2 p-2 sm:p-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="text-xs sm:text-sm font-medium">Filter Summary Data:</span>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <Label htmlFor="start-date-report" className="text-[10px] sm:text-xs whitespace-nowrap">
                    From:
                  </Label>
                  <Input
                    id="start-date-report"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const newStartDate = e.target.value;
                      setStartDate(newStartDate);
                      // If end date is before new start date, update end date
                      if (endDate && newStartDate > endDate) {
                        setEndDate(newStartDate);
                      }
                    }}
                    max={endDate || getTodayLebanon()}
                    className="h-7 text-xs w-32"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="end-date-report" className="text-[10px] sm:text-xs whitespace-nowrap">
                    To:
                  </Label>
                  <Input
                    id="end-date-report"
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      const newEndDate = e.target.value;
                      if (!startDate || newEndDate >= startDate) {
                        setEndDate(newEndDate);
                      }
                    }}
                    min={startDate}
                    max={getTodayLebanon()}
                    className="h-7 text-xs w-32"
                  />
                </div>
                {(startDate || endDate) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                    }}
                    className="h-7 text-xs"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

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
                  <CardTitle className="text-xs sm:text-sm font-medium">Profit</CardTitle>
                  <DollarSign className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent className="px-2.5 pb-2">
                  <div className="text-base sm:text-lg font-bold text-accent">${summary.actualProfit.toFixed(2)}</div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Sum of (quantity × (price - cost)) per item</p>
                </CardContent>
              </Card>
            </div>

            {/* Chart Period Selector */}
            <Card className="border-2 p-2 sm:p-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span className="text-xs sm:text-sm font-medium">Chart Period:</span>
                </div>
                <Select value={chartPeriod} onValueChange={setChartPeriod}>
                  <SelectTrigger className="w-[180px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="quarter">This Quarter</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
              <Card className="border-2">
                <CardHeader className="p-2 sm:p-3 border-b">
                  <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm">
                    <BarChart3 className="w-4 h-4" />
                    Sales & Purchases Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
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
                <CardTitle className="text-xs sm:text-sm">Sales & Purchases Chart</CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-3">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
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
