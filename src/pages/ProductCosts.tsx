import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, TrendingDown, Filter, X, Search } from "lucide-react";
import { formatDateTimeLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { productCostsRepo, productsRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import ProductNameWithCode from "@/components/ProductNameWithCode";

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
  const [searchQuery, setSearchQuery] = useState<string>("");
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
      const [costsData, prodsResponse] = await Promise.all([
        productCostsRepo.listAll({}),
        productsRepo.list({ limit: 1000 }),
      ]);
      const prods = Array.isArray(prodsResponse) ? prodsResponse : prodsResponse.data;
      
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

  // Group costs by product for summary view - use useMemo to recalculate when costs or products change
  const productSummaryArray = useMemo(() => {
    const productSummary = costs.reduce((acc: any, row) => {
      if (!acc[row.product_id]) {
        // Find full product data from products list to get barcode/sku and category
        const fullProduct = products.find((p: any) => String(p.id) === String(row.product_id));
        acc[row.product_id] = {
          product_name: row.product_name,
          product_id: row.product_id,
          name: row.product_name, // Add name for ProductNameWithCode
          barcode: fullProduct?.barcode || null,
          sku: fullProduct?.sku || null,
          category_name: fullProduct?.category_name || null,
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
    return Object.values(productSummary);
  }, [costs, products]);

  const filteredSummary = productSummaryArray.filter((item: any) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const productName = (item.product_name || "").toLowerCase();
      const productId = (item.product_id || "").toString();
      return productName.includes(query) || productId.includes(query);
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              💰 Product Costs History
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Track purchase costs from all suppliers</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1.5 h-8 text-xs"
          >
            <Filter className="w-3.5 h-3.5" />
            {showFilters ? "Hide Filters" : "Show Filters"}
          </Button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="border-2 rounded-lg p-2 sm:p-3 bg-muted/20">
            <div className="grid gap-2 sm:gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={filters.product_id} onValueChange={(value) => setFilters({...filters, product_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All products" />
                  </SelectTrigger>
                  <SelectContent side="bottom" align="start">
                    <SelectItem value="all">All products</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <ProductNameWithCode 
                          product={product}
                          showId={true}
                          id={product.id}
                        />
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
                  onChange={(e) => {
                    const newStartDate = e.target.value;
                    setFilters({...filters, start_date: newStartDate});
                    // If end date is before new start date, update end date
                    if (filters.end_date && newStartDate > filters.end_date) {
                      setFilters({...filters, start_date: newStartDate, end_date: newStartDate});
                    }
                  }}
                  max={filters.end_date || getTodayLebanon()}
                />
              </div>
              
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) => {
                    const newEndDate = e.target.value;
                    if (!filters.start_date || newEndDate >= filters.start_date) {
                      setFilters({...filters, end_date: newEndDate});
                    }
                  }}
                  min={filters.start_date}
                  max={getTodayLebanon()}
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-2">
              <Button onClick={applyFilters} className="h-8 text-xs">Apply Filters</Button>
              <Button variant="outline" onClick={clearFilters} className="h-8 text-xs">
                <X className="w-3.5 h-3.5 mr-1.5" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid gap-2 sm:gap-3 md:grid-cols-5">
          {loading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="border rounded-lg p-2 animate-pulse">
                <div className="h-3 w-16 bg-muted rounded mb-1.5"></div>
                <div className="h-5 w-20 bg-muted rounded"></div>
              </div>
            ))
          ) : (
            <>
              <div className="border rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-[10px] font-medium text-muted-foreground">Total Value</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-destructive">${stats.totalValue.toFixed(2)}</div>
              </div>

              <div className="border rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-medium text-muted-foreground">Quantity</span>
                </div>
                <div className="text-base sm:text-lg font-bold">{stats.totalQuantity}</div>
              </div>

              <div className="border rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingDown className="w-3.5 h-3.5 text-warning" />
                  <span className="text-[10px] font-medium text-muted-foreground">Weighted Avg Cost</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-warning">${stats.averageCost.toFixed(2)}</div>
              </div>

              <div className="border rounded-lg p-2">
                <span className="text-[10px] font-medium text-muted-foreground mb-1 block">Products</span>
                <div className="text-base sm:text-lg font-bold">{stats.uniqueProducts}</div>
              </div>

              {/* Supplier metric removed */}
            </>
          )}
        </div>

        {/* Product Summary Table */}
        <div className="border-2 rounded-lg overflow-hidden">
          <div className="border-b bg-gradient-to-br from-warning/5 to-accent/5 p-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm sm:text-base font-bold">
                  <DollarSign className="w-4 h-4 text-warning" />
                  Product Avg Cost Summary
                </h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Based on daily_stock snapshots</p>
              </div>
              <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search products (name, ID)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-8 h-8 text-sm"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="p-2">
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
            ) : filteredSummary.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg">No products found matching your search</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-warning/5 to-accent/5">
                      <TableHead className="font-bold p-2 pl-2 text-xs w-[35%]">Product</TableHead>
                      <TableHead className="font-bold p-2 text-xs w-[15%]">Category</TableHead>
                      <TableHead className="text-center font-bold p-2 text-xs w-[12%]">Quantity</TableHead>
                      <TableHead className="text-right font-bold p-2 text-xs w-[13%]">Avg Cost</TableHead>
                      <TableHead className="text-right font-bold p-2 text-xs w-[15%]">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSummary.map((item: any, idx: number) => (
                      <TableRow 
                        key={item.product_id}
                        className="hover:bg-warning/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.02}s` }}
                      >
                        <TableCell className="font-semibold p-2 pl-2 text-sm">
                          <ProductNameWithCode 
                            product={item}
                            showId={true}
                            product_id={item.product_id}
                            nameClassName="text-sm"
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs p-2">
                          {item.category_name || "-"}
                        </TableCell>
                        <TableCell className="text-center font-bold text-sm p-2">{item.total_quantity}</TableCell>
                        <TableCell className="text-right font-bold text-warning text-sm p-2">
                          ${item.average_cost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-destructive text-sm p-2">
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
      </div>
    </DashboardLayout>
  );
};

export default ProductCosts;

