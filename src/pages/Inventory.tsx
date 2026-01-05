import { useEffect, useState } from "react";
import { inventoryRepo } from "@/integrations/api/repo";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, AlertTriangle, Search, X, Warehouse } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface InventoryItem {
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

const Inventory = () => {
  const { t } = useTranslation();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const data = await inventoryRepo.today();
      setInventory((data as any[]) || []);
    } catch (error) {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = inventory.filter(item => {
    if (searchQuery.trim()) {
      const query = searchQuery.trim().replace(/\s+/g, '').toLowerCase();
      const name = (item.products?.name || "").toLowerCase();
      const barcode = (item.products?.barcode || "").replace(/\s+/g, '').toLowerCase();
      const sku = (item.products?.sku || "").replace(/\s+/g, '').toLowerCase();
      const id = (item.product_id || "").toString();
      return name.includes(query) || barcode.includes(query) || sku.includes(query) || id.includes(query);
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
              <Warehouse className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                {t('inventory.title')} - {t('inventory.todayPosition')}
              </h1>
              <p className="text-muted-foreground text-xs sm:text-sm">{t('inventory.subtitle')}</p>
            </div>
          </div>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <div className="p-2 border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
                  <Package className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold">Daily Stock Snapshot</h2>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Real-time inventory from DailyStock table</p>
                </div>
              </div>
              <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search inventory (name, barcode, SKU, ID)"
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
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : inventory.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-primary/50" />
                </div>
                <p className="text-muted-foreground text-lg">{t('inventory.noStock')}</p>
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-primary/50" />
                </div>
                <p className="text-muted-foreground text-lg">No inventory found matching your search</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border-2">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10">
                      <TableHead className="font-bold whitespace-nowrap p-2 pl-2 pr-0.5 text-xs">{t('invoiceForm.product')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap hidden sm:table-cell p-2 pl-0.5 text-xs">{t('products.barcode')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap hidden sm:table-cell p-2 text-xs">SKU</TableHead>
                      <TableHead className="text-center font-bold whitespace-nowrap p-2 text-xs">{t('inventory.availableQty')}</TableHead>
                      <TableHead className="text-right font-bold whitespace-nowrap p-2 text-xs">Average Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.map((item, idx) => {
                      return (
                        <TableRow 
                          key={item.id} 
                          className="hover:bg-primary/5 transition-colors animate-fade-in"
                          style={{ animationDelay: `${idx * 0.03}s` }}
                        >
                          <TableCell className="font-semibold p-2 pl-2 pr-0.5 text-sm">
                            <span className="text-muted-foreground text-xs">#{item.product_id}</span> {item.products?.name || "Unknown Product"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground p-2 pl-0.5">
                            {item.products?.barcode || "N/A"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground p-2">
                            {item.products?.sku || "N/A"}
                          </TableCell>
                          <TableCell className="text-center p-2">
                            <div className="flex items-center justify-center gap-1.5">
                              {item.available_qty === 0 && (
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive animate-pulse" />
                              )}
                              <span className={`font-bold text-sm ${item.available_qty === 0 ? 'text-destructive' : item.available_qty < 10 ? 'text-warning' : 'text-success'}`}>
                                {item.available_qty}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold p-2 text-xs">
                            ${item.avg_cost ? parseFloat(String(item.avg_cost || 0)).toFixed(2) : "0.00"}
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
