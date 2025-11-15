import { useEffect, useState } from "react";
import { inventoryRepo } from "@/integrations/api/repo";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, AlertTriangle } from "lucide-react";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      // Silently handle error
    } finally {
      setLoading(false);
    }
  };

  const getStockStatus = (qty: number) => {
    if (qty === 0) return { label: "Out of Stock", variant: "destructive" as const };
    if (qty < 10) return { label: t('dashboard.lowStock'), variant: "secondary" as const };
    return { label: "In Stock", variant: "default" as const };
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {t('inventory.title')} - {t('inventory.todayPosition')}
            </h1>
            <p className="text-muted-foreground text-lg">{t('inventory.subtitle')}</p>
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
                <p className="text-muted-foreground text-lg">{t('inventory.noStock')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border-2">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10">
                      <TableHead className="font-bold">{t('invoiceForm.product')}</TableHead>
                      <TableHead className="font-bold">{t('products.barcode')}</TableHead>
                      <TableHead className="text-center font-bold">{t('inventory.availableQty')}</TableHead>
                      <TableHead className="text-center font-bold">{t('invoices.status')}</TableHead>
                      <TableHead className="text-right font-bold">{t('productPrices.wholesalePrice')}</TableHead>
                      <TableHead className="text-right font-bold">{t('productPrices.retailPrice')}</TableHead>
                      <TableHead className="font-bold">{t('inventory.lastUpdated')}</TableHead>
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
                            <span className="text-muted-foreground text-sm">#{item.product_id}</span> {item.products?.name || "Unknown Product"}
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
                            ${item.products?.wholesale_price ? parseFloat(String(item.products.wholesale_price || 0)).toFixed(2) : "0.00"}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            ${item.products?.retail_price ? parseFloat(String(item.products.retail_price || 0)).toFixed(2) : "0.00"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTimeLebanon(item.updated_at, "MMM dd, yyyy")}
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
