import { useEffect, useState } from "react";
import { stockRepo } from "@/integrations/api/repo";
import DashboardLayout from "@/components/DashboardLayout";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { StatusPill } from "@/components/page-ui/StatusPill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TrendingUp, Package, Search, X, Calendar, History, Filter } from "lucide-react";
import { formatDateTimeLebanon, getTodayLebanon, getNDaysAgoLebanon } from "@/utils/dateUtils";
import { useTranslation } from "react-i18next";
import ProductNameWithCode from "@/components/ProductNameWithCode";
import { useDebounce } from "@/hooks/useDebounce";

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
    barcode: string;
    sku: string;
    category_name?: string;
  };
}

const StockMovements = () => {
  const { t } = useTranslation();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);
  const [productIdFilter, setProductIdFilter] = useState<string>("");
  const debouncedProductIdFilter = useDebounce(productIdFilter, 400);

  // Date filter state - default to 3 days ago to today (Lebanon timezone)
  const [startDate, setStartDate] = useState<string>(() => getNDaysAgoLebanon(3));
  const [endDate, setEndDate] = useState<string>(getTodayLebanon());

  useEffect(() => {
    fetchStockMovements();
  }, [startDate, endDate, debouncedProductIdFilter]);

  const fetchStockMovements = async () => {
    try {
      setLoading(true);
      const data = await stockRepo.recent(100, {
        start_date: startDate,
        end_date: endDate,
        product_id: debouncedProductIdFilter.trim() || undefined,
      });
      setMovements((data as any[]) || []);
    } catch (error) {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  };

  const filteredMovements = movements.filter(movement => {
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase();
      const productName = (movement.products?.name || "").toLowerCase();
      const productBarcode = (movement.products?.barcode || "").toLowerCase();
      const productSku = (movement.products?.sku || "").toLowerCase();
      const productId = (movement.product_id || "").toString();
      const invoiceId = (movement.invoice_id || "").toString();
      return productName.includes(q) || productBarcode.includes(q) || productSku.includes(q) || productId.includes(q) || invoiceId.includes(q);
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <InvoicePageHeader
          icon={History}
          title={t('stockMovements.title')}
          description={t('stockMovements.subtitle')}
          actions={
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <Label htmlFor="start-date" className="text-[11px] font-medium whitespace-nowrap">
                <Calendar className="w-3 h-3 inline me-1" />
                From:
              </Label>
              <Input
                id="start-date"
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
                className="h-8 text-[13px] w-36"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="end-date" className="text-[11px] font-medium whitespace-nowrap">
                To:
              </Label>
              <Input
                id="end-date"
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
                className="h-8 text-[13px] w-36"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="product-id-filter" className="text-[11px] font-medium whitespace-nowrap">
                <Filter className="w-3 h-3 inline me-1" />
                Product ID:
              </Label>
              <div className="relative">
                <Input
                  id="product-id-filter"
                  type="number"
                  min="1"
                  placeholder="e.g. 42"
                  value={productIdFilter}
                  onChange={(e) => setProductIdFilter(e.target.value)}
                  className="h-8 text-[13px] w-28 pe-7"
                />
                {productIdFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setProductIdFilter("")}
                    className="absolute end-0.5 top-1/2 -translate-y-1/2 h-5 w-5 p-0"
                  >
                    <X className="w-2.5 h-2.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          }
        />

        <SectionCard
          icon={TrendingUp}
          title="Invoice-Based Stock Changes"
          description="From StockInvoiceMovement table - Tracking & auditing"
        >
            <div className="relative w-full sm:w-[280px]">
              <Search className="absolute start-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search movements (product, invoice ID)"
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
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : movements.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-warning-light flex items-center justify-center mx-auto mb-2">
                  <Package className="w-8 h-8 text-warning/60" />
                </div>
                <p className="text-muted-foreground text-[13px]">{t('stockMovements.noMovements')}</p>
              </div>
            ) : filteredMovements.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-warning-light flex items-center justify-center mx-auto mb-2">
                  <Package className="w-8 h-8 text-warning/60" />
                </div>
                <p className="text-muted-foreground text-[13px]">No movements found matching your search</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="scroll-x">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[12%]">{t('stockMovements.date')}</TableHead>
                      <TableHead className="h-9 px-2 pe-1 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[28%]">{t('stockMovements.product')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[10%]">Category</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[8%]">{t('stockMovements.quantityBefore')}</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[8%]">{t('stockMovements.change')}</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[8%]">{t('stockMovements.quantityAfter')}</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[8%]">Unit Cost</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[9%]">Avg Cost After</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[9%]">{t('stockMovements.invoice')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovements.map((movement, idx) => (
                      <TableRow 
                        key={movement.id}
                        className="hover:bg-primary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.02}s` }}
                      >
                        <TableCell className="text-[12px] p-2 whitespace-nowrap tabular-nums">
                          {formatDateTimeLebanon(movement.invoice_date, "MMM dd, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="font-semibold p-2 pe-1 text-[13px]">
                          <ProductNameWithCode 
                            product={movement.products || { name: "Unknown Product" }}
                            showId={true}
                            product_id={movement.product_id}
                            nameClassName=""
                            codeClassName="text-[11px] text-muted-foreground font-mono ms-1"
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground p-2 text-[12px]">
                          {movement.products?.category_name || "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-muted-foreground tabular-nums p-2 text-[12px]">
                          {movement.quantity_before}
                        </TableCell>
                        <TableCell className="text-right p-2">
                          <StatusPill tone={movement.quantity_change > 0 ? 'buy' : 'overdue'} className="tabular-nums">
                            {movement.quantity_change > 0 ? "+" : ""}
                            {movement.quantity_change}
                          </StatusPill>
                        </TableCell>
                        <TableCell className="text-right p-2">
                          <span className={`font-bold text-[13px] tabular-nums ${movement.quantity_after === 0 ? 'text-destructive-strong' : movement.quantity_after < 10 ? 'text-warning-strong' : 'text-success-strong'}`}>
                            {movement.quantity_after}
                          </span>
                        </TableCell>
                        <TableCell className="text-right p-2 text-[12px] tabular-nums">
                          {movement.unit_cost !== null && movement.unit_cost !== undefined ? (
                            <span className="font-medium text-primary-strong">${Number(movement.unit_cost).toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right p-2 text-[12px] tabular-nums">
                          {movement.avg_cost_after !== null && movement.avg_cost_after !== undefined ? (
                            <span className="font-medium text-success-strong">${Number(movement.avg_cost_after).toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[12px] text-muted-foreground font-mono p-2 whitespace-nowrap">
                          INV-{movement.invoice_id}
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

export default StockMovements;
