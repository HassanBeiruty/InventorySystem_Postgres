import { useEffect, useState, useMemo, useCallback } from "react";
import { inventoryRepo } from "@/integrations/api/repo";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Package, Search, X, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { formatDateTimeLebanon, formatDateLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import ProductNameWithCode from "@/components/ProductNameWithCode";

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
        search: searchTerm.trim() || undefined
      });
      setDailyStocks((data as any[]) || []);
    } catch (error) {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, searchTerm]);

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
    <DashboardLayout>
      <div className="space-y-1.5 sm:space-y-2 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
              <CalendarDays className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                {t('dailyStocks.title')}
              </h1>
              <p className="text-muted-foreground text-[10px] sm:text-xs">{t('dailyStocks.subtitle')}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <Label htmlFor="start-date-daily" className="text-[10px] sm:text-xs whitespace-nowrap">
                <Calendar className="w-3 h-3 inline mr-1" />
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
                className="h-7 text-xs w-32"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="end-date-daily" className="text-[10px] sm:text-xs whitespace-nowrap">
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
                className="h-7 text-xs w-32"
              />
            </div>
          </div>
        </div>

        <div className="border-2 rounded-lg overflow-hidden">
          <div className="p-1.5 border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10">
                  <Package className="w-3 h-3 text-primary" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-sm font-bold">Daily Stock History</h2>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">Historical stock levels by date</p>
                </div>
              </div>
              <div className="relative w-full sm:w-auto sm:min-w-[250px]">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder={t('dailyStocks.searchProducts')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-7 pr-7 h-7 text-xs"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-0.5 top-1/2 transform -translate-y-1/2 h-5 w-5 p-0"
                  >
                    <X className="w-2.5 h-2.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="p-1.5 sm:p-2">
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : allDatesInRange.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-10 h-10 text-accent/50" />
                </div>
                <p className="text-muted-foreground text-lg">Please select a valid date range</p>
              </div>
            ) : !currentDate ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-accent/50" />
                </div>
                <p className="text-muted-foreground text-lg">
                  {searchTerm ? t('common.noData') : t('inventory.noStock')}
                </p>
              </div>
            ) : (
              <>
                {/* Current Date Header */}
                <div className="flex items-center justify-between mb-2 pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-bold">
                      {formatDateTimeLebanon(currentDate, "EEEE, MMMM dd, yyyy")}
                    </h3>
                    {currentDate === getTodayLebanon() && (
                      <Badge className="bg-success text-success-foreground text-[10px]">{t('inventory.todayPosition')}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {currentDayItems.length} {currentDayItems.length === 1 ? 'product' : 'products'}
                  </div>
                </div>

                {currentDayItems.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                      <Package className="w-10 h-10 text-accent/50" />
                    </div>
                    <p className="text-muted-foreground text-lg">
                      {searchTerm ? "No products found matching your search for this day" : "No stock data for this day"}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border-2 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gradient-to-r from-accent/5 to-primary/5">
                            <TableHead className="font-bold p-2 pl-2 pr-1 text-xs w-[28%]">{t('invoices.product')}</TableHead>
                            <TableHead className="font-bold p-2 text-xs w-[12%]">Category</TableHead>
                            <TableHead className="text-center font-bold p-2 text-xs w-[10%]">{t('inventory.availableQty')}</TableHead>
                            <TableHead className="text-right font-bold p-2 text-xs w-[10%]">Avg Cost</TableHead>
                            <TableHead className="text-right font-bold p-2 pr-6 text-xs w-[12%]">Total Value</TableHead>
                            <TableHead className="font-bold p-2 pl-6 text-xs w-[18%]">{t('inventory.lastUpdated')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentDayItems.map((item) => {
                            return (
                              <TableRow 
                                key={item.id} 
                                className="hover:bg-accent/5 transition-colors"
                              >
                                <TableCell className="font-semibold p-2 pl-2 pr-1 text-xs">
                                  <ProductNameWithCode 
                                    product={item.products || { name: "Unknown Product" }}
                                    showId={true}
                                    product_id={item.product_id}
                                    nameClassName=""
                                    codeClassName="text-[10px] text-muted-foreground font-mono ml-1"
                                  />
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs p-2">
                                  {item.products?.category_name || "-"}
                                </TableCell>
                                <TableCell className="text-center p-2">
                                  <span className={`font-bold text-sm ${item.available_qty === 0 ? 'text-destructive' : item.available_qty < 10 ? 'text-warning' : 'text-success'}`}>
                                    {item.available_qty}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs p-2">
                                  ${Number(item.avg_cost || 0).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-xs p-2 pr-6">
                                  ${(Number(item.available_qty) * Number(item.avg_cost || 0)).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground p-2 pl-6">
                                  {item.updated_at ? formatDateTimeLebanon(item.updated_at, "MMM dd, yyyy HH:mm") : "-"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination Controls */}
                    {allDatesInRange.length > 1 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t">
                        <div className="text-sm text-muted-foreground">
                          Day {currentDayIndex + 1} of {allDatesInRange.length}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentDayIndex(Math.max(0, currentDayIndex - 1))}
                            disabled={currentDayIndex === 0}
                            className="h-7 text-xs"
                          >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Previous Day
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentDayIndex(Math.min(allDatesInRange.length - 1, currentDayIndex + 1))}
                            disabled={currentDayIndex >= allDatesInRange.length - 1}
                            className="h-7 text-xs"
                          >
                            Next Day
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DailyStocks;

