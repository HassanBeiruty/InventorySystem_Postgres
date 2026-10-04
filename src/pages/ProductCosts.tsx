import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { StatTile } from "@/components/page-ui/StatTile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, TrendingDown, Filter, X, Search, Wallet } from "lucide-react";
import { formatDateTimeLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { productCostsRepo, productsRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import ProductNameWithCode from "@/components/ProductNameWithCode";
import ProductCombobox from "@/components/ProductCombobox";
import { useDebounce } from "@/hooks/useDebounce";

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
  const debouncedSearchQuery = useDebounce(searchQuery, 400);
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
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      const productName = (item.product_name || "").toLowerCase();
      const productId = (item.product_id || "").toString();
      return productName.includes(query) || productId.includes(query);
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <InvoicePageHeader
          icon={Wallet}
          title="Product Costs History"
          description="Track purchase costs from all suppliers"
          actions={
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1.5 h-8 text-[12px]"
          >
            <Filter className="w-3.5 h-3.5" />
            {showFilters ? "Hide Filters" : "Show Filters"}
          </Button>
          }
        />

        {/* Filters */}
        {showFilters && (
          <div className="border-2 border-border rounded-xl p-3 bg-card">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-[11px] font-medium">Product</Label>
                <ProductCombobox
                  products={products}
                  value={filters.product_id}
                  onValueChange={(value) => setFilters({...filters, product_id: value})}
                  includeAllOption
                  allLabel="All products"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-[11px] font-medium">Start Date</Label>
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
                  className="h-8 text-[13px]"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-[11px] font-medium">End Date</Label>
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
                  className="h-8 text-[13px]"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-2">
              <Button onClick={applyFilters} className="h-8 text-[12px]">Apply Filters</Button>
              <Button variant="outline" onClick={clearFilters} className="h-8 text-[12px]">
                <X className="w-3.5 h-3.5 me-1.5" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          {loading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="border border-border rounded-xl px-2.5 py-2 animate-pulse">
                <div className="h-3 w-16 bg-muted rounded mb-1.5"></div>
                <div className="h-5 w-20 bg-muted rounded"></div>
              </div>
            ))
          ) : (
            <>
              <StatTile icon={DollarSign} tone="destructive" label="Total Value" value={`$${stats.totalValue.toFixed(2)}`} />
              <StatTile icon={TrendingUp} tone="primary" label="Quantity" value={stats.totalQuantity} />
              <StatTile icon={TrendingDown} tone="warning" label="Weighted Avg Cost" value={`$${stats.averageCost.toFixed(2)}`} />
              <StatTile label="Products" value={stats.uniqueProducts} />

              {/* Supplier metric removed */}
            </>
          )}
        </div>

        {/* Product Summary Table */}
        <SectionCard
          icon={DollarSign}
          title="Product Avg Cost Summary"
          description="Based on daily_stock snapshots"
        >
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute start-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search products (name, ID)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ps-8 pe-8 h-8 text-[13px]"
                autoFocus
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  className="absolute end-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
            {loading ? (
              <div className="space-y-3">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : productSummaryArray.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-[13px]">No snapshots found</p>
              </div>
            ) : filteredSummary.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-[13px]">No products found matching your search</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="scroll-x">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[35%]">Product</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[15%]">Category</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[12%]">Quantity</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[13%]">Avg Cost</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[15%]">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSummary.map((item: any, idx: number) => (
                      <TableRow 
                        key={item.product_id}
                        className="hover:bg-primary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.02}s` }}
                      >
                        <TableCell className="font-semibold p-2 ps-2 text-[13px]">
                          <ProductNameWithCode 
                            product={item}
                            showId={true}
                            product_id={item.product_id}
                            nameClassName="text-[13px]"
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[12px] p-2">
                          {item.category_name || "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold text-[13px] tabular-nums p-2">{item.total_quantity}</TableCell>
                        <TableCell className="text-right font-bold text-warning-strong text-[13px] tabular-nums p-2">
                          ${item.average_cost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-destructive-strong text-[13px] tabular-nums p-2">
                          ${item.total_value.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
            )}
        </SectionCard>
      </div>
    </DashboardLayout>
  );
};

export default ProductCosts;

