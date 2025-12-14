import React, { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Package, Pencil, Download, Trash2, Scan, Search, X, Upload, FileSpreadsheet, ChevronDown } from "lucide-react";
import { productsRepo, categoriesRepo, productPricesRepo } from "@/integrations/api/repo";
import { getTodayLebanon } from "@/utils/dateUtils";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const Products = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [editFormCategoryId, setEditFormCategoryId] = useState<string>("");
  const [latestPrice, setLatestPrice] = useState<{ wholesale_price: number | null; retail_price: number | null } | null>(null);
  const [wholesalePrice, setWholesalePrice] = useState<string>("");
  const [retailPrice, setRetailPrice] = useState<string>("");
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchProducts = async () => {
    try {
    const data = await productsRepo.list();
    setProducts(data || []);
    } catch (error: any) {
      console.error('Error fetching products:', error);
      toast({ 
        title: t('common.error'), 
        description: error.message || t('products.failedToLoadProducts'), 
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

  const filteredProducts = products.filter(p => {
    // Search filter - search across all fields
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const name = (p.name || "").toLowerCase();
      const barcode = (p.barcode || "").toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      const shelf = (p.shelf || "").toLowerCase();
      const category = (p.category_name || "").toLowerCase();
      const description = (p.description || "").toLowerCase();
      const id = (p.id || "").toString();
      
      return name.includes(query) || 
             barcode.includes(query) || 
             sku.includes(query) || 
             shelf.includes(query) || 
             category.includes(query) || 
             description.includes(query) ||
             id.includes(query);
    }
    
    return true;
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const barcode = formData.get("barcode") as string;
    const description = formData.get("description") as string;
    const sku = formData.get("sku") as string;
    const shelf = formData.get("shelf") as string;
    const wholesalePrice = formData.get("wholesale_price") as string;
    const retailPrice = formData.get("retail_price") as string;

    try {
      // Add product
      const result = await productsRepo.add({
        name,
        barcode: barcode || null,
        category_id: formCategoryId ? parseInt(formCategoryId) : null,
        description: description || null,
        sku: sku || null,
        shelf: shelf || null,
      });

      // Add pricing if provided
      const wholesale = wholesalePrice?.trim() ? parseFloat(wholesalePrice) : null;
      const retail = retailPrice?.trim() ? parseFloat(retailPrice) : null;
      
      if (wholesale !== null && retail !== null && !isNaN(wholesale) && !isNaN(retail) && result?.id) {
        try {
          await productPricesRepo.create({
            product_id: result.id.toString(),
            wholesale_price: wholesale,
            retail_price: retail,
            effective_date: getTodayLebanon(),
          });
        } catch (priceError) {
          // Log but don't fail the product creation
          console.error('Price creation error:', priceError);
        }
      }
    } catch (error: any) {
      setLoading(false);
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: t('common.success'), description: t('products.productAdded') });
    setFormCategoryId("");
    if (e.currentTarget) {
      e.currentTarget.reset();
    }
    setIsOpen(false);
    fetchProducts();
  };

  const handleEdit = async (product: any) => {
    setEditingProduct(product);
    setEditFormCategoryId(product.category_id?.toString() || "");
    setWholesalePrice("");
    setRetailPrice("");
    
    // Fetch latest price for this product
    try {
      const price = await productPricesRepo.latestForProduct(product.id.toString());
      if (price) {
        setLatestPrice({ wholesale_price: price.wholesale_price, retail_price: price.retail_price });
        setWholesalePrice(price.wholesale_price.toString());
        setRetailPrice(price.retail_price.toString());
      } else {
        setLatestPrice(null);
      }
    } catch (error) {
      setLatestPrice(null);
    }
    
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
      // Update product
      await productsRepo.update(editingProduct.id, {
        name,
        barcode: barcode || null,
        category_id: editFormCategoryId ? parseInt(editFormCategoryId) : null,
        description: description || null,
        sku: sku || null,
        shelf: shelf || null,
      });

      // Update or create price if provided
      const wholesale = wholesalePrice.trim() ? parseFloat(wholesalePrice) : null;
      const retail = retailPrice.trim() ? parseFloat(retailPrice) : null;
      
      if (wholesale !== null && retail !== null && !isNaN(wholesale) && !isNaN(retail)) {
        try {
          // Check if price exists
          const existingPrices = await productPricesRepo.list(editingProduct.id.toString());
          if (existingPrices.length > 0) {
            // Update latest price
            const latestPriceId = existingPrices[0].id;
            await productPricesRepo.update(latestPriceId, {
              wholesale_price: wholesale,
              retail_price: retail,
              effective_date: getTodayLebanon(),
            });
          } else {
            // Create new price
            await productPricesRepo.create({
              product_id: editingProduct.id.toString(),
              wholesale_price: wholesale,
              retail_price: retail,
              effective_date: getTodayLebanon(),
            });
          }
        } catch (priceError) {
          // Log but don't fail the product update
          console.error('Price update error:', priceError);
        }
      }
    } catch (error: any) {
      setLoading(false);
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: t('common.success'), description: t('products.productUpdated') });
    setEditOpen(false);
    setEditingProduct(null);
    setEditFormCategoryId("");
    setWholesalePrice("");
    setRetailPrice("");
    setLatestPrice(null);
    fetchProducts();
  };

  const handleDelete = async (product: any) => {
    if (!confirm(t('products.deleteConfirm', { name: product.name }))) {
      return;
    }

    try {
      await productsRepo.delete(product.id);
      toast({
        title: t('common.success'),
        description: t('products.productDeleted'),
      });
      fetchProducts();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('products.failedToDeleteProduct'),
        variant: "destructive",
      });
    }
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream'
    ];
    const isValidType = validTypes.includes(file.type) || 
                       file.name.endsWith('.xlsx') || 
                       file.name.endsWith('.xls');
    
    if (!isValidType) {
      toast({
        title: t('products.invalidFileType'),
        description: t('products.invalidFileTypeDescription'),
        variant: "destructive",
      });
      return;
    }

    setImportLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('auth_token');
      const API_BASE_URL = import.meta.env.VITE_API_URL || '';
      const url = API_BASE_URL ? `${API_BASE_URL}/api/products/import-excel` : '/api/products/import-excel';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to import file' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      
      // Show success message with details
      const successMessage = result.message || `Successfully imported ${result.summary?.success || 0} products`;
      toast({
        title: t('products.importSuccessful'),
        description: successMessage,
      });

      // Show errors if any
      if (result.errors && result.errors.length > 0) {
        const errorCount = result.errors.length;
        console.error('Import errors:', result.errors);
        toast({
          title: t('products.someRowsFailed'),
          description: t('products.rowsHadErrors', { count: errorCount }),
          variant: "destructive",
        });
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Refresh products list
      fetchProducts();
    } catch (error: any) {
      toast({
        title: t('products.importFailed'),
        description: error.message || t('products.failedToImportFile'),
        variant: "destructive",
      });
    } finally {
      setImportLoading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
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
      <div className="space-y-6 sm:space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {t('products.title')}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">{t('products.subtitle')}</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button 
              variant="outline"
              onClick={() => navigate("/products/quick-add")}
              className="hover:scale-105 transition-all duration-300 font-semibold text-xs sm:text-sm flex-1 sm:flex-initial"
            >
              <Scan className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('products.quickAdd')}</span>
              <span className="sm:hidden">{t('products.quick')}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline"
                  className="hover:scale-105 transition-all duration-300 font-semibold text-xs sm:text-sm flex-1 sm:flex-initial"
                  aria-label={t('products.importExport')}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="whitespace-nowrap">{t('products.importExport')}</span>
                  <ChevronDown className="w-3 h-3 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={triggerFileInput} disabled={importLoading}>
                  <Download className="w-4 h-4 mr-2" />
                  {importLoading ? t('products.importing') : t('products.importExcel')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  try {
                    const API_BASE_URL = import.meta.env.VITE_API_URL || '';
                    const token = localStorage.getItem('auth_token');
                    
                    // Construct URL - always use full URL in production
                    let url = '/api/export/products';
                    if (API_BASE_URL) {
                      // Remove trailing slash if present
                      const baseUrl = API_BASE_URL.replace(/\/$/, '');
                      url = `${baseUrl}/api/export/products`;
                    }
                    
                    const response = await fetch(url, {
                      method: 'GET',
                      headers: {
                        'Authorization': `Bearer ${token}`,
                      },
                      credentials: 'include',
                    });
                    
                    if (!response.ok) {
                      const errorText = await response.text();
                      let errorMsg = `Export failed (${response.status})`;
                      try {
                        const errorJson = JSON.parse(errorText);
                        errorMsg = errorJson.error || errorMsg;
                      } catch {
                        errorMsg = errorText || errorMsg;
                      }
                      throw new Error(errorMsg);
                    }
                    
                    const blob = await response.blob();
                    const blobUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = `products-${new Date().toISOString().split('T')[0]}.csv`;
                    document.body.appendChild(link);
                    link.click();
                    setTimeout(() => {
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(blobUrl);
                    }, 100);
                    
                    toast({
                      title: t('common.success'),
                      description: 'Products exported successfully',
                    });
                  } catch (error: any) {
                    console.error('Export error:', error);
                    toast({
                      title: t('common.error'),
                      description: error.message || 'Failed to export products. Please check your connection.',
                      variant: "destructive",
                    });
                  }
                }}>
                  <Upload className="w-4 h-4 mr-2" />
                  {t('products.exportCsv')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleImportExcel}
              className="hidden"
            />
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 font-semibold">
                <Plus className="w-4 h-4 mr-2" />
                {t('products.addProduct')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl">{t('products.addProduct')}</DialogTitle>
                <DialogDescription>{t('products.subtitle')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-2">
                {/* Basic Information Section */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold border-b pb-2">{t('products.basicInformation')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium">{t('products.productName')} <span className="text-destructive">*</span></Label>
                      <Input id="name" name="name" placeholder={t('products.productName')} required className="h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="barcode" className="text-sm font-medium">{t('products.barcode')}</Label>
                      <Input id="barcode" name="barcode" placeholder={t('products.barcode')} className="h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category_id" className="text-sm font-medium">{t('categories.title')}</Label>
                      <Select value={formCategoryId || "none"} onValueChange={(val) => setFormCategoryId(val === "none" ? "" : val)}>
                        <SelectTrigger id="category_id" className="h-10">
                          <SelectValue placeholder={`${t('common.all')} ${t('categories.title')}`} />
                        </SelectTrigger>
                        <SelectContent side="bottom" align="start">
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
                      <Label htmlFor="sku" className="text-sm font-medium">{t('products.sku')}</Label>
                      <Input id="sku" name="sku" placeholder={t('products.skuOptional')} className="h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shelf" className="text-sm font-medium">{t('products.shelf')}</Label>
                      <Input id="shelf" name="shelf" placeholder={t('products.shelfOptional')} className="h-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-medium">{t('categories.description')}</Label>
                    <Textarea id="description" name="description" placeholder={t('categories.description')} rows={3} className="text-sm" />
                  </div>
                </div>
                
                {/* Pricing Section */}
                <div className="pt-4 border-t space-y-4">
                  <h3 className="text-base font-semibold border-b pb-2">{t('products.pricing')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="wholesale-price" className="text-sm font-medium">{t('products.wholesalePriceWithCurrency')}</Label>
                      <Input 
                        id="wholesale-price" 
                        type="number" 
                        step="0.01" 
                        name="wholesale_price"
                        placeholder="0.00" 
                        className="h-10" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="retail-price" className="text-sm font-medium">{t('products.retailPriceWithCurrency')}</Label>
                      <Input 
                        id="retail-price" 
                        type="number" 
                        step="0.01" 
                        name="retail_price"
                        placeholder="0.00" 
                        className="h-10" 
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3 pt-4 border-t">
                  <Button type="submit" className="flex-1 h-10" disabled={loading}>
                    {loading ? t('common.loading') : t('common.save')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="h-10">
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <CardHeader className="border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
            <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <Package className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              {t('products.title')}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">{t('products.subtitle')}</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-initial sm:w-[400px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder={t('products.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-9 h-9"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
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
              <div className="rounded-xl border-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10">
                      <TableHead className="font-bold whitespace-nowrap">{t('products.productName')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap">{t('products.barcode')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap">{t('categories.title')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product, idx) => (
                      <TableRow 
                        key={product.id} 
                        className="hover:bg-primary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <TableCell className="font-medium whitespace-nowrap">
                          <div>
                            <span className="font-semibold">{product.name}</span>
                            <span className="text-muted-foreground text-xs ml-2">#{product.id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap font-mono text-sm">{product.barcode || "-"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{product.category_name || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 sm:gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleEdit(product)}
                              className="hover:bg-primary/10 hover:scale-110 transition-all duration-300"
                              title={t('common.edit')}
                            >
                              <Pencil className="w-4 h-4 text-primary" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleDelete(product)}
                              className="hover:bg-destructive/10 hover:scale-110 transition-all duration-300 text-destructive hover:text-destructive"
                              title={t('common.delete')}
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
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">{t('products.editProduct')}</DialogTitle>
              <DialogDescription>{t('products.subtitle')}</DialogDescription>
            </DialogHeader>
            {editingProduct && (
              <form onSubmit={handleUpdate} className="space-y-4 py-2">
                {/* Basic Information Section */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold border-b pb-2">{t('products.basicInformation')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-name" className="text-sm font-medium">{t('products.productName')} <span className="text-destructive">*</span></Label>
                      <Input id="edit-name" name="name" defaultValue={editingProduct.name} required className="h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-barcode" className="text-sm font-medium">{t('products.barcode')}</Label>
                      <Input id="edit-barcode" name="barcode" defaultValue={editingProduct.barcode || ""} className="h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-category_id" className="text-sm font-medium">{t('categories.title')}</Label>
                      <Select value={editFormCategoryId || "none"} onValueChange={(val) => setEditFormCategoryId(val === "none" ? "" : val)}>
                        <SelectTrigger id="edit-category_id" className="h-10">
                          <SelectValue placeholder={`${t('common.all')} ${t('categories.title')}`} />
                        </SelectTrigger>
                        <SelectContent side="bottom" align="start">
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
                      <Label htmlFor="edit-sku" className="text-sm font-medium">SKU</Label>
                      <Input id="edit-sku" name="sku" defaultValue={editingProduct.sku || ""} className="h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-shelf" className="text-sm font-medium">Shelf</Label>
                      <Input id="edit-shelf" name="shelf" defaultValue={editingProduct.shelf || ""} className="h-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description" className="text-sm font-medium">{t('categories.description')}</Label>
                    <Textarea id="edit-description" name="description" defaultValue={editingProduct.description || ""} rows={3} className="text-sm" />
                  </div>
                </div>
                
                {/* Pricing Section */}
                <div className="pt-4 border-t space-y-4">
                  <h3 className="text-base font-semibold border-b pb-2">Pricing</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-wholesale-price" className="text-sm font-medium">Wholesale Price ($)</Label>
                      <Input 
                        id="edit-wholesale-price" 
                        type="number" 
                        step="0.01" 
                        value={wholesalePrice}
                        onChange={(e) => setWholesalePrice(e.target.value)}
                        placeholder="0.00" 
                        className="h-10" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-retail-price" className="text-sm font-medium">Retail Price ($)</Label>
                      <Input 
                        id="edit-retail-price" 
                        type="number" 
                        step="0.01" 
                        value={retailPrice}
                        onChange={(e) => setRetailPrice(e.target.value)}
                        placeholder="0.00" 
                        className="h-10" 
                      />
                    </div>
                  </div>
                  {latestPrice && (
                    <div className="bg-muted/50 p-3 rounded-md">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">{t('products.currentPrices')}</span> {t('products.wholesalePrice')} ${latestPrice.wholesale_price ? Number(latestPrice.wholesale_price).toFixed(2) : t('products.nA')}, {t('products.retailPrice')} ${latestPrice.retail_price ? Number(latestPrice.retail_price).toFixed(2) : t('products.nA')}
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-3 pt-4 border-t">
                  <Button type="submit" className="flex-1 h-10" disabled={loading}>
                    {loading ? t('common.loading') : t('common.save')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="h-10">
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Products;
