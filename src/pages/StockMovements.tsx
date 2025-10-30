import { useEffect, useState } from "react";
import { stockRepo } from "@/integrations/api/repo";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Package } from "lucide-react";
import { format } from "date-fns";

interface StockMovement {
  id: string;
  product_id: string;
  invoice_id: string;
  invoice_date: string;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  created_at: string;
  products?: {
    name: string;
  };
}

const StockMovements = () => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStockMovements();
  }, []);

  const fetchStockMovements = async () => {
    try {
      setLoading(true);
      const data = await stockRepo.recent(100);
      setMovements((data as any[]) || []);
    } catch (error) {
      console.error("Error fetching stock movements:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              Stock Movements
            </h1>
            <p className="text-muted-foreground text-lg">Historical inventory changes from invoice transactions</p>
          </div>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <div className="p-6 border-b bg-gradient-to-br from-warning/5 via-transparent to-accent/5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-warning/10 to-accent/10">
                <TrendingUp className="w-6 h-6 text-warning" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Invoice-Based Stock Changes</h2>
                <p className="text-sm text-muted-foreground">From StockInvoiceMovement table - Tracking & auditing</p>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : movements.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-warning/50" />
                </div>
                <p className="text-muted-foreground text-lg">No stock movements recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border-2">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-warning/5 to-accent/5 hover:from-warning/10 hover:to-accent/10">
                      <TableHead className="font-bold">Date & Time</TableHead>
                      <TableHead className="font-bold">Product</TableHead>
                      <TableHead className="text-center font-bold">Before</TableHead>
                      <TableHead className="text-center font-bold">Change</TableHead>
                      <TableHead className="text-center font-bold">After</TableHead>
                      <TableHead className="font-bold">Invoice ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((movement, idx) => (
                      <TableRow 
                        key={movement.id}
                        className="hover:bg-warning/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.02}s` }}
                      >
                        <TableCell className="text-sm">
                          {format(new Date(movement.invoice_date), "MMM dd, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {movement.products?.name || "Unknown Product"}
                        </TableCell>
                        <TableCell className="text-center font-medium text-muted-foreground">
                          {movement.quantity_before}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={movement.quantity_change > 0 ? "default" : "destructive"}
                            className="gap-1 font-semibold"
                          >
                            {movement.quantity_change > 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {movement.quantity_change > 0 ? "+" : ""}
                            {movement.quantity_change}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold text-lg ${movement.quantity_after === 0 ? 'text-destructive' : movement.quantity_after < 10 ? 'text-warning' : 'text-success'}`}>
                            {movement.quantity_after}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {movement.invoice_id.substring(0, 8)}...
                        </TableCell>
                      </TableRow>
                    ))}
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

export default StockMovements;
