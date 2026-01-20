import { useEffect, useState, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invoicesRepo, productsRepo, productCostsRepo, customersRepo, suppliersRepo, reportsRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { FileText, TrendingUp, TrendingDown, Package, Download, BarChart3, DollarSign, AlertCircle, Calendar, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const [dailyProfitDialogOpen, setDailyProfitDialogOpen] = useState(false);
  const [dailyProfitData, setDailyProfitData] = useState<any[]>([]);
  const [dailyProfitLoading, setDailyProfitLoading] = useState(false);
  const [supplierPurchasesDialogOpen, setSupplierPurchasesDialogOpen] = useState(false);
  const [supplierPurchasesData, setSupplierPurchasesData] = useState<any[]>([]);
  const [supplierPurchasesLoading, setSupplierPurchasesLoading] = useState(false);
  const [customerSalesDialogOpen, setCustomerSalesDialogOpen] = useState(false);
  const [customerSalesData, setCustomerSalesData] = useState<any[]>([]);
  const [customerSalesLoading, setCustomerSalesLoading] = useState(false);
  const [dateFiltersInitialized, setDateFiltersInitialized] = useState(false);
  
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

  // Function to fetch supplier purchases breakdown
  const handleShowSupplierPurchases = useCallback(async () => {
    setSupplierPurchasesDialogOpen(true);
    setSupplierPurchasesLoading(true);
    setSupplierPurchasesData([]);
    
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('auth_token');
      
      const url = API_BASE_URL 
        ? `${API_BASE_URL.replace(/\/$/, '')}/api/reports/supplier-purchases`
        : '/api/reports/supplier-purchases';
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch supplier purchases data');
      }
      
      const data = await response.json();
      setSupplierPurchasesData(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch supplier purchases data",
        variant: "destructive",
      });
    } finally {
      setSupplierPurchasesLoading(false);
    }
  }, [toast]);

  // Function to fetch customer sales breakdown
  const handleShowCustomerSales = useCallback(async () => {
    setCustomerSalesDialogOpen(true);
    setCustomerSalesLoading(true);
    setCustomerSalesData([]);
    
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('auth_token');
      
      const url = API_BASE_URL 
        ? `${API_BASE_URL.replace(/\/$/, '')}/api/reports/customer-sales`
        : '/api/reports/customer-sales';
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch customer sales data');
      }
      
      const data = await response.json();
      setCustomerSalesData(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch customer sales data",
        variant: "destructive",
      });
    } finally {
      setCustomerSalesLoading(false);
    }
  }, [toast]);

  const handleShowDailyProfit = useCallback(async () => {
    // Determine effective date range - use filtered dates or default to last 30 days
    let effectiveStartDate: string;
    let effectiveEndDate: string;
    
    if (startDate && startDate !== "") {
      effectiveStartDate = startDate;
      effectiveEndDate = (endDate && endDate !== "") ? endDate : getTodayLebanon();
    } else {
      // Default to last 30 days if no date range is set
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      effectiveStartDate = formatDateForComparison(thirtyDaysAgo);
      effectiveEndDate = formatDateForComparison(today);
    }
    
    // Parse dates correctly (YYYY-MM-DD format)
    const startParts = effectiveStartDate.split('-');
    const endParts = effectiveEndDate.split('-');
    const start = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));
    const end = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));
    
    // Check if date range is too large (more than 365 days)
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    if (daysDiff > 365) {
      toast({
        title: "Date Range Too Large",
        description: "Please select a date range of 365 days or less for daily profit breakdown",
        variant: "destructive",
      });
      return;
    }
    
    setDailyProfitDialogOpen(true);
    setDailyProfitLoading(true);
    setDailyProfitData([]);
    
    try {
      // Generate array of dates between start and end date (inclusive)
      const dates: string[] = [];
      const currentDate = new Date(start);
      currentDate.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      while (currentDate <= end) {
        const dateStr = formatDateForComparison(currentDate);
        dates.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Fetch profit for each day using the stored procedure
      const dailyData = await Promise.all(
        dates.map(async (date) => {
          try {
            const result = await reportsRepo.getNetProfit(date, date);
            return {
              date: date,
              net_profit: parseFloat(String(result.net_profit || 0)),
              total_revenue: parseFloat(String(result.total_revenue || 0)),
              total_cost: parseFloat(String(result.total_cost || 0)),
            };
          } catch (error) {
            console.error(`Error fetching profit for ${date}:`, error);
            return {
              date: date,
              net_profit: 0,
              total_revenue: 0,
              total_cost: 0,
            };
          }
        })
      );
      
      setDailyProfitData(dailyData);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch daily profit data",
        variant: "destructive",
      });
    } finally {
      setDailyProfitLoading(false);
    }
  }, [startDate, endDate, toast, formatDateForComparison]);

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
      
      // Total Sales and Total Purchases: Always calculate from ALL invoices (since inception), NOT filtered by date
      const allSales = (all || []).filter((i: any) => i.invoice_type === "sell");
      const allPurchases = (all || []).filter((i: any) => i.invoice_type === "buy");
      const totalSales = allSales.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0) || 0;
      const totalPurchases = allPurchases.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0) || 0;
      
      // Filter invoices by date range (only for charts and other filtered views, NOT for total sales/purchases)
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
      
      // Calculate net profit using stored procedure (get_net_profit) - same logic as manual invoice creation
      // This uses daily_stock to get cost at invoice date for accurate profit calculation
      let actualProfit = 0;
      let netProfitRevenue = 0;
      let netProfitCost = 0;
      try {
        // Use stored procedure to calculate net profit if startDate is provided
        // If endDate is empty, default to today
        const effectiveEndDate = (endDate && endDate !== "") ? endDate : getTodayLebanon();
        
        if (startDate && startDate !== "") {
          const netProfitResult = await reportsRepo.getNetProfit(startDate, effectiveEndDate);
          actualProfit = parseFloat(String(netProfitResult.net_profit)) || 0;
          netProfitRevenue = parseFloat(String(netProfitResult.total_revenue)) || 0;
          netProfitCost = parseFloat(String(netProfitResult.total_cost)) || 0;
        } else {
          // Fallback: if no date range, use simple calculation
          actualProfit = totalSales - totalPurchases;
        }
      } catch (e) {
        console.error('Failed to calculate net profit using stored procedure:', e);
        // Fallback to simple calculation if stored procedure fails
        actualProfit = totalSales - totalPurchases;
      }

      setSummary({
        totalSales, // Always from all invoices (since inception)
        totalPurchases, // Always from all invoices (since inception)
        netProfit: totalSales - totalPurchases, // Simple calculation: All Sales - All Purchases (since inception, not filtered by date)
        actualProfit, // Profit from stored procedure: Sum of (quantity × (price - cost)) per item, FILTERED BY DATE
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

  // Initialize date filters: startDate = min sell invoice date, endDate = today
  // If min date is more than 3 months ago, use 2.5 months before today instead
  useEffect(() => {
    if (!isAdmin || isAdminLoading || dateFiltersInitialized) return;
    
    const initializeDateFilters = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || '';
        const token = localStorage.getItem('auth_token');
        
        const url = API_BASE_URL 
          ? `${API_BASE_URL.replace(/\/$/, '')}/api/reports/min-sell-date`
          : '/api/reports/min-sell-date';
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        const today = getTodayLebanon();
        let finalStartDate = today;
        
        if (response.ok) {
          const data = await response.json();
          const minDate = data.min_date || today;
          
          // Calculate 3 months ago (approximately 90 days) and 2.5 months ago (approximately 75 days)
          const todayDate = new Date(today);
          const threeMonthsAgo = new Date(todayDate);
          threeMonthsAgo.setDate(todayDate.getDate() - 90); // 3 months ≈ 90 days
          
          const twoAndHalfMonthsAgo = new Date(todayDate);
          twoAndHalfMonthsAgo.setDate(todayDate.getDate() - 75); // 2.5 months ≈ 75 days
          
          const minDateObj = new Date(minDate);
          
          // If minimum date is more than 3 months ago, use 2.5 months ago instead
          if (minDateObj < threeMonthsAgo) {
            finalStartDate = formatDateForComparison(twoAndHalfMonthsAgo);
          } else {
            // Use the minimum sell invoice date
            finalStartDate = minDate;
          }
        } else {
          // Fallback: if API fails, use 2.5 months ago as start date
          const todayDate = new Date(today);
          const twoAndHalfMonthsAgo = new Date(todayDate);
          twoAndHalfMonthsAgo.setDate(todayDate.getDate() - 75);
          finalStartDate = formatDateForComparison(twoAndHalfMonthsAgo);
        }
        
        setStartDate(finalStartDate);
        // Always set endDate to today
        setEndDate(today);
        setDateFiltersInitialized(true);
      } catch (error) {
        console.error('Failed to fetch min sell date:', error);
        // Fallback: set start date to 2.5 months ago, end date to today
        const today = getTodayLebanon();
        const todayDate = new Date(today);
        const twoAndHalfMonthsAgo = new Date(todayDate);
        twoAndHalfMonthsAgo.setDate(todayDate.getDate() - 75);
        setStartDate(formatDateForComparison(twoAndHalfMonthsAgo));
        setEndDate(today);
        setDateFiltersInitialized(true);
      }
    };
    
    initializeDateFilters();
  }, [isAdmin, isAdminLoading, dateFiltersInitialized, formatDateForComparison]);

  useEffect(() => {
    if (!isAdmin || isAdminLoading || !dateFiltersInitialized) return;
    fetchReports();
  }, [isAdmin, isAdminLoading, fetchReports, startDate, endDate, dateFiltersInitialized]);

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
              <Card 
                className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 border-2 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={handleShowCustomerSales}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-2 px-2.5">
                  <CardTitle className="text-xs sm:text-sm font-medium">Total Sales</CardTitle>
                  <TrendingUp className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent className="px-2.5 pb-2">
                  <div className="text-base sm:text-lg font-bold text-success">${summary.totalSales.toFixed(2)}</div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Revenue from sell invoices (all-time)</p>
                  <p className="text-[9px] text-muted-foreground mt-1 italic">Click to view by customer</p>
                </CardContent>
              </Card>

              <Card 
                className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20 border-2 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={handleShowSupplierPurchases}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-2 px-2.5">
                  <CardTitle className="text-xs sm:text-sm font-medium">Total Purchases</CardTitle>
                  <TrendingDown className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent className="px-2.5 pb-2">
                  <div className="text-base sm:text-lg font-bold text-destructive">${summary.totalPurchases.toFixed(2)}</div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Cost from buy invoices (all-time)</p>
                  <p className="text-[9px] text-muted-foreground mt-1 italic">Click to view by supplier</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20 border-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-2 px-2.5">
                  <CardTitle className="text-xs sm:text-sm font-medium">Net Profit</CardTitle>
                  <DollarSign className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent className="px-2.5 pb-2">
                  <div className="text-base sm:text-lg font-bold text-warning">${summary.netProfit.toFixed(2)}</div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">All sales minus all purchases (since inception)</p>
                </CardContent>
              </Card>

              <Card 
                className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20 border-2 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={handleShowDailyProfit}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-2 px-2.5">
                  <CardTitle className="text-xs sm:text-sm font-medium">Profit</CardTitle>
                  <DollarSign className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent className="px-2.5 pb-2">
                  <div className="text-base sm:text-lg font-bold text-accent">${summary.actualProfit.toFixed(2)}</div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Sum of (quantity × (price - cost)) per item {startDate ? `(${startDate}${endDate ? ` - ${endDate}` : ' - today'})` : '(filtered by date range)'}</p>
                  <p className="text-[9px] text-muted-foreground mt-1 italic">Click to view daily breakdown</p>
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

        {/* Daily Profit Breakdown Dialog */}
        <Dialog open={dailyProfitDialogOpen} onOpenChange={setDailyProfitDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Daily Profit Breakdown</DialogTitle>
              <DialogDescription>
                Net profit calculated day by day using get_net_profit function
                {dailyProfitData.length > 0 && (
                  <span className="block mt-1 text-xs">
                    {dailyProfitData[0]?.date} to {dailyProfitData[dailyProfitData.length - 1]?.date}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            
            {dailyProfitLoading ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : dailyProfitData.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs text-right">Total Revenue</TableHead>
                      <TableHead className="text-xs text-right">Total Cost</TableHead>
                      <TableHead className="text-xs text-right">Net Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyProfitData.map((day, idx) => {
                      const dateObj = new Date(day.date);
                      const formattedDate = dateObj.toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric',
                        weekday: 'short'
                      });
                      
                      return (
                        <TableRow key={idx} className={Number(day.net_profit) === 0 ? 'opacity-50' : ''}>
                          <TableCell className="text-xs font-medium">{formattedDate}</TableCell>
                          <TableCell className="text-xs text-right">${Number(day.total_revenue).toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right">${Number(day.total_cost).toFixed(2)}</TableCell>
                          <TableCell className={`text-xs text-right font-bold ${Number(day.net_profit) >= 0 ? 'text-success' : 'text-destructive'}`}>
                            ${Number(day.net_profit).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="p-3 border-t bg-muted/50">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">Total:</span>
                    <span className={`font-bold ${dailyProfitData.reduce((sum, d) => sum + Number(d.net_profit), 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                      ${dailyProfitData.reduce((sum, d) => sum + Number(d.net_profit), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <p>No data available for the selected date range.</p>
                <p className="text-xs mt-2">Please select a date range to view daily profit breakdown.</p>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setDailyProfitDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Customer Sales Breakdown Dialog */}
        <Dialog open={customerSalesDialogOpen} onOpenChange={setCustomerSalesDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Customer Sales Breakdown</DialogTitle>
              <DialogDescription>
                Total sales to each customer (all-time, not filtered by date)
              </DialogDescription>
            </DialogHeader>
            
            {customerSalesLoading ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : customerSalesData.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs text-right">Invoice Count</TableHead>
                      <TableHead className="text-xs text-right">Total Sales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerSalesData.map((customer: any, idx: number) => (
                      <TableRow key={customer.customer_id || idx}>
                        <TableCell className="text-xs font-medium">{customer.customer_name || 'Unknown Customer'}</TableCell>
                        <TableCell className="text-xs text-right">{customer.invoice_count || 0}</TableCell>
                        <TableCell className="text-xs text-right font-bold text-success">
                          ${Number(customer.total_sales).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="p-3 border-t bg-muted/50">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">Total:</span>
                    <span className="font-bold text-success">
                      ${customerSalesData.reduce((sum, c) => sum + Number(c.total_sales), 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                    <span>Customers: {customerSalesData.length}</span>
                    <span>Total Invoices: {customerSalesData.reduce((sum, c) => sum + Number(c.invoice_count), 0)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <p>No sales data available.</p>
                <p className="text-xs mt-2">No sell invoices found for any customers.</p>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setCustomerSalesDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Supplier Purchases Breakdown Dialog */}
        <Dialog open={supplierPurchasesDialogOpen} onOpenChange={setSupplierPurchasesDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Supplier Purchases Breakdown</DialogTitle>
              <DialogDescription>
                Total purchases from each supplier (all-time, not filtered by date)
              </DialogDescription>
            </DialogHeader>
            
            {supplierPurchasesLoading ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : supplierPurchasesData.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Supplier</TableHead>
                      <TableHead className="text-xs text-right">Invoice Count</TableHead>
                      <TableHead className="text-xs text-right">Total Purchases</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplierPurchasesData.map((supplier: any, idx: number) => (
                      <TableRow key={supplier.supplier_id || idx}>
                        <TableCell className="text-xs font-medium">{supplier.supplier_name || 'Unknown Supplier'}</TableCell>
                        <TableCell className="text-xs text-right">{supplier.invoice_count || 0}</TableCell>
                        <TableCell className="text-xs text-right font-bold text-destructive">
                          ${Number(supplier.total_purchases).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="p-3 border-t bg-muted/50">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">Total:</span>
                    <span className="font-bold text-destructive">
                      ${supplierPurchasesData.reduce((sum, s) => sum + Number(s.total_purchases), 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                    <span>Suppliers: {supplierPurchasesData.length}</span>
                    <span>Total Invoices: {supplierPurchasesData.reduce((sum, s) => sum + Number(s.invoice_count), 0)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <p>No purchase data available.</p>
                <p className="text-xs mt-2">No buy invoices found for any suppliers.</p>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setSupplierPurchasesDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
