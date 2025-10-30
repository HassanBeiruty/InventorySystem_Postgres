import { useEffect, useState } from "react";
import { inventoryRepo } from "@/integrations/api/repo";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface InventoryItem {
  id: string;
  product_id: string;
  available_qty: number;
  date: string;
  created_at: string;
  updated_at: string;
  products?: {
    name: string;
    barcode: string;
    wholesale_price: number;
    retail_price: number;
  };
}

const Inventory = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const data = await inventoryRepo.today();
      setInventory((data as any[]) || []);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStockStatus = (qty: number) => {
    if (qty === 0) return { label: "Out of Stock", variant: "destructive" as const };
    if (qty < 10) return { label: "Low Stock", variant: "secondary" as const };
    return { label: "In Stock", variant: "default" as const };
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              Inventory - Today's Position
            </h1>
            <p className="text-muted-foreground text-lg">Current stock levels as of {format(new Date(), "MMMM dd, yyyy")}</p>
          </div>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <div className="p-6 border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Daily Stock Snapshot</h2>
                <p className="text-sm text-muted-foreground">Real-time inventory from DailyStock table</p>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : inventory.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-primary/50" />
                </div>
                <p className="text-muted-foreground text-lg">No inventory data available for today</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border-2">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10">
                      <TableHead className="font-bold">Product</TableHead>
                      <TableHead className="font-bold">Barcode</TableHead>
                      <TableHead className="text-center font-bold">Available Qty</TableHead>
                      <TableHead className="text-center font-bold">Status</TableHead>
                      <TableHead className="text-right font-bold">Wholesale Price</TableHead>
                      <TableHead className="text-right font-bold">Retail Price</TableHead>
                      <TableHead className="font-bold">Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory.map((item, idx) => {
                      const status = getStockStatus(item.available_qty);
                      return (
                        <TableRow 
                          key={item.id} 
                          className="hover:bg-primary/5 transition-colors animate-fade-in"
                          style={{ animationDelay: `${idx * 0.03}s` }}
                        >
                          <TableCell className="font-semibold">
                            {item.products?.name || "Unknown Product"}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {item.products?.barcode || "N/A"}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              {item.available_qty === 0 && (
                                <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />
                              )}
                              <span className={`font-bold text-lg ${item.available_qty === 0 ? 'text-destructive' : item.available_qty < 10 ? 'text-warning' : 'text-success'}`}>
                                {item.available_qty}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={status.variant} className="font-medium">{status.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-success">
                            ${item.products?.wholesale_price.toFixed(2) || "0.00"}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            ${item.products?.retail_price.toFixed(2) || "0.00"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(item.updated_at), "MMM dd, yyyy")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Inventory;
