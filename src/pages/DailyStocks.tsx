import { useEffect, useState, useMemo, useCallback } from "react";
import { inventoryRepo } from "@/integrations/api/repo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { StatusPill } from "@/components/page-ui/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Package, Search, X, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { formatDateTimeLebanon, formatDateLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import ProductNameWithCode from "@/components/ProductNameWithCode";
import { useSearchText } from "@/hooks/useSearchText";

interface DailyStockItem {
  id: string;
  product_id: string;
  available_qty: number;
  avg_cost: number;
  date: string;
  created_at: string;
  updated_at: string;
  products?: {
    name: string;
    barcode: string;
    sku: string;
  };
}

const DailyStocks = () => {
  const { t } = useTranslation();
  const [dailyStocks, setDailyStocks] = useState<DailyStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { applied: debouncedSearchTerm, searchOnEnter } = useSearchText(searchTerm);
  
  // Date filter state - default to 3 days ago to today
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 3);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(getTodayLebanon());
  const [currentDayIndex, setCurrentDayIndex] = useState<number>(0);

  // Extract unique dates from actual daily stocks data (within the selected range)
  const allDatesInRange = useMemo(() => {
    if (!dailyStocks || dailyStocks.length === 0) return [];
    
    // Extract unique dates from daily stocks
    const uniqueDates = new Set<string>();
    dailyStocks.forEach(item => {
      if (item.date) {
        const dateStr = formatDateLebanon(item.date);
        uniqueDates.add(dateStr);
      }
    });
    
    // Convert to array and sort descending (newest first)
    const dates = Array.from(uniqueDates).sort((a, b) => b.localeCompare(a));
    return dates;
  }, [dailyStocks]);

  // Reset to first day when daily stocks data changes
  useEffect(() => {
    setCurrentDayIndex(0);
  }, [dailyStocks.length]);

  // Ensure currentDayIndex is within bounds
  useEffect(() => {
    if (allDatesInRange.length > 0 && currentDayIndex >= allDatesInRange.length) {
      setCurrentDayIndex(0);
    }
  }, [allDatesInRange.length, currentDayIndex]);

  // Get current date being displayed
  const currentDate = allDatesInRange.length > 0 && currentDayIndex < allDatesInRange.length 
    ? allDatesInRange[currentDayIndex] 
    : null;

  const fetchDailyStocks = useCallback(async () => {
    try {
      setLoading(true);
      // Pass search term to server for efficient server-side filtering
      const data = await inventoryRepo.dailyHistory({
        start_date: startDate,
        end_date: endDate,
        search: debouncedSearchTerm.trim() || undefined
      });
      setDailyStocks((data as any[]) || []);
    } catch (error) {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, debouncedSearchTerm]);

  useEffect(() => {
    fetchDailyStocks();
  }, [fetchDailyStocks]);

  // Memoize grouped stocks to avoid recalculating on every render
  // Pre-compute date strings once to avoid repeated formatDateLebanon calls
  const groupedByDate = useMemo(() => {
    const grouped: Record<string, DailyStockItem[]> = {};
    dailyStocks.forEach(item => {
      if (item.date) {
        const date = formatDateLebanon(item.date);
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(item);
      }
    });
    return grouped;
  }, [dailyStocks]);

  // Get items for current day only - optimized to avoid unnecessary recalculations
  const currentDayItems = useMemo(() => {
    if (!currentDate || !groupedByDate[currentDate]) {
      return [];
    }
    return groupedByDate[currentDate];
  }, [groupedByDate, currentDate]);

  return (
    <>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <InvoicePageHeader
          icon={CalendarDays}
          title={t('dailyStocks.title')}
          description={t('dailyStocks.subtitle')}
          actions={
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <Label htmlFor="start-date-daily" className="text-[11px] font-medium whitespace-nowrap">
                <Calendar className="w-3 h-3 inline me-1" />
                From:
              </Label>
              <Input
                id="start-date-daily"
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
              <Label htmlFor="end-date-daily" className="text-[11px] font-medium whitespace-nowrap">
                To:
              </Label>
              <Input
                id="end-date-daily"
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
          </div>
          }
        />

        <SectionCard
          icon={Package}
          title="Daily Stock History"
          description="Historical stock levels by date"
        >
            <div className="relative w-full sm:w-[280px]">
              <Search className="absolute start-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t('dailyStocks.searchProducts')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={searchOnEnter}
                className="w-full ps-8 pe-8 h-8 text-[13px]"
                autoFocus
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm("")}
                  className="absolute end-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : allDatesInRange.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-accent-light flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-10 h-10 text-accent/50" />
                </div>
                <p className="text-muted-foreground text-[13px]">Please select a valid date range</p>
              </div>
            ) : !currentDate ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-accent-light flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-accent/50" />
                </div>
                <p className="text-muted-foreground text-[13px]">
                  {searchTerm ? t('common.noData') : t('inventory.noStock')}
                </p>
              </div>
            ) : (
              <>
                {/* Current Date Header */}
                <div className="flex items-center justify-between mb-2 pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-accent" />
                    <h3 className="text-[13px] font-bold">
                      {formatDateTimeLebanon(currentDate, "EEEE, MMMM dd, yyyy")}
                    </h3>
                    {currentDate === getTodayLebanon() && (
                      <StatusPill tone="paid">{t('inventory.todayPosition')}</StatusPill>
                    )}
                  </div>
                  <div className="text-[12px] text-muted-foreground tabular-nums">
                    {currentDayItems.length} {currentDayItems.length === 1 ? 'product' : 'products'}
                  </div>
                </div>

                {currentDayItems.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-20 h-20 rounded-full bg-accent-light flex items-center justify-center mx-auto mb-4">
                      <Package className="w-10 h-10 text-accent/50" />
                    </div>
                    <p className="text-muted-foreground text-[13px]">
                      {searchTerm ? "No products found matching your search for this day" : "No stock data for this day"}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-border overflow-hidden bg-card">
                      <div className="scroll-x">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/60 hover:bg-muted/60">
                            <TableHead className="h-9 px-2 pe-1 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[28%]">{t('invoices.product')}</TableHead>
                            <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[12%]">Category</TableHead>
                            <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[10%]">{t('inventory.availableQty')}</TableHead>
                            <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[10%]">Avg Cost</TableHead>
                            <TableHead className="h-9 px-2 pe-6 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[12%]">Total Value</TableHead>
                            <TableHead className="h-9 px-2 ps-6 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[18%]">{t('inventory.lastUpdated')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentDayItems.map((item) => {
                            return (
                              <TableRow 
                                key={item.id} 
                                className="hover:bg-accent/5 transition-colors"
                              >
                                <TableCell className="font-semibold p-2 pe-1 text-[13px]">
                                  <ProductNameWithCode
                                    product={item.products || { name: "Unknown Product" }}
                                    showId={true}
                                    product_id={item.product_id}
                                    nameClassName=""
                                    codeClassName="text-[11px] text-muted-foreground font-mono ms-1"
                                  />
                                </TableCell>
                                <TableCell className="text-muted-foreground text-[12px] p-2">
                                  {item.products?.category_name || "-"}
                                </TableCell>
                                <TableCell className="text-right p-2">
                                  <StatusPill tone={item.available_qty === 0 ? 'overdue' : item.available_qty < 10 ? 'partial' : 'paid'} className="tabular-nums">
                                    {item.available_qty}
                                  </StatusPill>
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-[12px] p-2">
                                  ${Number(item.avg_cost || 0).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right font-semibold tabular-nums text-[12px] p-2 pe-6">
                                  ${(Number(item.available_qty) * Number(item.avg_cost || 0)).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-[12px] text-muted-foreground p-2 ps-6">
                                  {item.updated_at ? formatDateTimeLebanon(item.updated_at, "MMM dd, yyyy HH:mm") : "-"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      </div>
                    </div>

                    {/* Pagination Controls */}
                    {allDatesInRange.length > 1 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-3 pt-3 border-t">
                        <div className="text-[12px] text-muted-foreground tabular-nums">
                          Day {currentDayIndex + 1} of {allDatesInRange.length}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentDayIndex(Math.max(0, currentDayIndex - 1))}
                            disabled={currentDayIndex === 0}
                            className="h-8 text-[12px]"
                          >
                            <ChevronLeft className="w-4 h-4 me-1" />
                            Previous Day
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentDayIndex(Math.min(allDatesInRange.length - 1, currentDayIndex + 1))}
                            disabled={currentDayIndex >= allDatesInRange.length - 1}
                            className="h-8 text-[12px]"
                          >
                            Next Day
                            <ChevronRight className="w-4 h-4 ms-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
        </SectionCard>
      </div>
    </>
  );
};

export default DailyStocks;

