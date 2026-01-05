import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { productsRepo, stockAdjustmentsRepo, inventoryRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { stockRepo } from "@/integrations/api/repo";
import { useTranslation } from "react-i18next";
import { formatDateTimeLebanon } from "@/utils/dateUtils";

const StockAdjustments = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [movementType, setMovementType] = useState<string>("adjustment");
  const [quantityChange, setQuantityChange] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [recentAdjustments, setRecentAdjustments] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchProducts();
    fetchRecentAdjustments();
    fetchInventory();
  }, []);

  const fetchProducts = async () => {
    try {
      const dataResponse = await productsRepo.list({ limit: 1000 });
      const data = Array.isArray(dataResponse) ? dataResponse : dataResponse.data;
      setProducts(data || []);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const fetchInventory = async () => {
    try {
      const data = await inventoryRepo.today();
      setInventory((data as any[]) || []);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    }
  };

  const fetchRecentAdjustments = async () => {
    try {
      const movements = await stockRepo.recent(50);
      const adjustments = (movements as any[]).filter(
        (m: any) => m.movement_type && m.movement_type !== "invoice"
      );
      setRecentAdjustments(adjustments || []);
    } catch (error) {
      console.error("Error fetching adjustments:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduct || !quantityChange) {
      toast({ title: "Error", description: "Please select a product and enter quantity change", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await stockAdjustmentsRepo.create({
        product_id: parseInt(selectedProduct),
        quantity_change: parseInt(quantityChange),
        movement_type: movementType,
        reason: reason || undefined,
      });
      toast({ title: "Success", description: "Stock adjustment created successfully" });
      setIsOpen(false);
      setSelectedProduct("");
      setQuantityChange("");
      setReason("");
      setMovementType("adjustment");
      fetchRecentAdjustments();
      fetchInventory();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create stock adjustment", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getMovementTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      adjustment: t('stockAdjustments.adjustment'),
      transfer: "Transfer",
      damage: "Damage",
      expiry: "Expiry",
    };
    return labels[type] || type;
  };

  const selectedProductData = products.find((p) => p.id.toString() === selectedProduct);

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              🔧 {t('stockAdjustments.title')}
            </h1>
            <p className="text-muted-foreground text-lg">{t('stockAdjustments.subtitle')}</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 font-semibold">
                <Plus className="w-4 h-4 mr-2" />
                {t('stockAdjustments.addAdjustment')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('stockAdjustments.addAdjustment')}</DialogTitle>
                <DialogDescription>{t('stockAdjustments.subtitle')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="product">{t('stockAdjustments.product')} *</Label>
                  <Select value={selectedProduct} onValueChange={setSelectedProduct} required>
                    <SelectTrigger>
                      <SelectValue placeholder={t('invoiceForm.selectProduct')} />
                    </SelectTrigger>
                    <SelectContent side="bottom" align="start">
                      {products.map((product) => {
                        const identifier = product.barcode || product.sku || null;
                        return (
                          <SelectItem key={product.id} value={product.id.toString()}>
                            {product.name} {identifier ? `(${identifier})` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {selectedProductData && (
                  <Card className="p-4 bg-muted/50">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-semibold">{t('stockAdjustments.currentStock')}:</span>{" "}
                        {inventory.find((inv) => inv.product_id.toString() === selectedProduct)?.available_qty ?? 0}
                      </div>
                      <div>
                        <span className="font-semibold">SKU:</span> {selectedProductData.sku || "N/A"}
                      </div>
                    </div>
                  </Card>
                )}

                <div className="space-y-2">
                  <Label htmlFor="movement_type">{t('stockAdjustments.movementType')} *</Label>
                  <Select value={movementType} onValueChange={setMovementType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent side="bottom" align="start">
                      <SelectItem value="adjustment">{t('stockAdjustments.adjustment')}</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                      <SelectItem value="damage">Damage</SelectItem>
                      <SelectItem value="expiry">Expiry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity_change">
                    {t('stockAdjustments.quantityChange')} * ({t('stockAdjustments.add')} / {t('stockAdjustments.remove')})
                  </Label>
                  <Input
                    id="quantity_change"
                    type="number"
                    value={quantityChange}
                    onChange={(e) => setQuantityChange(e.target.value)}
                    placeholder="e.g., 10 or -5"
                    required
                  />
                  {quantityChange && selectedProductData && (
                    <p className="text-sm text-muted-foreground">
                      {t('stockAdjustments.newStockWillBe')}:{" "}
                      {(inventory.find((inv) => inv.product_id.toString() === selectedProduct)?.available_qty ?? 0) + parseInt(quantityChange) || 0}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">{t('stockAdjustments.reason')} ({t('common.all')})</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('stockAdjustments.reason')}
                    rows={3}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('common.loading') : t('stockAdjustments.addAdjustment')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <CardHeader className="border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <AlertTriangle className="w-6 h-6 text-primary" />
              {t('stockAdjustments.recentAdjustments')}
            </CardTitle>
            <CardDescription className="text-base">{t('stockAdjustments.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {recentAdjustments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <TrendingUp className="w-10 h-10 text-primary/50" />
                </div>
                <p className="text-muted-foreground text-lg">{t('stockAdjustments.noAdjustments')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-2">{t('invoices.date')}</TableHead>
                      <TableHead>{t('stockAdjustments.product')}</TableHead>
                      <TableHead>{t('stockAdjustments.movementType')}</TableHead>
                      <TableHead>{t('stockMovements.quantityBefore')}</TableHead>
                      <TableHead>{t('stockMovements.change')}</TableHead>
                      <TableHead>{t('stockMovements.quantityAfter')}</TableHead>
                      <TableHead>{t('stockAdjustments.reason')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentAdjustments.map((adj) => (
                      <TableRow key={adj.id}>
                        <TableCell className="pl-2">{formatDateTimeLebanon(adj.created_at, "MMM dd, yyyy HH:mm")}</TableCell>
                        <TableCell>{adj.product_name || `Product #${adj.product_id}`}</TableCell>
                        <TableCell>
                          <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary">
                            {getMovementTypeLabel(adj.movement_type)}
                          </span>
                        </TableCell>
                        <TableCell>{adj.quantity_before}</TableCell>
                        <TableCell>
                          <span className={`flex items-center gap-1 ${adj.quantity_change >= 0 ? "text-success" : "text-destructive"}`}>
                            {adj.quantity_change >= 0 ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            {adj.quantity_change > 0 ? "+" : ""}
                            {adj.quantity_change}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold">{adj.quantity_after}</TableCell>
                        <TableCell className="max-w-xs truncate">{adj.reason || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default StockAdjustments;

