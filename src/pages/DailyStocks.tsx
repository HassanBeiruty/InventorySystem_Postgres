import { useEffect, useState } from "react";
import { inventoryRepo } from "@/integrations/api/repo";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Package } from "lucide-react";
import { formatDateTimeLebanon, formatDateLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";

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
  };
}

const DailyStocks = () => {
  const { t } = useTranslation();
  const [dailyStocks, setDailyStocks] = useState<DailyStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchDailyStocks();
  }, []);

  const fetchDailyStocks = async () => {
    try {
      setLoading(true);
      const data = await inventoryRepo.dailyHistory();
      setDailyStocks((data as any[]) || []);
    } catch (error) {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  };

  // Group stocks by date
  const groupedByDate = dailyStocks.reduce((acc, item) => {
    const date = formatDateLebanon(item.date);
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {} as Record<string, DailyStockItem[]>);

  // Filter by search term
  const filteredGroups = Object.entries(groupedByDate).reduce((acc, [date, items]) => {
    const filtered = items.filter(item => 
      item.products?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.products?.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[date] = filtered;
    }
    return acc;
  }, {} as Record<string, DailyStockItem[]>);

  // Sort dates descending
  const sortedDates = Object.keys(filteredGroups).sort((a, b) => b.localeCompare(a));

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {t('dailyStocks.title')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{t('dailyStocks.subtitle')}</p>
          </div>
          <div className="w-48 sm:w-64">
            <Input
              placeholder={t('dailyStocks.searchProducts')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="border-2 rounded-lg overflow-hidden">
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : sortedDates.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-accent/50" />
                </div>
                <p className="text-muted-foreground text-lg">
                  {searchTerm ? t('common.noData') : t('inventory.noStock')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedDates.map((date, dateIdx) => {
                  const items = filteredGroups[date];
                  const isToday = date === getTodayLebanon();
                  
                  return (
                    <div 
                      key={date} 
                      className="space-y-3 animate-fade-in"
                      style={{ animationDelay: `${dateIdx * 0.1}s` }}
                    >
                      <div className="flex items-center gap-3 sticky top-0 bg-background py-2 z-10">
                        <Calendar className="w-5 h-5 text-accent" />
                        <h3 className="text-lg font-bold">
                          {formatDateTimeLebanon(date, "EEEE, MMMM dd, yyyy")}
                        </h3>
                        {isToday && (
                          <Badge className="bg-success text-success-foreground">{t('inventory.todayPosition')}</Badge>
                        )}
                      </div>
                      
                      <div className="rounded-xl border-2 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gradient-to-r from-accent/5 to-primary/5">
                              <TableHead className="font-bold p-2 text-xs">{t('invoices.product')}</TableHead>
                              <TableHead className="font-bold p-2 text-xs">{t('products.barcode')}</TableHead>
                            <TableHead className="text-center font-bold p-2 text-xs">{t('inventory.availableQty')}</TableHead>
                            <TableHead className="text-center font-bold p-2 text-xs">Avg Cost</TableHead>
                              <TableHead className="font-bold p-2 text-xs">{t('inventory.lastUpdated')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((item, idx) => {
                              return (
                                <TableRow 
                                  key={item.id} 
                                  className="hover:bg-accent/5 transition-colors"
                                >
                                  <TableCell className="font-semibold p-2 text-sm">
                                    <span className="text-muted-foreground text-xs">#{item.product_id}</span> {item.products?.name || "Unknown Product"}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-muted-foreground p-2">
                                    {item.products?.barcode || "N/A"}
                                  </TableCell>
                                  <TableCell className="text-center p-2">
                                    <span className={`font-bold text-sm ${item.available_qty === 0 ? 'text-destructive' : item.available_qty < 10 ? 'text-warning' : 'text-success'}`}>
                                      {item.available_qty}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center font-mono text-xs p-2">
                                    {Number(item.avg_cost || 0).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground p-2">
                                    {formatDateTimeLebanon(item.updated_at, "HH:mm:ss")}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DailyStocks;

