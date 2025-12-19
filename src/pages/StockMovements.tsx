import { useEffect, useState } from "react";
import { stockRepo } from "@/integrations/api/repo";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Package, Search, X } from "lucide-react";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    fetchStockMovements();
  }, []);

  const fetchStockMovements = async () => {
    try {
      setLoading(true);
      const data = await stockRepo.recent(100);
      setMovements((data as any[]) || []);
    } catch (error) {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  };

  const filteredMovements = movements.filter(movement => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const productName = (movement.products?.name || "").toLowerCase();
      const productId = (movement.product_id || "").toString();
      const invoiceId = (movement.invoice_id || "").toString();
      return productName.includes(query) || productId.includes(query) || invoiceId.includes(query);
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {t('stockMovements.title')}
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm">{t('stockMovements.subtitle')}</p>
          </div>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <div className="p-2 border-b bg-gradient-to-br from-warning/5 via-transparent to-accent/5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-gradient-to-br from-warning/10 to-accent/10">
                  <TrendingUp className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold">Invoice-Based Stock Changes</h2>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">From StockInvoiceMovement table - Tracking & auditing</p>
                </div>
              </div>
              <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search movements (product, invoice ID)"
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
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : movements.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-warning/50" />
                </div>
                <p className="text-muted-foreground text-lg">{t('stockMovements.noMovements')}</p>
              </div>
            ) : filteredMovements.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-warning/50" />
                </div>
                <p className="text-muted-foreground text-lg">No movements found matching your search</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border-2">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-warning/5 to-accent/5 hover:from-warning/10 hover:to-accent/10">
                      <TableHead className="font-bold p-2 text-xs">{t('stockMovements.date')}</TableHead>
                      <TableHead className="font-bold p-2 text-xs">{t('stockMovements.product')}</TableHead>
                      <TableHead className="text-center font-bold p-2 text-xs">{t('stockMovements.quantityBefore')}</TableHead>
                      <TableHead className="text-center font-bold p-2 text-xs">{t('stockMovements.change')}</TableHead>
                      <TableHead className="text-center font-bold p-2 text-xs">{t('stockMovements.quantityAfter')}</TableHead>
                      <TableHead className="font-bold p-2 text-xs">{t('stockMovements.invoice')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovements.map((movement, idx) => (
                      <TableRow 
                        key={movement.id}
                        className="hover:bg-warning/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.02}s` }}
                      >
                        <TableCell className="text-xs p-2">
                          {formatDateTimeLebanon(movement.invoice_date, "MMM dd, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="font-semibold p-2 text-sm">
                          <span className="text-muted-foreground text-xs">#{movement.product_id}</span> {movement.products?.name || "Unknown Product"}
                        </TableCell>
                        <TableCell className="text-center font-medium text-muted-foreground p-2 text-xs">
                          {movement.quantity_before}
                        </TableCell>
                        <TableCell className="text-center p-2">
                          <Badge
                            variant={movement.quantity_change > 0 ? "default" : "destructive"}
                            className="gap-1 font-semibold text-xs"
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
                        <TableCell className="text-center p-2">
                          <span className={`font-bold text-sm ${movement.quantity_after === 0 ? 'text-destructive' : movement.quantity_after < 10 ? 'text-warning' : 'text-success'}`}>
                            {movement.quantity_after}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono p-2">
                          INV-{movement.invoice_id}
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
