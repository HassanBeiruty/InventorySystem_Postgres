import { useEffect, useState } from "react";
import { inventoryRepo } from "@/integrations/api/repo";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { StatusPill } from "@/components/page-ui/StatusPill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, AlertTriangle, Search, X, Warehouse } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ProductNameWithCode from "@/components/ProductNameWithCode";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { useDebounce } from "@/hooks/useDebounce";

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
    category_name?: string;
  };
}

const Inventory = () => {
  const { t } = useTranslation();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

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
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.trim().replace(/\s+/g, '').toLowerCase();
      const name = (item.products?.name || "").toLowerCase();
      const barcode = (item.products?.barcode || "").replace(/\s+/g, '').toLowerCase();
      const sku = (item.products?.sku || "").replace(/\s+/g, '').toLowerCase();
      const id = (item.product_id || "").toString();
      return name.includes(query) || barcode.includes(query) || sku.includes(query) || id.includes(query);
    }
    return true;
  });

  return (
    <>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <InvoicePageHeader
          icon={Warehouse}
          title={<>{t('inventory.title')} - {t('inventory.todayPosition')}</>}
          description={t('inventory.subtitle')}
        />

        <SectionCard
          icon={Package}
          title="Daily Stock Snapshot"
          description="Real-time inventory from DailyStock table"
        >
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute start-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search inventory (name, barcode, SKU, ID)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full ps-8 pe-8 h-8 text-[13px]"
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
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : inventory.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-primary/60" />
                </div>
                <p className="text-muted-foreground text-[13px]">{t('inventory.noStock')}</p>
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-primary/60" />
                </div>
                <p className="text-muted-foreground text-[13px]">No inventory found matching your search</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="scroll-x">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="h-9 px-2 pe-0.5 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[28%]">{t('invoiceForm.product')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[12%]">Category</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[10%]">{t('inventory.availableQty')}</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[10%]">Avg Cost</TableHead>
                      <TableHead className="h-9 px-2 pe-6 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[12%]">Total Value</TableHead>
                      <TableHead className="h-9 px-2 ps-6 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap w-[18%]">{t('inventory.lastUpdated')}</TableHead>
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
                          <TableCell className="font-semibold p-2 pe-0.5 text-[13px]">
                            <ProductNameWithCode 
                              product={item.products || { name: "Unknown Product" }}
                              showId={true}
                              product_id={item.product_id}
                              nameClassName="text-[13px]"
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[12px] p-2">
                            {item.products?.category_name || "-"}
                          </TableCell>
                          <TableCell className="text-right p-2">
                            <div className="flex items-center justify-end gap-1.5">
                              {item.available_qty === 0 && (
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive-strong animate-pulse" />
                              )}
                              <StatusPill tone={item.available_qty === 0 ? 'overdue' : item.available_qty < 10 ? 'partial' : 'paid'} className="tabular-nums">
                                {item.available_qty}
                              </StatusPill>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-[12px] p-2">
                            ${item.avg_cost ? parseFloat(String(item.avg_cost || 0)).toFixed(2) : "0.00"}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-[12px] p-2 pe-6">
                            ${((item.available_qty || 0) * parseFloat(String(item.avg_cost || 0))).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[12px] p-2 ps-6">
                            {item.updated_at ? formatDateTimeLebanon(item.updated_at, "MMM dd, yyyy HH:mm") : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </div>
            )}
        </SectionCard>
      </div>
    </>
  );
};

export default Inventory;
