import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { StatusPill } from "@/components/page-ui/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, AlertTriangle, Search, X } from "lucide-react";
import { inventoryRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useDebounce } from "@/hooks/useDebounce";

interface LowStockItem {
  id: string | number;
  product_id: string | number;
  available_qty: number;
  date: string;
  products?: {
    name: string;
    barcode: string;
    sku: string;
  };
}

const LowStock = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [lowStockProducts, setLowStockProducts] = useState<LowStockItem[]>([]);
  const [threshold, setThreshold] = useState(20);
  const [allInventory, setAllInventory] = useState<LowStockItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  useEffect(() => {
    fetchLowStock();
  }, []);

  useEffect(() => {
    // Filter based on threshold
    if (allInventory.length > 0) {
      const filtered = allInventory.filter(item => item.available_qty <= threshold);
      setLowStockProducts(filtered);
    }
  }, [threshold, allInventory]);

  const fetchLowStock = async () => {
    setLoading(true);
    try {
      const data = await inventoryRepo.lowStock(1000); // Get all low stock items with high limit
      setAllInventory(data || []);
      const filtered = (data || []).filter((item: LowStockItem) => item.available_qty <= threshold);
      setLowStockProducts(filtered);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredLowStock = lowStockProducts.filter(item => {
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      const name = (item.products?.name || "").toLowerCase();
      const barcode = (item.products?.barcode || "").toLowerCase();
      const sku = (item.products?.sku || "").toLowerCase();
      const id = (item.product_id || "").toString();
      return name.includes(query) || barcode.includes(query) || sku.includes(query) || id.includes(query);
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        {/* Header */}
        <InvoicePageHeader
          icon={AlertTriangle}
          title={t('lowStock.title')}
          description={t('lowStock.subtitle')}
          actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="threshold" className="text-[11px] font-medium whitespace-nowrap">{t('lowStock.threshold')}:</Label>
              <Input
                id="threshold"
                type="number"
                min="1"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 1)}
                className="w-16 h-8 text-[13px]"
              />
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="w-4 h-4 text-destructive-strong" />
              <span className="font-bold text-[13px] tabular-nums">{filteredLowStock.length}</span>
              <span className="text-[11px] text-muted-foreground">alerts</span>
            </div>
          </div>
          }
        />

        {/* Search */}
        <div className="relative w-full sm:w-auto sm:max-w-md">
          <Search className="absolute start-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search low stock (name, barcode, SKU, ID)"
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

        {/* Low Stock Table */}
        <div className="border-2 border-border rounded-xl overflow-hidden bg-card">
          <div className="p-2">
            {loading ? (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : lowStockProducts.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-success-light flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-success/60" />
                </div>
                <p className="text-muted-foreground text-[13px]">
                  {t('lowStock.noLowStock')}
                </p>
              </div>
            ) : filteredLowStock.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-success-light flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-success/60" />
                </div>
                <p className="text-muted-foreground text-[13px]">
                  No low stock items found matching your search
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="scroll-x">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="h-9 px-2 pe-0.5 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('lowStock.product')}</TableHead>
                      <TableHead className="h-9 px-2 ps-0.5 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('products.barcode')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">SKU</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('lowStock.availableQty')}</TableHead>
                      <TableHead className="h-9 px-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('invoices.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLowStock.map((item, idx) => {
                      const isCritical = item.available_qty <= threshold * 0.5; // 50% or less of threshold is critical
                      
                      return (
                        <TableRow 
                          key={item.id} 
                          className={`hover:bg-destructive/5 transition-colors animate-fade-in ${
                            isCritical ? 'bg-destructive/5' : ''
                          }`}
                          style={{ animationDelay: `${idx * 0.05}s` }}
                        >
                          <TableCell className="font-medium p-2 pe-0.5 text-[13px]">
                            <div className="flex items-center gap-1.5">
                              {isCritical && (
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive-strong animate-pulse" />
                              )}
                              <span className="text-muted-foreground text-[11px] tabular-nums">#{item.product_id}</span> {item.products?.name || 'Unknown Product'}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground p-2 ps-0.5 text-[12px]">
                            {item.products?.barcode || 'N/A'}
                          </TableCell>
                          <TableCell className="text-muted-foreground p-2 text-[12px]">
                            {item.products?.sku || 'N/A'}
                          </TableCell>
                          <TableCell className="text-right p-2">
                            <span className={`text-[13px] font-bold tabular-nums ${
                              isCritical ? 'text-destructive-strong' : 'text-warning-strong'
                            }`}>
                              {item.available_qty}
                            </span>
                          </TableCell>
                          <TableCell className="text-center p-2">
                            <StatusPill tone={isCritical ? 'overdue' : 'partial'}>
                              {isCritical ? 'Critical' : 'Low'}
                            </StatusPill>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default LowStock;

