import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Package, Pencil } from "lucide-react";
import { productsRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const Products = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const { toast } = useToast();

  const fetchProducts = async () => {
    const data = await productsRepo.list();
    setProducts(data || []);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const barcode = formData.get("barcode") as string;
    

    try {
      await productsRepo.add({
        name,
        barcode: barcode || null,
      });
    } catch (error: any) {
      setLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: "Success", description: "Product added successfully" });
    setIsOpen(false);
    e.currentTarget.reset();
    fetchProducts();
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const barcode = formData.get("barcode") as string;
    

    try {
      await productsRepo.update(editingProduct.id, {
        name,
        barcode: barcode || null,
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
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input id="barcode" name="barcode" placeholder="Enter barcode (optional)" />
                </div>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Saving..." : "Save Product"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <CardHeader className="border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Package className="w-6 h-6 text-primary" />
              Product List
            </CardTitle>
            <CardDescription className="text-base">All your products</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Package className="w-10 h-10 text-primary/50" />
                </div>
                <p className="text-muted-foreground text-lg">No products yet. Add your first product to get started.</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10">
                      <TableHead className="font-bold">Name</TableHead>
                      <TableHead className="font-bold">Barcode</TableHead>
                      
                      <TableHead className="font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product, idx) => (
                      <TableRow 
                        key={product.id} 
                        className="hover:bg-primary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-muted-foreground">{product.barcode || "-"}</TableCell>
                        
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
                  <Label htmlFor="edit-barcode">Barcode</Label>
                  <Input id="edit-barcode" name="barcode" defaultValue={editingProduct.barcode} />
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
