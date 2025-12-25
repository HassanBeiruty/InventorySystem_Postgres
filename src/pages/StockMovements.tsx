import { useEffect, useState } from "react";
import { stockRepo } from "@/integrations/api/repo";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, Package, Search, X, Calendar, History } from "lucide-react";
import { formatDateTimeLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { useTranslation } from "react-i18next";

interface StockMovement {
  id: string;
  product_id: string;
  invoice_id: string;
  invoice_date: string;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  unit_cost: number | null;
  avg_cost_after: number | null;
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
  
  // Date filter state - default to 3 days ago to today
  const getDefaultStartDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - 3);
    return date.toISOString().split('T')[0];
  };
  const [startDate, setStartDate] = useState<string>(getDefaultStartDate());
  const [endDate, setEndDate] = useState<string>(getTodayLebanon());

  useEffect(() => {
    fetchStockMovements();
  }, [startDate, endDate]);

  const fetchStockMovements = async () => {
    try {
      setLoading(true);
      const data = await stockRepo.recent(100, { start_date: startDate, end_date: endDate });
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
      <div className="space-y-1.5 sm:space-y-2 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
              <History className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                {t('stockMovements.title')}
              </h1>
              <p className="text-muted-foreground text-[10px] sm:text-xs">{t('stockMovements.subtitle')}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <Label htmlFor="start-date" className="text-[10px] sm:text-xs whitespace-nowrap">
                <Calendar className="w-3 h-3 inline mr-1" />
                From:
              </Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-7 text-xs w-32"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="end-date" className="text-[10px] sm:text-xs whitespace-nowrap">
                To:
              </Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                max={getTodayLebanon()}
                className="h-7 text-xs w-32"
              />
            </div>
          </div>
        </div>

        <Card className="border shadow-card hover:shadow-elegant transition-all duration-300">
          <div className="p-1.5 border-b bg-gradient-to-br from-warning/5 via-transparent to-accent/5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-warning/10 to-accent/10">
                  <TrendingUp className="w-3 h-3 text-warning" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-sm font-bold">Invoice-Based Stock Changes</h2>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">From StockInvoiceMovement table - Tracking & auditing</p>
                </div>
              </div>
              <div className="relative w-full sm:w-auto sm:min-w-[250px]">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search movements (product, invoice ID)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-7 h-7 text-xs"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-0.5 top-1/2 transform -translate-y-1/2 h-5 w-5 p-0"
                  >
                    <X className="w-2.5 h-2.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          <div className="p-1.5">
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : movements.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-2">
                  <Package className="w-8 h-8 text-warning/50" />
                </div>
                <p className="text-muted-foreground text-sm">{t('stockMovements.noMovements')}</p>
              </div>
            ) : filteredMovements.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-2">
                  <Package className="w-8 h-8 text-warning/50" />
                </div>
                <p className="text-muted-foreground text-sm">No movements found matching your search</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-warning/5 to-accent/5 hover:from-warning/10 hover:to-accent/10">
                      <TableHead className="font-bold p-1.5 text-[10px]">{t('stockMovements.date')}</TableHead>
                      <TableHead className="font-bold p-1.5 text-[10px]">{t('stockMovements.product')}</TableHead>
                      <TableHead className="text-center font-bold p-1.5 text-[10px]">{t('stockMovements.quantityBefore')}</TableHead>
                      <TableHead className="text-center font-bold p-1.5 text-[10px]">{t('stockMovements.change')}</TableHead>
                      <TableHead className="text-center font-bold p-1.5 text-[10px]">{t('stockMovements.quantityAfter')}</TableHead>
                      <TableHead className="text-center font-bold p-1.5 text-[10px]">Unit Cost</TableHead>
                      <TableHead className="text-center font-bold p-1.5 text-[10px]">Avg Cost After</TableHead>
                      <TableHead className="font-bold p-1.5 text-[10px]">{t('stockMovements.invoice')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovements.map((movement, idx) => (
                      <TableRow 
                        key={movement.id}
                        className="hover:bg-warning/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.02}s` }}
                      >
                        <TableCell className="text-[10px] p-1.5">
                          {formatDateTimeLebanon(movement.invoice_date, "MMM dd, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="font-semibold p-1.5 text-xs">
                          <span className="text-muted-foreground text-[10px]">#{movement.product_id}</span> {movement.products?.name || "Unknown Product"}
                        </TableCell>
                        <TableCell className="text-center font-medium text-muted-foreground p-1.5 text-[10px]">
                          {movement.quantity_before}
                        </TableCell>
                        <TableCell className="text-center p-1.5">
                          <Badge
                            variant={movement.quantity_change > 0 ? "default" : "destructive"}
                            className="gap-0.5 font-semibold text-[10px]"
                          >
                            {movement.quantity_change > 0 ? (
                              <TrendingUp className="w-2.5 h-2.5" />
                            ) : (
                              <TrendingDown className="w-2.5 h-2.5" />
                            )}
                            {movement.quantity_change > 0 ? "+" : ""}
                            {movement.quantity_change}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center p-1.5">
                          <span className={`font-bold text-xs ${movement.quantity_after === 0 ? 'text-destructive' : movement.quantity_after < 10 ? 'text-warning' : 'text-success'}`}>
                            {movement.quantity_after}
                          </span>
                        </TableCell>
                        <TableCell className="text-center p-1.5 text-[10px]">
                          {movement.unit_cost !== null && movement.unit_cost !== undefined ? (
                            <span className="font-medium text-primary">${Number(movement.unit_cost).toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center p-1.5 text-[10px]">
                          {movement.avg_cost_after !== null && movement.avg_cost_after !== undefined ? (
                            <span className="font-medium text-success">${Number(movement.avg_cost_after).toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground font-mono p-1.5">
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
