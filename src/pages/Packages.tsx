import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Boxes, Pencil, Trash2, Search, X } from "lucide-react";
import { packagesRepo, productsRepo, type PackageEntity } from "@/integrations/api/repo";
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
import { useDebounce } from "@/hooks/useDebounce";

interface ProductLite {
  id: number | string;
  name?: string | null;
  barcode?: string | null;
  sku?: string | null;
}

const Packages = () => {
  const { toast } = useToast();
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<PackageEntity[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [packageProductId, setPackageProductId] = useState("");
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [pickerValue, setPickerValue] = useState("");

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingPackage, setDeletingPackage] = useState<PackageEntity | null>(null);

  const fetchData = async () => {
    const [pkgs, prodResponse] = await Promise.all([
      packagesRepo.list(),
      productsRepo.list({ limit: 1000 }),
    ]);
    const prods = Array.isArray(prodResponse) ? prodResponse : prodResponse.data;
    setPackages(pkgs || []);
    setProducts(prods || []);
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

  const productLabel = (id: string | number) => {
    const p = productById.get(String(id));
    if (!p) return `#${id}`;
    const code = p.barcode || p.sku;
    return `${p.name || "N/A"}${code ? ` (${code})` : ""}`;
  };

  // Products that are already packages (so a package isn't also a component, and to avoid duplicates)
  const existingPackageIds = useMemo(
    () => new Set(packages.map((pkg) => String(pkg.package_product_id))),
    [packages]
  );

  const openCreate = () => {
    setIsEditing(false);
    setPackageProductId("");
    setComponentIds([]);
    setPickerValue("");
    setDialogOpen(true);
  };

  const openEdit = (pkg: PackageEntity) => {
    setIsEditing(true);
    setPackageProductId(String(pkg.package_product_id));
    setComponentIds(pkg.components.map((c) => String(c.component_product_id)));
    setPickerValue("");
    setDialogOpen(true);
  };

  // Products available to be selected as the package itself (exclude already-defined packages when creating)
  const packageProductOptions = useMemo(() => {
    if (isEditing) return products;
    return products.filter((p) => !existingPackageIds.has(String(p.id)));
  }, [products, existingPackageIds, isEditing]);

  // Products available to add as components (exclude the package itself and already-added components)
  const componentOptions = useMemo(() => {
    const taken = new Set(componentIds);
    return products.filter((p) => String(p.id) !== packageProductId && !taken.has(String(p.id)));
  }, [products, packageProductId, componentIds]);

  const handleAddComponent = (id: string) => {
    if (!id) return;
    if (id === packageProductId) {
      toast({ title: "Invalid", description: "A package cannot contain itself.", variant: "destructive" });
      return;
    }
    setComponentIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setPickerValue("");
  };

  const handleRemoveComponent = (id: string) => {
    setComponentIds((prev) => prev.filter((c) => c !== id));
  };

  const handleSave = async () => {
    if (!packageProductId) {
      toast({ title: "Error", description: "Please select the package product.", variant: "destructive" });
      return;
    }
    if (componentIds.length === 0) {
      toast({ title: "Error", description: "Please add at least one component product.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await packagesRepo.save(packageProductId, componentIds);
      toast({ title: "Success", description: `Package saved with ${componentIds.length} component(s).` });
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
      await packagesRepo.delete(deletingPackage.package_product_id);
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
      const name = (pkg.package_name || "").toLowerCase();
      const code = `${pkg.package_barcode || ""} ${pkg.package_sku || ""}`.toLowerCase();
      const componentNames = pkg.components.map((c) => (c.name || "").toLowerCase()).join(" ");
      return name.includes(q) || code.includes(q) || componentNames.includes(q) || String(pkg.package_product_id).includes(q);
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
              📦 Packages
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Group products into a package. Selecting the package on an invoice auto-adds its component rows.
            </p>
          </div>
          <Button
            onClick={openCreate}
            className="gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 font-semibold h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Package
          </Button>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <CardHeader className="border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pb-2 pt-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-1.5 text-sm sm:text-base">
                  <Boxes className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  Package List
                </CardTitle>
                <CardDescription className="text-[10px] sm:text-xs">All your defined product packages</CardDescription>
              </div>
              <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search packages (name, component, code, ID)"
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
          </CardHeader>
          <CardContent className="pt-2">
            {packages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Boxes className="w-10 h-10 text-primary/50" />
                </div>
                <p className="text-muted-foreground text-lg">No packages yet. Create one to get started.</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10">
                      <TableHead className="font-bold whitespace-nowrap p-2 text-xs">Package Product</TableHead>
                      <TableHead className="font-bold p-2 text-xs">Components</TableHead>
                      <TableHead className="font-bold whitespace-nowrap p-2 text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPackages.map((pkg, idx) => (
                      <TableRow
                        key={pkg.package_product_id}
                        className="hover:bg-primary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <TableCell className="font-medium p-2 text-sm">
                          <div>{pkg.package_name}</div>
                          {(pkg.package_barcode || pkg.package_sku) && (
                            <div className="text-[10px] text-muted-foreground">{pkg.package_barcode || pkg.package_sku}</div>
                          )}
                        </TableCell>
                        <TableCell className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {pkg.components.map((c) => (
                              <span
                                key={c.component_product_id}
                                className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                              >
                                {c.name}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="p-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(pkg)}
                              className="hover:bg-primary/10 hover:scale-110 transition-all duration-300 h-7 w-7 p-0"
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
                              className="hover:bg-destructive/10 hover:scale-110 transition-all duration-300 h-7 w-7 p-0"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create / Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{isEditing ? "Edit Package" : "New Package"}</DialogTitle>
              <DialogDescription>
                Pick the package product, then add the component products that come with it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Package Product</Label>
                <ProductCombobox
                  products={packageProductOptions}
                  value={packageProductId}
                  onValueChange={(v) => {
                    setPackageProductId(v);
                    // If the newly chosen package is in the component list, remove it
                    setComponentIds((prev) => prev.filter((c) => c !== v));
                  }}
                  placeholder="Select the package product"
                  disabled={isEditing}
                />
                {isEditing && (
                  <p className="text-[10px] text-muted-foreground">The package product can't be changed. Delete and recreate to change it.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Add Component</Label>
                <ProductCombobox
                  products={componentOptions}
                  value={pickerValue}
                  onValueChange={handleAddComponent}
                  placeholder="Search and add a component product"
                  disabled={!packageProductId}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Components ({componentIds.length})</Label>
                {componentIds.length === 0 ? (
                  <div className="rounded-md border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                    No components added yet.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[240px] overflow-y-auto rounded-md border-2 p-1.5">
                    {componentIds.map((id) => (
                      <div key={id} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1">
                        <span className="text-xs">{productLabel(id)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveComponent(id)}
                          className="h-6 w-6 p-0 hover:bg-destructive/10"
                        >
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={handleSave} className="w-full h-9 mt-1" disabled={loading}>
                {loading ? "Saving..." : "Save Package"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Package</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the package definition for "{deletingPackage?.package_name}". The products themselves are not deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Packages;
