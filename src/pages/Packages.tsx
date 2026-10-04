import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Boxes, Pencil, Trash2, Search, X } from "lucide-react";
import { packagesRepo, productsRepo, productPricesRepo, type PackageEntity } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ProductCombobox from "@/components/ProductCombobox";
import { QtyStepper } from "@/components/page-ui/QtyStepper";
import { parseMoney } from "@/utils/money";
import { useDebounce } from "@/hooks/useDebounce";

interface ProductLite {
  id: number | string;
  name?: string | null;
  barcode?: string | null;
  sku?: string | null;
}

interface DraftItem {
  productId: string;
  quantity: number;
}

const usd = (amount: number) => `$${amount.toFixed(2)}`;

const Packages = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<PackageEntity[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [retailPrices, setRetailPrices] = useState<Map<string, number>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [pickerValue, setPickerValue] = useState("");

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingPackage, setDeletingPackage] = useState<PackageEntity | null>(null);

  const fetchData = async () => {
    const [pkgs, prodResponse, latest] = await Promise.all([
      packagesRepo.list(),
      productsRepo.list({ limit: 1000 }),
      productPricesRepo.latestAll(),
    ]);
    const prods = Array.isArray(prodResponse) ? prodResponse : prodResponse.data;
    const prices = new Map<string, number>();
    (latest || []).forEach((row) => {
      if (row.retail_price != null) prices.set(String(row.product_id), Number(row.retail_price));
    });
    setPackages(pkgs || []);
    setProducts(prods || []);
    setRetailPrices(prices);
  };

  useEffect(() => {
    (async () => {
      try {
        await fetchData();
      } catch (error: any) {
        toast({ title: "Error", description: `Failed to load packages. ${error.message}`, variant: "destructive" });
      } finally {
        setPageLoading(false);
      }
    })();
  }, []);

  const productById = useMemo(() => {
    const map = new Map<string, ProductLite>();
    products.forEach((p) => map.set(String(p.id), p));
    return map;
  }, [products]);

  const retailOf = (productId: string | number) => retailPrices.get(String(productId)) ?? 0;
  const retailSum = (items: Array<{ productId: string | number; quantity: number }>) =>
    items.reduce((sum, item) => sum + retailOf(item.productId) * item.quantity, 0);

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setPriceText("");
    setDraftItems([]);
    setPickerValue("");
    setDialogOpen(true);
  };

  const openEdit = (pkg: PackageEntity) => {
    setEditingId(pkg.id);
    setName(pkg.name);
    setPriceText(Number(pkg.default_price).toFixed(2));
    setDraftItems(pkg.items.map((item) => ({ productId: String(item.product_id), quantity: item.quantity })));
    setPickerValue("");
    setDialogOpen(true);
  };

  // Products that can still be added (each product once per package; raise its quantity instead)
  const itemOptions = useMemo(() => {
    const taken = new Set(draftItems.map((item) => item.productId));
    return products.filter((p) => !taken.has(String(p.id)));
  }, [products, draftItems]);

  const handleAddItem = (productId: string) => {
    if (!productId) return;
    setDraftItems((prev) => (prev.some((item) => item.productId === productId) ? prev : [...prev, { productId, quantity: 1 }]));
    setPickerValue("");
  };

  const draftRetailSum = retailSum(draftItems);
  const typedPrice = parseMoney(priceText);
  // An empty price means "use the sum of the retail prices"
  const effectivePrice = priceText.trim() === "" ? draftRetailSum : typedPrice;

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: "Error", description: "Please enter a package name.", variant: "destructive" });
      return;
    }
    if (draftItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one product to the package.", variant: "destructive" });
      return;
    }
    if (!(effectivePrice > 0)) {
      toast({ title: "Error", description: "Please enter a default price above 0.", variant: "destructive" });
      return;
    }
    const input = {
      name: trimmedName,
      default_price: Math.round(effectivePrice * 100) / 100,
      items: draftItems.map((item) => ({ product_id: Number(item.productId), quantity: item.quantity })),
    };
    setLoading(true);
    try {
      if (editingId !== null) {
        await packagesRepo.update(editingId, input);
      } else {
        await packagesRepo.create(input);
      }
      toast({ title: "Success", description: `Package "${trimmedName}" saved.` });
      setDialogOpen(false);
      await fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPackage) return;
    setLoading(true);
    try {
      await packagesRepo.delete(deletingPackage.id);
      toast({ title: "Success", description: "Package deleted successfully" });
      await fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
      setDeletingPackage(null);
    }
  };

  const filteredPackages = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter((pkg) => {
      const itemNames = pkg.items.map((item) => (item.name || "").toLowerCase()).join(" ");
      return pkg.name.toLowerCase().includes(q) || itemNames.includes(q) || String(pkg.id) === q;
    });
  }, [packages, debouncedSearchQuery]);

  if (pageLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {t("packages.pageTitle", "Packages")}
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {t("packages.pageDescription", "Named sets of products with a default price. Choose one on a sell invoice and its price is split across its lines automatically.")}
            </p>
          </div>
          <Button
            onClick={openCreate}
            className="gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 font-semibold h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5 me-1.5" />
            {t("packages.newPackage", "New Package")}
          </Button>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <CardHeader className="border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pb-2 pt-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-1.5 text-sm sm:text-base">
                  <Boxes className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  {t("packages.listTitle", "Package List")}
                </CardTitle>
                <CardDescription className="text-xs">{t("packages.listDescription", "Sold on sell invoices only. Buy invoices always use each item's own cost.")}</CardDescription>
              </div>
              <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t("packages.searchPlaceholder", "Search packages (name or product)")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full ps-8 pe-8 h-8 text-sm"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="absolute end-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                    aria-label="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {packages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Boxes className="w-10 h-10 text-primary/50" />
                </div>
                <p className="text-muted-foreground text-lg">{t("packages.empty", "No packages yet. Create one to get started.")}</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="p-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">{t("packages.colName", "Package")}</TableHead>
                      <TableHead className="p-2 text-[10px] font-bold uppercase tracking-wider">{t("packages.colProducts", "Products")}</TableHead>
                      <TableHead className="p-2 text-[10px] font-bold uppercase tracking-wider text-end whitespace-nowrap">{t("packages.colDefaultPrice", "Default price")}</TableHead>
                      <TableHead className="p-2 text-[10px] font-bold uppercase tracking-wider text-end whitespace-nowrap">{t("packages.colRetailSum", "Retail sum")}</TableHead>
                      <TableHead className="p-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">{t("common.actions", "Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPackages.map((pkg) => {
                      const sum = retailSum(pkg.items.map((item) => ({ productId: item.product_id, quantity: item.quantity })));
                      const saving = sum - Number(pkg.default_price);
                      return (
                        <TableRow key={pkg.id} className="hover:bg-primary/5 transition-colors">
                          <TableCell className="p-2 text-sm font-semibold whitespace-nowrap">{pkg.name}</TableCell>
                          <TableCell className="p-2">
                            <div className="flex flex-wrap gap-1">
                              {pkg.items.map((item) => (
                                <span
                                  key={item.product_id}
                                  className="inline-flex items-center gap-1 rounded-md bg-primary-light px-1.5 py-0.5 text-[11px] font-medium text-primary-strong"
                                >
                                  <span className="font-bold tabular-nums">{item.quantity}×</span>
                                  {item.name}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="p-2 text-end text-sm font-bold tabular-nums whitespace-nowrap">{usd(Number(pkg.default_price))}</TableCell>
                          <TableCell className="p-2 text-end text-xs tabular-nums whitespace-nowrap">
                            <div>{usd(sum)}</div>
                            {saving > 0.004 && (
                              <div className="text-[11px] font-semibold text-success-strong">
                                {t("packages.savesShort", "saves {{amount}}", { amount: usd(saving) })}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="p-2">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(pkg)}
                                className="hover:bg-primary/10 h-7 w-7 p-0"
                                aria-label={`Edit ${pkg.name}`}
                              >
                                <Pencil className="w-3.5 h-3.5 text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDeletingPackage(pkg);
                                  setDeleteOpen(true);
                                }}
                                className="hover:bg-destructive/10 h-7 w-7 p-0"
                                aria-label={`Delete ${pkg.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create / Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingId !== null ? t("packages.editPackage", "Edit Package") : t("packages.newPackage", "New Package")}</DialogTitle>
              <DialogDescription>
                {t("packages.dialogDescription", "Name the package, set its default price, and add each product with the quantity one package contains.")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <div className="space-y-1">
                  <Label htmlFor="package-name" className="text-[11px] font-medium">{t("packages.name", "Package name")}</Label>
                  <Input
                    id="package-name"
                    value={name}
                    maxLength={150}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("packages.namePlaceholder", "e.g. Security Camera Kit")}
                    className="h-8 text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="package-price" className="text-[11px] font-medium">{t("packages.defaultPriceLabel", "Default price")}</Label>
                  <div className="flex h-8 items-stretch">
                    <span className="grid place-items-center rounded-s-lg border border-e-0 border-input bg-muted px-2.5 font-semibold text-muted-foreground" aria-hidden="true">$</span>
                    <input
                      id="package-price"
                      inputMode="decimal"
                      autoComplete="off"
                      value={priceText}
                      onChange={(e) => setPriceText(e.target.value.replace(",", "."))}
                      placeholder={draftRetailSum > 0 ? draftRetailSum.toFixed(2) : "0.00"}
                      aria-invalid={priceText.trim() !== "" && !(typedPrice > 0)}
                      className="w-full min-w-0 rounded-e-lg border border-input bg-background px-2.5 text-[13px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 aria-[invalid=true]:border-destructive dark:bg-card/50"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {t("packages.retailSumHint", "Sum of retail prices: {{sum}}", { sum: usd(draftRetailSum) })}
                {priceText.trim() === "" && draftRetailSum > 0 && <> · {t("packages.emptyUsesSum", "left empty, the package uses this sum")}</>}
                {effectivePrice > 0 && draftRetailSum - effectivePrice > 0.004 && (
                  <> · <span className="font-semibold text-success-strong">{t("packages.savesShort", "saves {{amount}}", { amount: usd(draftRetailSum - effectivePrice) })}</span></>
                )}
              </p>

              <div className="space-y-1">
                <Label className="text-[11px] font-medium">{t("packages.addProduct", "Add product")}</Label>
                <ProductCombobox
                  products={itemOptions}
                  value={pickerValue}
                  onValueChange={handleAddItem}
                  placeholder={t("packages.addProductPlaceholder", "Search and add a product")}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-medium">
                  {t("packages.itemsLabel", "Products in one package ({{count}})", { count: draftItems.length })}
                </Label>
                {draftItems.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                    {t("packages.noItems", "No products added yet.")}
                  </div>
                ) : (
                  <div className="max-h-[280px] space-y-1 overflow-y-auto rounded-lg border-2 p-1.5">
                    {draftItems.map((item) => {
                      const product = productById.get(item.productId);
                      const code = product?.barcode || product?.sku;
                      const retail = retailOf(item.productId);
                      return (
                        <div key={item.productId} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md bg-muted/40 px-2 py-1">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium">{product?.name || `#${item.productId}`}</div>
                            <div className="text-[11px] tabular-nums text-muted-foreground">
                              {code && <span className="font-mono">{code} · </span>}
                              {retail > 0 ? `${usd(retail)} ${t("packages.eachRetail", "each (retail)")}` : t("packages.noRetail", "no retail price")}
                            </div>
                          </div>
                          <QtyStepper
                            className="w-[110px]"
                            value={item.quantity}
                            aria-label={`Quantity of ${product?.name || item.productId}`}
                            onChange={(quantity) =>
                              setDraftItems((prev) => prev.map((d) => (d.productId === item.productId ? { ...d, quantity } : d)))
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDraftItems((prev) => prev.filter((d) => d.productId !== item.productId))}
                            className="h-7 w-7 p-0 hover:bg-destructive/10"
                            aria-label={`Remove ${product?.name || item.productId}`}
                          >
                            <X className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Button onClick={handleSave} className="w-full h-9 mt-1" disabled={loading}>
                {loading ? t("packages.saving", "Saving...") : t("packages.save", "Save Package")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("packages.deleteTitle", "Delete Package")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("packages.deleteDescription", "This deletes the package \"{{name}}\". Its products are not deleted, and invoices that already sold it keep their package details.", { name: deletingPackage?.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("common.delete", "Delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Packages;
