import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, AlertTriangle } from "lucide-react";
import { inventoryRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";

interface LowStockItem {
  id: string;
  product_id: string;
  available_qty: number;
  date: string;
  products?: {
    name: string;
    barcode: string;
  };
}

const LowStock = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [lowStockProducts, setLowStockProducts] = useState<LowStockItem[]>([]);
  const [threshold, setThreshold] = useState(20);
  const [allInventory, setAllInventory] = useState<LowStockItem[]>([]);

  useEffect(() => {
    fetchLowStock();
  }, []);

  useEffect(() => {
    // Filter based on threshold
    if (allInventory.length > 0) {
      const filtered = allInventory.filter(item => item.available_qty <= threshold);
      setLowStockProducts(filtered);
    }
  }, [threshold, allInventory]);

  const fetchLowStock = async () => {
    setLoading(true);
    try {
      const data = await inventoryRepo.lowStock(1000); // Get all low stock items with high limit
      setAllInventory(data || []);
      const filtered = (data || []).filter((item: LowStockItem) => item.available_qty <= threshold);
      setLowStockProducts(filtered);
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
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-destructive via-warning to-secondary bg-clip-text text-transparent">
              Low Stock Alerts
            </h1>
            <p className="text-muted-foreground">Products with quantity at or below threshold</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="threshold" className="text-sm font-medium whitespace-nowrap">Threshold:</Label>
              <Input
                id="threshold"
                type="number"
                min="1"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 1)}
                className="w-20 h-9"
              />
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 border-2 border-destructive/20">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <span className="font-bold text-lg">{lowStockProducts.length}</span>
              <span className="text-sm text-muted-foreground">alerts</span>
            </div>
          </div>
        </div>

        {/* Low Stock Table */}
        <div className="border-2 rounded-lg overflow-hidden">
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : lowStockProducts.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-success/50" />
                </div>
                <p className="text-muted-foreground text-lg">
                  All products are well stocked! 🎉
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  No products with quantity ≤ {threshold}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-destructive/5 to-warning/5">
                      <TableHead className="font-bold">Product</TableHead>
                      <TableHead className="font-bold">Barcode</TableHead>
                      <TableHead className="text-center font-bold">Available Qty</TableHead>
                      <TableHead className="text-center font-bold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStockProducts.map((item, idx) => {
                      const isCritical = item.available_qty <= threshold * 0.5; // 50% or less of threshold is critical
                      
                      return (
                        <TableRow 
                          key={item.id} 
                          className={`hover:bg-destructive/5 transition-colors animate-fade-in ${
                            isCritical ? 'bg-destructive/5' : ''
                          }`}
                          style={{ animationDelay: `${idx * 0.05}s` }}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {isCritical && (
                                <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />
                              )}
                              <span className="text-muted-foreground text-sm">#{item.product_id}</span> {item.products?.name || 'Unknown Product'}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.products?.barcode || 'N/A'}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`text-lg font-bold ${
                              isCritical ? 'text-destructive' : 'text-warning'
                            }`}>
                              {item.available_qty}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant="outline" 
                              className={
                                isCritical 
                                  ? 'bg-destructive/10 text-destructive border-destructive/30' 
                                  : 'bg-warning/10 text-warning border-warning/30'
                              }
                            >
                              {isCritical ? '🚨 Critical' : '⚠ Low'}
                            </Badge>
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

export default LowStock;

