import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DollarSign, TrendingUp, Filter, X, Plus, Pencil, Trash2 } from "lucide-react";
import { formatDateTimeLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { productPricesRepo, productsRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";

const ProductPrices = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    product_id: "all",
    start_date: "",
    end_date: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [addProductId, setAddProductId] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pricesData, prods] = await Promise.all([
        productPricesRepo.listAll({}),
        productsRepo.list(),
      ]);
      
      setPrices(pricesData || []);
      setProducts(prods || []);
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

  const applyFilters = async () => {
    setLoading(true);
    try {
      const filterObj: any = {};
      if (filters.product_id && filters.product_id !== "all") filterObj.product_id = filters.product_id;
      if (filters.start_date) filterObj.start_date = filters.start_date;
      if (filters.end_date) filterObj.end_date = filters.end_date;
      
      const pricesData = await productPricesRepo.listAll(filterObj);
      setPrices(pricesData || []);
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

  const clearFilters = () => {
    setFilters({ product_id: "all", start_date: "", end_date: "" });
    fetchData();
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      await productPricesRepo.create({
        product_id: addProductId || formData.get("product_id") as string,
        wholesale_price: parseFloat(formData.get("wholesale_price") as string),
        retail_price: parseFloat(formData.get("retail_price") as string),
        effective_date: formData.get("effective_date") as string || undefined,
      });
      toast({
        title: "Success",
        description: "Product price added successfully",
      });
      setIsAddOpen(false);
      setAddProductId("");
      (e.target as HTMLFormElement).reset();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (price: any) => {
    setEditingPrice(price);
    setIsEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      await productPricesRepo.update(editingPrice.id, {
        wholesale_price: parseFloat(formData.get("wholesale_price") as string),
        retail_price: parseFloat(formData.get("retail_price") as string),
        effective_date: formData.get("effective_date") as string || undefined,
      });
      toast({
        title: "Success",
        description: "Product price updated successfully",
      });
      setIsEditOpen(false);
      setEditingPrice(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this price record?")) return;
    
    try {
      await productPricesRepo.delete(id);
      toast({
        title: "Success",
        description: "Product price deleted successfully",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              Product Prices
            </h1>
            <p className="text-muted-foreground">Manage wholesale and retail prices for products</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Price
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Product Price</DialogTitle>
                  <DialogDescription>Create a new price record for a product</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Product</Label>
                    <Select value={addProductId} onValueChange={setAddProductId} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            <span className="text-muted-foreground text-xs">#{product.id}</span> {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="product_id" value={addProductId} />
                  </div>
                  <div className="space-y-2">
                    <Label>Wholesale Price</Label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      name="wholesale_price" 
                      placeholder="0.00" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Retail Price</Label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      name="retail_price" 
                      placeholder="0.00" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Effective Date</Label>
                    <Input 
                      type="date" 
                      name="effective_date" 
                      defaultValue={getTodayLebanon()}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={formLoading}>
                    {formLoading ? "Saving..." : "Save Price"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="border-2 rounded-lg p-4 bg-muted/20">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={filters.product_id} onValueChange={(value) => setFilters({...filters, product_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <span className="text-muted-foreground text-xs">#{product.id}</span> {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={filters.start_date}
                  onChange={(e) => setFilters({...filters, start_date: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) => setFilters({...filters, end_date: e.target.value})}
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button onClick={applyFilters}>Apply Filters</Button>
              <Button variant="outline" onClick={clearFilters}>
                <X className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Prices Table */}
        <div className="border-2 rounded-lg overflow-hidden">
          <div className="border-b bg-gradient-to-br from-primary/5 to-accent/5 p-4">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <DollarSign className="w-5 h-5 text-primary" />
              Price Records
            </h3>
            <p className="text-sm text-muted-foreground">All product price entries</p>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {Array(10).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : prices.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg">No price records found</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5">
                      <TableHead className="font-bold">Product</TableHead>
                      <TableHead className="font-bold">Effective Date</TableHead>
                      <TableHead className="text-right font-bold">Wholesale Price</TableHead>
                      <TableHead className="text-right font-bold">Retail Price</TableHead>
                      <TableHead className="text-center font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prices.map((price, idx) => (
                      <TableRow 
                        key={price.id}
                        className="hover:bg-primary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.01}s` }}
                      >
                        <TableCell className="font-semibold"><span className="text-muted-foreground text-sm">#{price.product_id}</span> {price.product_name}</TableCell>
                        <TableCell className="text-sm">
                          {formatDateTimeLebanon(price.effective_date, "MMM dd, yyyy")}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-warning">
                          ${parseFloat(price.wholesale_price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          ${parseFloat(price.retail_price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-2 justify-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(price)}
                              className="h-8 w-8 p-0"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(price.id)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
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
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Product Price</DialogTitle>
              <DialogDescription>Update price information</DialogDescription>
            </DialogHeader>
            {editingPrice && (
              <form onSubmit={handleUpdate} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Input 
                    value={editingPrice.product_name || ''} 
                    disabled 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Wholesale Price</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    name="wholesale_price" 
                    defaultValue={editingPrice.wholesale_price}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Retail Price</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    name="retail_price" 
                    defaultValue={editingPrice.retail_price}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Effective Date</Label>
                  <Input 
                    type="date" 
                    name="effective_date" 
                    defaultValue={editingPrice.effective_date?.split('T')[0] || getTodayLebanon()}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={formLoading}>
                  {formLoading ? "Updating..." : "Update Price"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ProductPrices;
