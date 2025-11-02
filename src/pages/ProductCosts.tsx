import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, TrendingDown, Filter, X } from "lucide-react";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { productCostsRepo, productsRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";

const ProductCosts = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [costs, setCosts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    product_id: "all",
    start_date: "",
    end_date: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState({
    totalValue: 0,
    totalQuantity: 0,
    averageCost: 0,
    uniqueProducts: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [costsData, prods] = await Promise.all([
        productCostsRepo.listAll({}),
        productsRepo.list(),
      ]);
      
      setCosts(costsData || []);
      setProducts(prods || []);
      calculateStats(costsData || []);
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

  const applyFilters = async () => {
    setLoading(true);
    try {
      const filterObj: any = {};
      if (filters.product_id && filters.product_id !== "all") filterObj.product_id = filters.product_id;
      if (filters.start_date) filterObj.start_date = filters.start_date;
      if (filters.end_date) filterObj.end_date = filters.end_date;
      
      const costsData = await productCostsRepo.listAll(filterObj);
      setCosts(costsData || []);
      calculateStats(costsData || []);
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

  const clearFilters = () => {
    setFilters({ product_id: "all", start_date: "", end_date: "" });
    fetchData();
  };

  const calculateStats = (rows: any[]) => {
    const totalValue = rows.reduce((sum, r) => sum + (parseFloat(r.avg_cost) * parseInt(r.available_qty)), 0);
    const totalQuantity = rows.reduce((sum, r) => sum + parseInt(r.available_qty), 0);
    const averageCost = totalQuantity > 0 ? totalValue / totalQuantity : 0;
    const uniqueProducts = new Set(rows.map(r => r.product_id)).size;
    setStats({ totalValue, totalQuantity, averageCost, uniqueProducts });
  };

  // Group costs by product for summary view
  const productSummary = costs.reduce((acc: any, row) => {
    if (!acc[row.product_id]) {
      acc[row.product_id] = {
        product_name: row.product_name,
        product_id: row.product_id,
        total_value: 0,
        total_quantity: 0,
        average_cost: 0,
        snapshot_count: 0,
      };
    }
    acc[row.product_id].total_value += parseFloat(row.avg_cost) * parseInt(row.available_qty);
    acc[row.product_id].total_quantity += parseInt(row.available_qty);
    acc[row.product_id].snapshot_count += 1;
    acc[row.product_id].average_cost = acc[row.product_id].total_quantity > 0 ? (acc[row.product_id].total_value / acc[row.product_id].total_quantity) : 0;
    return acc;
  }, {} as any);

  const productSummaryArray = Object.values(productSummary);

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              Product Costs History
            </h1>
            <p className="text-muted-foreground">Track purchase costs from all suppliers</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            {showFilters ? "Hide Filters" : "Show Filters"}
          </Button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="border-2 rounded-lg p-4 bg-muted/20">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={filters.product_id} onValueChange={(value) => setFilters({...filters, product_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <span className="text-muted-foreground text-xs">#{product.id}</span> {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={filters.start_date}
                  onChange={(e) => setFilters({...filters, start_date: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) => setFilters({...filters, end_date: e.target.value})}
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button onClick={applyFilters}>Apply Filters</Button>
              <Button variant="outline" onClick={clearFilters}>
                <X className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid gap-3 md:grid-cols-5">
          {loading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="border rounded-lg p-3 animate-pulse">
                <div className="h-4 w-20 bg-muted rounded mb-2"></div>
                <div className="h-6 w-24 bg-muted rounded"></div>
              </div>
            ))
          ) : (
            <>
              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-destructive" />
                  <span className="text-xs font-medium text-muted-foreground">Total Value</span>
                </div>
                <div className="text-xl font-bold text-destructive">${stats.totalValue.toFixed(2)}</div>
              </div>

              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Quantity</span>
                </div>
                <div className="text-xl font-bold">{stats.totalQuantity}</div>
              </div>

              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-warning" />
                  <span className="text-xs font-medium text-muted-foreground">Weighted Avg Cost</span>
                </div>
                <div className="text-xl font-bold text-warning">${stats.averageCost.toFixed(2)}</div>
              </div>

              <div className="border rounded-lg p-3">
                <span className="text-xs font-medium text-muted-foreground mb-1 block">Products</span>
                <div className="text-xl font-bold">{stats.uniqueProducts}</div>
              </div>

              {/* Supplier metric removed */}
            </>
          )}
        </div>

        {/* Product Summary Table */}
        <div className="border-2 rounded-lg overflow-hidden">
          <div className="border-b bg-gradient-to-br from-warning/5 to-accent/5 p-4">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <DollarSign className="w-5 h-5 text-warning" />
              Product Avg Cost Summary
            </h3>
            <p className="text-sm text-muted-foreground">Based on daily_stock snapshots</p>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : productSummaryArray.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg">No snapshots found</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-warning/5 to-accent/5">
                      <TableHead className="font-bold">Product</TableHead>
                      <TableHead className="text-center font-bold">Quantity</TableHead>
                      <TableHead className="text-right font-bold">Avg Cost</TableHead>
                      <TableHead className="text-right font-bold">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productSummaryArray.map((item: any, idx: number) => (
                      <TableRow 
                        key={item.product_id}
                        className="hover:bg-warning/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.02}s` }}
                      >
                        <TableCell className="font-semibold"><span className="text-muted-foreground text-sm">#{item.product_id}</span> {item.product_name}</TableCell>
                        <TableCell className="text-center font-bold text-lg">{item.total_quantity}</TableCell>
                        <TableCell className="text-right font-bold text-warning text-lg">
                          ${item.average_cost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-destructive text-lg">
                          ${item.total_value.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* Detailed Snapshots Table */}
        <div className="border-2 rounded-lg overflow-hidden">
          <div className="border-b bg-gradient-to-br from-primary/5 to-accent/5 p-4">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <TrendingDown className="w-5 h-5 text-primary" />
              Daily Avg Cost Snapshots
            </h3>
            <p className="text-sm text-muted-foreground">Per-product snapshots from daily_stock</p>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {Array(10).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : costs.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg">No snapshots found</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5">
                      <TableHead className="font-bold">Date</TableHead>
                      <TableHead className="font-bold">Product</TableHead>
                      <TableHead className="text-center font-bold">Quantity</TableHead>
                      <TableHead className="text-right font-bold">Avg Cost</TableHead>
                      <TableHead className="text-right font-bold">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costs.map((row, idx) => {
                      const totalValue = parseFloat(row.avg_cost) * parseInt(row.available_qty);
                      return (
                        <TableRow 
                          key={`${row.product_id}-${row.date}-${idx}`}
                          className="hover:bg-primary/5 transition-colors animate-fade-in"
                          style={{ animationDelay: `${idx * 0.01}s` }}
                        >
                          <TableCell className="text-sm">
                            {formatDateTimeLebanon(row.date, "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell className="font-semibold">{row.product_name}</TableCell>
                          <TableCell className="text-center font-medium">{row.available_qty}</TableCell>
                          <TableCell className="text-right font-semibold text-warning">
                            ${parseFloat(row.avg_cost).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-bold text-destructive">
                            ${totalValue.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProductCosts;

