import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DollarSign, TrendingUp, Filter, X, Plus, Pencil, Trash2, Search } from "lucide-react";
import { formatDateTimeLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { productPricesRepo, productsRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import ProductNameWithCode from "@/components/ProductNameWithCode";

const ProductPrices = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productsWithoutPrices, setProductsWithoutPrices] = useState<any[]>([]);
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
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pricesData, prodsResponse] = await Promise.all([
        productPricesRepo.listAll({}),
        productsRepo.list({ limit: 1000 }),
      ]);
      const prods = Array.isArray(prodsResponse) ? prodsResponse : prodsResponse.data;
      
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

  // Fetch products without prices when add dialog opens
  const fetchProductsWithoutPrices = async () => {
    try {
      const prods = await productsRepo.listWithoutPrices();
      setProductsWithoutPrices(prods || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Handle add dialog open/close
  const handleAddDialogOpenChange = (open: boolean) => {
    setIsAddOpen(open);
    if (open) {
      fetchProductsWithoutPrices();
      setAddProductId("");
    }
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

  const filteredPrices = prices.filter(price => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const productName = (price.product_name || "").toLowerCase();
      const productId = (price.product_id || "").toString();
      return productName.includes(query) || productId.includes(query);
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              💵 {t('productPrices.title')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{t('productPrices.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5 h-8 text-xs"
            >
              <Filter className="w-3.5 h-3.5" />
              {showFilters ? t('common.hideFilters') : t('common.showFilters')}
            </Button>
            <Dialog open={isAddOpen} onOpenChange={handleAddDialogOpenChange}>
              <DialogTrigger asChild>
                <Button className="gap-1.5 h-8 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  {t('productPrices.addPrice')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('productPrices.addPrice')}</DialogTitle>
                  <DialogDescription>{t('productPrices.subtitle')}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>{t('invoiceForm.product')}</Label>
                    {productsWithoutPrices.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-2 border rounded-md">
                        No products without prices available. All products already have prices.
                      </div>
                    ) : (
                      <Select value={addProductId} onValueChange={setAddProductId} required>
                        <SelectTrigger>
                          <SelectValue placeholder={t('invoiceForm.selectProduct')} />
                        </SelectTrigger>
                        <SelectContent side="bottom" align="start">
                          {productsWithoutPrices.map((product) => (
                            <SelectItem key={product.id} value={String(product.id)}>
                              <ProductNameWithCode 
                                product={product}
                                showId={true}
                                id={product.id}
                              />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <input type="hidden" name="product_id" value={addProductId} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('productPrices.wholesalePrice')}</Label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      name="wholesale_price" 
                      placeholder="0.00" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('productPrices.retailPrice')}</Label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      name="retail_price" 
                      placeholder="0.00" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('productPrices.effectiveDate')}</Label>
                    <Input 
                      type="date" 
                      name="effective_date" 
                      defaultValue={getTodayLebanon()}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={formLoading}>
                    {formLoading ? t('common.loading') : t('common.save')}
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
                <Label>{t('invoiceForm.product')}</Label>
                <Select value={filters.product_id} onValueChange={(value) => setFilters({...filters, product_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('invoices.allProducts')} />
                  </SelectTrigger>
                  <SelectContent side="bottom" align="start">
                    <SelectItem value="all">{t('invoices.allProducts')}</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <ProductNameWithCode 
                          product={product}
                          showId={true}
                          id={product.id}
                        />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>{t('invoices.startDate')}</Label>
                <Input
                  type="date"
                  value={filters.start_date}
                  onChange={(e) => {
                    const newStartDate = e.target.value;
                    setFilters({...filters, start_date: newStartDate});
                    // If end date is before new start date, update end date
                    if (filters.end_date && newStartDate > filters.end_date) {
                      setFilters({...filters, start_date: newStartDate, end_date: newStartDate});
                    }
                  }}
                  max={filters.end_date || getTodayLebanon()}
                />
              </div>
              
              <div className="space-y-2">
                <Label>{t('invoices.endDate')}</Label>
                <Input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) => {
                    const newEndDate = e.target.value;
                    if (!filters.start_date || newEndDate >= filters.start_date) {
                      setFilters({...filters, end_date: newEndDate});
                    }
                  }}
                  min={filters.start_date}
                  max={getTodayLebanon()}
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button onClick={applyFilters}>{t('common.apply')}</Button>
              <Button variant="outline" onClick={clearFilters}>
                <X className="w-4 h-4 mr-2" />
                {t('common.clear')}
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
                <p className="text-lg">{t('productPrices.noPrices')}</p>
              </div>
            ) : (
              <>
                <div className="relative w-full sm:w-auto sm:max-w-md mb-2">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search prices (product name, ID)"
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
                <div className="rounded-xl border-2 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5">
                        <TableHead className="font-bold p-2 pl-2 text-xs">{t('invoiceForm.product')}</TableHead>
                        <TableHead className="font-bold p-2 text-xs">{t('productPrices.effectiveDate')}</TableHead>
                        <TableHead className="text-right font-bold p-2 text-xs">{t('productPrices.wholesalePrice')}</TableHead>
                        <TableHead className="text-right font-bold p-2 text-xs">{t('productPrices.retailPrice')}</TableHead>
                        <TableHead className="text-center font-bold p-2 text-xs">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPrices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                            No prices found matching your search
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPrices.map((price, idx) => (
                      <TableRow 
                        key={price.id}
                        className="hover:bg-primary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.01}s` }}
                      >
                        <TableCell className="font-semibold p-2 pl-2 text-sm">
                          <ProductNameWithCode 
                            product={price}
                            showId={true}
                            product_id={price.product_id}
                            nameClassName="text-sm"
                          />
                        </TableCell>
                        <TableCell className="text-xs p-2">
                          {formatDateTimeLebanon(price.effective_date, "MMM dd, yyyy")}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-warning p-2 text-xs">
                          ${parseFloat(price.wholesale_price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary p-2 text-xs">
                          ${parseFloat(price.retail_price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center p-2">
                          <div className="flex gap-1 justify-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(price)}
                              className="h-7 w-7 p-0"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(price.id)}
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('productPrices.editPrice')}</DialogTitle>
              <DialogDescription>{t('productPrices.updatePrice')}</DialogDescription>
            </DialogHeader>
            {editingPrice && (
              <form onSubmit={handleUpdate} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t('invoiceForm.product')}</Label>
                  <Input 
                    value={editingPrice.product_name || ''} 
                    disabled 
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('productPrices.wholesalePrice')}</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    name="wholesale_price" 
                    defaultValue={editingPrice.wholesale_price}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('productPrices.retailPrice')}</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    name="retail_price" 
                    defaultValue={editingPrice.retail_price}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('productPrices.effectiveDate')}</Label>
                  <Input 
                    type="date" 
                    name="effective_date" 
                    defaultValue={editingPrice.effective_date?.split('T')[0] || getTodayLebanon()}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={formLoading}>
                  {formLoading ? t('productPrices.updating') : t('productPrices.updatePrice')}
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
