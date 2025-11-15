import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Package, Pencil, Download, Trash2 } from "lucide-react";
import { productsRepo, categoriesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";

const Products = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [editFormCategoryId, setEditFormCategoryId] = useState<string>("");
  const { toast } = useToast();

  const fetchProducts = async () => {
    try {
    const data = await productsRepo.list();
    setProducts(data || []);
    } catch (error: any) {
      console.error('Error fetching products:', error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to load products", 
        variant: "destructive" 
      });
      setProducts([]);
    } finally {
      setPageLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await categoriesRepo.list();
      setCategories(data || []);
    } catch (error: any) {
      console.error('Error fetching categories:', error);
      // Don't show toast for categories - just log
      setCategories([]);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setPageLoading(true);
      await Promise.all([fetchProducts(), fetchCategories()]);
    };
    loadData();
  }, []);

  const filteredProducts = selectedCategory === "all" 
    ? products 
    : products.filter(p => p.category_id?.toString() === selectedCategory);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const barcode = formData.get("barcode") as string;
    const description = formData.get("description") as string;
    const sku = formData.get("sku") as string;
    const shelf = formData.get("shelf") as string;

    try {
      await productsRepo.add({
        name,
        barcode: barcode || null,
        category_id: formCategoryId ? parseInt(formCategoryId) : null,
        description: description || null,
        sku: sku || null,
        shelf: shelf || null,
      });
    } catch (error: any) {
      setLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: "Success", description: "Product added successfully" });
    setIsOpen(false);
    setFormCategoryId("");
    e.currentTarget.reset();
    fetchProducts();
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setEditFormCategoryId(product.category_id?.toString() || "");
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const barcode = formData.get("barcode") as string;
    const description = formData.get("description") as string;
    const sku = formData.get("sku") as string;
    const shelf = formData.get("shelf") as string;

    try {
      await productsRepo.update(editingProduct.id, {
        name,
        barcode: barcode || null,
        category_id: editFormCategoryId ? parseInt(editFormCategoryId) : null,
        description: description || null,
        sku: sku || null,
        shelf: shelf || null,
      });
    } catch (error: any) {
      setLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: "Success", description: "Product updated successfully" });
    setEditOpen(false);
    setEditingProduct(null);
    setEditFormCategoryId("");
    fetchProducts();
  };

  const handleDelete = async (product: any) => {
    if (!confirm(`Are you sure you want to delete "${product.name}"? This will also delete all stock movements, daily stock records, and invoice items for this product. This action cannot be undone.`)) {
      return;
    }

    try {
      await productsRepo.delete(product.id);
      toast({
        title: "Success",
        description: "Product deleted successfully",
      });
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete product",
        variant: "destructive",
      });
    }
  };

  if (pageLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-8 animate-fade-in">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {t('products.title')}
            </h2>
            <p className="text-muted-foreground text-lg">{t('products.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => window.open('/api/export/products', '_blank')}
              className="hover:scale-105 transition-all duration-300 font-semibold"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 font-semibold">
                <Plus className="w-4 h-4 mr-2" />
                {t('products.addProduct')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('products.addProduct')}</DialogTitle>
                <DialogDescription>{t('products.subtitle')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('products.productName')}</Label>
                  <Input id="name" name="name" placeholder={t('products.productName')} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input id="sku" name="sku" placeholder="SKU (optional)" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shelf">Shelf</Label>
                  <Input id="shelf" name="shelf" placeholder="Shelf (optional)" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barcode">{t('products.barcode')}</Label>
                  <Input id="barcode" name="barcode" placeholder={t('products.barcode')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category_id">{t('categories.title')}</Label>
                  <Select value={formCategoryId || undefined} onValueChange={(val) => setFormCategoryId(val === "none" ? "" : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder={`${t('common.all')} ${t('categories.title')}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('common.all')}</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">{t('categories.description')}</Label>
                  <Textarea id="description" name="description" placeholder={t('categories.description')} rows={3} />
                </div>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('common.loading') : t('common.save')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <CardHeader className="border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
            <div className="flex items-center justify-between">
              <div>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Package className="w-6 h-6 text-primary" />
              {t('products.title')}
            </CardTitle>
            <CardDescription className="text-base">{t('products.subtitle')}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="category-filter">{t('common.filter')} {t('categories.title')}:</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger id="category-filter" className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')} {t('categories.title')}</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Package className="w-10 h-10 text-primary/50" />
                </div>
                <p className="text-muted-foreground text-lg">
                  {products.length === 0 
                    ? t('products.noProducts')
                    : t('products.noProducts')}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10">
                      <TableHead className="font-bold">{t('products.productName')}</TableHead>
                      <TableHead className="font-bold">SKU</TableHead>
                      <TableHead className="font-bold">Shelf</TableHead>
                      <TableHead className="font-bold">{t('products.barcode')}</TableHead>
                      <TableHead className="font-bold">{t('categories.title')}</TableHead>
                      <TableHead className="font-bold">{t('categories.description')}</TableHead>
                      <TableHead className="font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product, idx) => (
                      <TableRow 
                        key={product.id} 
                        className="hover:bg-primary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <TableCell className="font-medium"><span className="text-muted-foreground text-sm">#{product.id}</span> {product.name}</TableCell>
                        <TableCell className="text-muted-foreground">{product.sku || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{product.shelf || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{product.barcode || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{product.category_name || "-"}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate" title={product.description || ""}>{product.description || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleEdit(product)}
                              className="hover:bg-primary/10 hover:scale-110 transition-all duration-300"
                            >
                              <Pencil className="w-4 h-4 text-primary" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleDelete(product)}
                              className="hover:bg-destructive/10 hover:scale-110 transition-all duration-300 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
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

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('products.editProduct')}</DialogTitle>
              <DialogDescription>{t('products.subtitle')}</DialogDescription>
            </DialogHeader>
            {editingProduct && (
              <form onSubmit={handleUpdate} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">{t('products.productName')}</Label>
                  <Input id="edit-name" name="name" defaultValue={editingProduct.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sku">SKU</Label>
                  <Input id="edit-sku" name="sku" defaultValue={editingProduct.sku || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-shelf">Shelf</Label>
                  <Input id="edit-shelf" name="shelf" defaultValue={editingProduct.shelf || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-barcode">{t('products.barcode')}</Label>
                  <Input id="edit-barcode" name="barcode" defaultValue={editingProduct.barcode || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-category_id">{t('categories.title')}</Label>
                  <Select value={editFormCategoryId || undefined} onValueChange={(val) => setEditFormCategoryId(val === "none" ? "" : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder={`${t('common.all')} ${t('categories.title')}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('common.all')}</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">{t('categories.description')}</Label>
                  <Textarea id="edit-description" name="description" defaultValue={editingProduct.description || ""} rows={3} />
                </div>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('common.loading') : t('common.save')}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Products;
