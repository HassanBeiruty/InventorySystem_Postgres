import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Package, Pencil, Download } from "lucide-react";
import { productsRepo, categoriesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const Products = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [editFormCategoryId, setEditFormCategoryId] = useState<string>("");
  const { toast } = useToast();

  const fetchProducts = async () => {
    const data = await productsRepo.list();
    setProducts(data || []);
  };

  const fetchCategories = async () => {
    const data = await categoriesRepo.list();
    setCategories(data || []);
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
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

    try {
      await productsRepo.add({
        name,
        barcode: barcode || null,
        category_id: formCategoryId ? parseInt(formCategoryId) : null,
        description: description || null,
        sku: sku || null,
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

    try {
      await productsRepo.update(editingProduct.id, {
        name,
        barcode: barcode || null,
        category_id: editFormCategoryId ? parseInt(editFormCategoryId) : null,
        description: description || null,
        sku: sku || null,
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

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              Products
            </h2>
            <p className="text-muted-foreground text-lg">Manage your product inventory</p>
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
                  Add Product
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
                <DialogDescription>Create a new product in your inventory</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input id="name" name="name" placeholder="Enter product name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input id="sku" name="sku" placeholder="Enter SKU (optional)" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input id="barcode" name="barcode" placeholder="Enter barcode (optional)" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category_id">Category</Label>
                  <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" placeholder="Enter product description (optional)" rows={3} />
                </div>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Saving..." : "Save Product"}
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
                  Product List
                </CardTitle>
                <CardDescription className="text-base">All your products</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="category-filter">Filter by Category:</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger id="category-filter" className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
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
                    ? "No products yet. Add your first product to get started."
                    : "No products found in selected category."}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10">
                      <TableHead className="font-bold">Name</TableHead>
                      <TableHead className="font-bold">SKU</TableHead>
                      <TableHead className="font-bold">Barcode</TableHead>
                      <TableHead className="font-bold">Category</TableHead>
                      <TableHead className="font-bold">Description</TableHead>
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
                        <TableCell className="text-muted-foreground">{product.barcode || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{product.category_name || "-"}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate" title={product.description || ""}>{product.description || "-"}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleEdit(product)}
                            className="hover:bg-primary/10 hover:scale-110 transition-all duration-300"
                          >
                            <Pencil className="w-4 h-4 text-primary" />
                          </Button>
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
              <DialogTitle>Edit Product</DialogTitle>
              <DialogDescription>Update product information</DialogDescription>
            </DialogHeader>
            {editingProduct && (
              <form onSubmit={handleUpdate} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Product Name</Label>
                  <Input id="edit-name" name="name" defaultValue={editingProduct.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sku">SKU</Label>
                  <Input id="edit-sku" name="sku" defaultValue={editingProduct.sku || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-barcode">Barcode</Label>
                  <Input id="edit-barcode" name="barcode" defaultValue={editingProduct.barcode || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-category_id">Category</Label>
                  <Select value={editFormCategoryId} onValueChange={setEditFormCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea id="edit-description" name="description" defaultValue={editingProduct.description || ""} rows={3} />
                </div>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Updating..." : "Update Product"}
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
