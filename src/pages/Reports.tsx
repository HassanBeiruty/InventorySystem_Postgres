import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invoicesRepo, productsRepo, productCostsRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { FileText, TrendingUp, TrendingDown, Package } from "lucide-react";

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

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const all = await invoicesRepo.listWithRelations();
      const sales = (all || []).filter((i: any) => i.invoice_type === "sell");
      const purchases = (all || []).filter((i: any) => i.invoice_type === "buy");
      const products = await productsRepo.list();
      
      // Fetch average costs for all products
      const costsMap = new Map<string, number>();
      await Promise.all(
        (products || []).map(async (product: any) => {
          try {
            const costData = await productCostsRepo.getAverageCost(product.id);
            if (costData && costData.average_cost > 0) {
              costsMap.set(product.id, costData.average_cost);
            }
          } catch (e) {
            console.warn(`Failed to fetch cost for product ${product.id}`);
          }
        })
      );
      setProductCosts(costsMap);
      
      const totalSales = sales.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0) || 0;
      const totalPurchases = purchases.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0) || 0;

      setSummary({
        totalSales,
        totalPurchases,
        netProfit: totalSales - totalPurchases,
        actualProfit: 0, // Will be calculated when we have invoice items
        averageMargin: totalSales > 0 ? ((totalSales - totalPurchases) / totalSales) * 100 : 0,
        totalProducts: (products || []).length,
        totalCustomers: 0,
        totalSuppliers: 0,
      });
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
          <p className="text-muted-foreground">Comprehensive business analytics and insights</p>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array(3).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="h-4 w-24 bg-muted rounded"></div>
                  <div className="h-5 w-5 bg-muted rounded"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-32 bg-muted rounded mb-2"></div>
                  <div className="h-3 w-20 bg-muted rounded"></div>
                </CardContent>
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
                  <FileText className="h-5 w-5 text-warning" />
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
                  <p className="text-xs text-muted-foreground">Average margin (Revenue basis)</p>
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
                  <p className="mt-3 text-xs">
                    💡 Tip: Costs are automatically tracked when you create buy invoices. 
                    Products without cost data will use invoice totals for profit calculations.
                  </p>
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
