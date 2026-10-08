import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { categoriesQuery, invalidateProductData, queryKeys } from "@/integrations/api/queries";
import { useSearchText } from "@/hooks/useSearchText";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { StatTile } from "@/components/page-ui/StatTile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Package, Pencil, Download, Trash2, Scan, Search, X, ArrowDown, ArrowUp, FileSpreadsheet, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { productsRepo, productPricesRepo } from "@/integrations/api/repo";
import { getTodayLebanon } from "@/utils/dateUtils";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import ProductDetailsSidePanel from "@/components/ProductDetailsSidePanel";
import { normalizeBarcodeOrSkuForSearch } from "@/utils/barcodeSkuUtils";

const Products = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { applied: debouncedSearchQuery, searchOnEnter } = useSearchText(searchQuery);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [editFormCategoryId, setEditFormCategoryId] = useState<string>("");
  const [latestPrice, setLatestPrice] = useState<{ wholesale_price: number | null; retail_price: number | null } | null>(null);
  const [wholesalePrice, setWholesalePrice] = useState<string>("");
  const [retailPrice, setRetailPrice] = useState<string>("");
  const [importLoading, setImportLoading] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInProgressRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [checkedExistingProducts, setCheckedExistingProducts] = useState<Set<number>>(new Set());
  const [pageSize] = useState<number>(50);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // The page number belongs to the search it was chosen for, so a new search starts at page 1
  // in the same update and the old page is never requested for it.
  const search = debouncedSearchQuery.trim();
  const [pageState, setPageState] = useState({ search: "", page: 1 });
  const currentPage = pageState.search === search ? pageState.page : 1;
  const setCurrentPage = (page: number) => setPageState({ search, page });

  // Each page of results is cached: paging back, or coming back to this page, shows rows at once.
  // While another page or search loads, the current rows stay on screen instead of a full-page spinner.
  const offset = (currentPage - 1) * pageSize;
  const productsQuery = useQuery({
    queryKey: queryKeys.productPage(pageSize, offset, search),
    // Use server-side search if search query exists
    queryFn: () => productsRepo.list({ limit: pageSize, offset, ...(search ? { search } : {}) }),
    placeholderData: keepPreviousData,
  });
  const categoriesQ = useQuery(categoriesQuery);
  const pageLoading = productsQuery.isPending;
  const response = productsQuery.data;
  // Handle both old format (array) and new format (object with data property)
  const products = useMemo(
    () => (!response ? [] : Array.isArray(response) ? response : (response.data || [])),
    [response],
  );
  const totalProducts = !response
    ? 0
    : !Array.isArray(response) && response.pagination
      ? (response.pagination.total || products.length)
      : products.length;
  const categories: any[] = categoriesQ.data ?? [];

  useEffect(() => {
    if (productsQuery.error) {
      console.error('Error fetching products:', productsQuery.error);
      toast({ 
        title: t('common.error'), 
        description: productsQuery.error.message || t('products.failedToLoadProducts'), 
        variant: "destructive" 
      });
    }
  }, [productsQuery.error, toast, t]);

  // After an add, edit, delete or import: refresh the cached pages (and prices for the invoice form)
  const refreshProducts = () => invalidateProductData(queryClient);

  // Products are already filtered server-side when searchQuery exists
  // No need for client-side filtering
  const filteredProducts = useMemo(() => {
    return products;
  }, [products]);
  
  // Calculate pagination info
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  const startIndex = totalProducts > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(currentPage * pageSize, totalProducts);
  
  // Ensure currentPage doesn't exceed totalPages
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setPageState({ search, page: 1 });
    }
  }, [totalPages, currentPage, search]);
  
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

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
        barcode: barcode ? barcode.trim() : null,
        category_id: formCategoryId ? parseInt(formCategoryId) : null,
        description: description || null,
        sku: sku ? sku.trim() : null,
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
    // Refresh current page
    refreshProducts();
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
        barcode: barcode ? barcode.trim() : null,
        category_id: editFormCategoryId ? parseInt(editFormCategoryId) : null,
        description: description || null,
        sku: sku ? sku.trim() : null,
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
    // Refresh current page
    refreshProducts();
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
      // Refresh current page
      refreshProducts();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('products.failedToDeleteProduct'),
        variant: "destructive",
      });
    }
  };

  const handleViewDetails = (productId: string) => {
    if (selectedProductId === productId && sidePanelOpen) {
      setSidePanelOpen(false);
      setSelectedProductId("");
    } else {
      setSelectedProductId(productId);
      setSidePanelOpen(true);
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

    // Store file for later import
    setPendingFile(file);
    setImportLoading(true);

    try {
      // First, call preview endpoint
      const token = localStorage.getItem('auth_token');
      const API_BASE_URL = import.meta.env.VITE_API_URL || '';
      const previewUrl = API_BASE_URL ? `${API_BASE_URL}/api/products/import-excel-preview` : '/api/products/import-excel-preview';

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(previewUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to preview file' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const previewResult = await response.json();
      
      // Show preview dialog
      setPreviewData(previewResult);
      // One idempotency key per preview session: duplicate import requests return cached result
      idempotencyKeyRef.current = crypto.randomUUID();
      // Initialize all existing products as checked by default
      if (previewResult.existingProducts && previewResult.existingProducts.length > 0) {
        const rowNumbers: number[] = previewResult.existingProducts.map((p: any) => Number(p.row));
        const allChecked = new Set<number>(rowNumbers);
        setCheckedExistingProducts(allChecked);
      } else {
        setCheckedExistingProducts(new Set());
      }
      setPreviewOpen(true);
    } catch (error: any) {
      toast({
        title: t('products.importFailed'),
        description: error.message || 'Failed to preview file',
        variant: "destructive",
      });
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingFile) return;

    // Prevent double submission (double-click or React Strict Mode double-invoke)
    if (importInProgressRef.current) return;
    importInProgressRef.current = true;

    setPreviewOpen(false);
    setImportLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const API_BASE_URL = import.meta.env.VITE_API_URL || '';
      const url = API_BASE_URL ? `${API_BASE_URL}/api/products/import-excel` : '/api/products/import-excel';

      const formData = new FormData();
      formData.append('file', pendingFile);
      // Send list of row numbers for existing products that should be updated
      formData.append('updateRows', JSON.stringify(Array.from(checkedExistingProducts)));
      if (idempotencyKeyRef.current) {
        formData.append('idempotencyKey', idempotencyKeyRef.current);
      }

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

      // Reset state
      setPendingFile(null);
      setPreviewData(null);
      setCheckedExistingProducts(new Set());
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Refresh products list and reset to page 1
      refreshProducts();
      setCurrentPage(1);
    } catch (error: any) {
      toast({
        title: t('products.importFailed'),
        description: error.message || t('products.failedToImportFile'),
        variant: "destructive",
      });
    } finally {
      setImportLoading(false);
      importInProgressRef.current = false;
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  if (pageLoading) {
    return (
      <>
        <div className="space-y-8 animate-fade-in">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <InvoicePageHeader
          icon={Package}
          title={t('products.title')}
          description={t('products.subtitle')}
          actions={
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button 
              variant="outline"
              onClick={() => navigate("/products/quick-add")}
              className="hover:scale-105 transition-all duration-300 font-semibold text-xs h-8 flex-1 sm:flex-initial"
            >
              <Scan className="w-3.5 h-3.5 sm:me-1.5" />
              <span className="hidden sm:inline">{t('products.quickAdd')}</span>
              <span className="sm:hidden">{t('products.quick')}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline"
                  className="hover:scale-105 transition-all duration-300 font-semibold text-xs h-8 flex-1 sm:flex-initial"
                  aria-label={t('products.importExport')}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 sm:me-1.5" />
                  <span className="whitespace-nowrap">{t('products.importExport')}</span>
                  <ChevronDown className="w-3 h-3 ms-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={triggerFileInput} disabled={importLoading}>
                  <ArrowDown className="w-4 h-4 me-2" />
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
                    link.download = `products_export_${new Date().toISOString().split('T')[0]}.xlsx`;
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
                  <ArrowUp className="w-4 h-4 me-2" />
                  {t('products.exportExcel')}
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
              <Button className="gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 font-semibold h-8 text-xs">
                <Plus className="w-3.5 h-3.5 me-1.5" />
                {t('products.addProduct')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg">{t('products.addProduct')}</DialogTitle>
                <DialogDescription>{t('products.subtitle')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-2">
                {/* Basic Information Section */}
                <div className="space-y-4">
                  <h3 className="text-[13px] font-bold border-b pb-1.5">{t('products.basicInformation')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-[11px] font-medium">{t('products.productName')} <span className="text-destructive">*</span></Label>
                      <Input id="name" name="name" placeholder={t('products.productName')} required className="h-8 text-[13px]" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="barcode" className="text-[11px] font-medium">{t('products.barcode')}</Label>
                      <Input id="barcode" name="barcode" placeholder={t('products.barcode')} className="h-8 text-[13px]" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category_id" className="text-[11px] font-medium">{t('categories.title')}</Label>
                      <Select value={formCategoryId || "none"} onValueChange={(val) => setFormCategoryId(val === "none" ? "" : val)}>
                        <SelectTrigger id="category_id" className="h-8 text-[13px]">
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
                      <Label htmlFor="sku" className="text-[11px] font-medium">{t('products.sku')}</Label>
                      <Input id="sku" name="sku" placeholder={t('products.skuOptional')} className="h-8 text-[13px]" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shelf" className="text-[11px] font-medium">{t('products.shelf')}</Label>
                      <Input id="shelf" name="shelf" placeholder={t('products.shelfOptional')} className="h-8 text-[13px]" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-[11px] font-medium">{t('categories.description')}</Label>
                    <Textarea id="description" name="description" placeholder={t('categories.description')} rows={3} className="text-[13px]" />
                  </div>
                </div>
                
                {/* Pricing Section */}
                <div className="pt-4 border-t space-y-4">
                  <h3 className="text-[13px] font-bold border-b pb-1.5">{t('products.pricing')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="wholesale-price" className="text-[11px] font-medium">{t('products.wholesalePriceWithCurrency')}</Label>
                      <Input 
                        id="wholesale-price" 
                        type="number" 
                        step="0.01" 
                        name="wholesale_price"
                        placeholder="0.00" 
                        className="h-8 text-[13px]" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="retail-price" className="text-[11px] font-medium">{t('products.retailPriceWithCurrency')}</Label>
                      <Input 
                        id="retail-price" 
                        type="number" 
                        step="0.01" 
                        name="retail_price"
                        placeholder="0.00" 
                        className="h-8 text-[13px]" 
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3 pt-4 border-t">
                  <Button type="submit" className="flex-1 h-8" disabled={loading}>
                    {loading ? t('common.loading') : t('common.save')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="h-8 text-[13px]">
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
          }
        />

        {/* Main Content with Side Panel */}
        <div className="flex gap-2">
          {/* Products Table Section */}
          <div className={`flex-1 min-w-0 transition-all duration-300 ${sidePanelOpen ? 'lg:mr-[420px]' : ''}`}>
            <SectionCard
              icon={Package}
              title={t('products.title')}
              meta={<span>{totalProducts} {t('products.products')}</span>}
            >
                <div className="relative w-full sm:w-[350px]">
                  <Search className="absolute start-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="text"
                    placeholder={t('products.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={searchOnEnter}
                    className="w-full ps-8 pe-8 h-8 text-[13px]"
                    autoFocus
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
                {filteredProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center mb-4">
                      <Package className="w-10 h-10 text-primary/60" />
                    </div>
                    <p className="text-muted-foreground text-[13px]">
                      {products.length === 0 
                        ? t('products.noProducts')
                        : t('products.noProducts')}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-border overflow-hidden bg-card">
                      <div className="scroll-x">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/60 hover:bg-muted/60">
                            <TableHead className="h-9 px-2 ps-2 pe-0.5 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('products.productName')}</TableHead>
                            <TableHead className="h-9 px-2 ps-0.5 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Category</TableHead>
                            <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('products.barcode')}</TableHead>
                            <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">SKU</TableHead>
                            <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Description</TableHead>
                            <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('common.actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProducts.map((product, idx) => {
                            const isSelected = selectedProductId === String(product.id);
                            return (
                              <TableRow 
                                key={product.id} 
                                className={`hover:bg-primary/5 transition-colors cursor-pointer animate-fade-in ${isSelected ? 'bg-primary/10 border-s-4 border-s-primary' : ''}`}
                                style={{ animationDelay: `${idx * 0.05}s` }}
                                onClick={() => handleViewDetails(String(product.id))}
                              >
                                <TableCell className="font-medium whitespace-nowrap p-2 ps-2 pe-0.5">
                                  <div>
                                    <span className="font-semibold text-[13px]">{product.name}</span>
                                    <span className="text-muted-foreground text-[11px] ms-1.5 tabular-nums">#{product.id}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground whitespace-nowrap text-[12px] p-2 ps-0.5">{product.category_name || "-"}</TableCell>
                                <TableCell className="text-muted-foreground whitespace-nowrap font-mono text-[12px] p-2">{product.barcode || "-"}</TableCell>
                                <TableCell className="text-muted-foreground whitespace-nowrap font-mono text-[12px] p-2">{product.sku || "-"}</TableCell>
                                <TableCell className="text-muted-foreground text-[12px] p-2 max-w-[200px]">
                                  {product.description ? (
                                    <span 
                                      className="block truncate" 
                                      title={product.description}
                                    >
                                      {product.description}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/50">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="p-2" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEdit(product);
                                      }}
                                      className="hover:bg-primary/10 hover:scale-110 transition-all duration-300 h-7 w-7 p-0"
                                      title={t('common.edit')}
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-primary" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(product);
                                      }}
                                      className="hover:bg-destructive/10 hover:scale-110 transition-all duration-300 text-destructive hover:text-destructive h-7 w-7 p-0"
                                      title={t('common.delete')}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      </div>
                    </div>
                    {/* Pagination Controls */}
                    {totalProducts > 0 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t">
                        <div className="text-[12px] text-muted-foreground tabular-nums">
                          {t('products.showing')} {startIndex}-{endIndex} {t('products.of')} {totalProducts} {t('products.products')}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1 || pageLoading}
                            className="h-8"
                          >
                            <ChevronLeft className="w-4 h-4 me-1" />
                            {t('products.previousPage')}
                          </Button>
                          <div className="flex items-center gap-1">
                            <span className="text-[12px] text-muted-foreground px-2 tabular-nums">
                              {t('products.page')} {currentPage} {t('products.of')} {totalPages}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage >= totalPages || pageLoading}
                            className="h-8"
                          >
                            {t('products.nextPage')}
                            <ChevronRight className="w-4 h-4 ms-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
            </SectionCard>
          </div>

          {/* Fixed Side Panel */}
          <div className={`hidden lg:block fixed right-4 top-20 bottom-4 w-[400px] transition-transform duration-300 z-30 ${
            sidePanelOpen ? 'translate-x-0' : 'translate-x-[420px]'
          }`}>
            <ProductDetailsSidePanel
              open={sidePanelOpen}
              onOpenChange={setSidePanelOpen}
              productId={selectedProductId}
            />
          </div>
        </div>

        {/* Product Details Side Panel (Mobile/Tablet - Overlay) */}
        <div className="lg:hidden">
          <ProductDetailsSidePanel
            open={sidePanelOpen}
            onOpenChange={setSidePanelOpen}
            productId={selectedProductId}
          />
        </div>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg">{t('products.editProduct')}</DialogTitle>
              <DialogDescription>{t('products.subtitle')}</DialogDescription>
            </DialogHeader>
            {editingProduct && (
              <form onSubmit={handleUpdate} className="space-y-4 py-2">
                {/* Basic Information Section */}
                <div className="space-y-4">
                  <h3 className="text-[13px] font-bold border-b pb-1.5">{t('products.basicInformation')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-name" className="text-[11px] font-medium">{t('products.productName')} <span className="text-destructive">*</span></Label>
                      <Input id="edit-name" name="name" defaultValue={editingProduct.name} required className="h-8 text-[13px]" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-barcode" className="text-[11px] font-medium">{t('products.barcode')}</Label>
                      <Input id="edit-barcode" name="barcode" defaultValue={editingProduct.barcode || ""} className="h-8 text-[13px]" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-category_id" className="text-[11px] font-medium">{t('categories.title')}</Label>
                      <Select value={editFormCategoryId || "none"} onValueChange={(val) => setEditFormCategoryId(val === "none" ? "" : val)}>
                        <SelectTrigger id="edit-category_id" className="h-8 text-[13px]">
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
                      <Label htmlFor="edit-sku" className="text-[11px] font-medium">SKU</Label>
                      <Input id="edit-sku" name="sku" defaultValue={editingProduct.sku || ""} className="h-8 text-[13px]" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-shelf" className="text-[11px] font-medium">Shelf</Label>
                      <Input id="edit-shelf" name="shelf" defaultValue={editingProduct.shelf || ""} className="h-8 text-[13px]" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description" className="text-[11px] font-medium">{t('categories.description')}</Label>
                    <Textarea id="edit-description" name="description" defaultValue={editingProduct.description || ""} rows={3} className="text-[13px]" />
                  </div>
                </div>
                
                {/* Pricing Section */}
                <div className="pt-4 border-t space-y-4">
                  <h3 className="text-[13px] font-bold border-b pb-1.5">Pricing</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-wholesale-price" className="text-[11px] font-medium">Wholesale Price ($)</Label>
                      <Input 
                        id="edit-wholesale-price" 
                        type="number" 
                        step="0.01" 
                        value={wholesalePrice}
                        onChange={(e) => setWholesalePrice(e.target.value)}
                        placeholder="0.00" 
                        className="h-8 text-[13px]" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-retail-price" className="text-[11px] font-medium">Retail Price ($)</Label>
                      <Input 
                        id="edit-retail-price" 
                        type="number" 
                        step="0.01" 
                        value={retailPrice}
                        onChange={(e) => setRetailPrice(e.target.value)}
                        placeholder="0.00" 
                        className="h-8 text-[13px]" 
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
                  <Button type="submit" className="flex-1 h-8" disabled={loading}>
                    {loading ? t('common.loading') : t('common.save')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="h-8 text-[13px]">
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Import Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-xl">
                {t('products.importPreview') === 'products.importPreview' ? 'Import Preview' : t('products.importPreview')}
              </DialogTitle>
              <DialogDescription className="text-[12px]">
                {t('products.reviewBeforeImport') === 'products.reviewBeforeImport' 
                  ? 'Review the products that will be created or updated before importing'
                  : t('products.reviewBeforeImport')}
              </DialogDescription>
            </DialogHeader>
            
            {previewData && (
              <div className="space-y-3 py-2">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2">
                  <StatTile
                    tone="primary"
                    label={t('products.productsToCreate') === 'products.productsToCreate' ? 'Products to Create' : t('products.productsToCreate')}
                    value={previewData.summary?.new || 0}
                  />
                  <StatTile
                    tone="warning"
                    label={t('products.productsToUpdate') === 'products.productsToUpdate' ? 'Products to Update' : t('products.productsToUpdate')}
                    value={previewData.summary?.existing || 0}
                  />
                  <StatTile
                    tone="destructive"
                    label={t('products.importErrors') === 'products.importErrors' ? 'Import Errors' : t('products.importErrors')}
                    value={previewData.summary?.errors || 0}
                  />
                </div>

                {/* No Changes Message */}
                {previewData && 
                 (!previewData.newProducts || previewData.newProducts.length === 0) &&
                 (!previewData.existingProducts || previewData.existingProducts.length === 0) &&
                 (!previewData.errors || previewData.errors.length === 0) && (
                  <div className="border rounded-lg p-4 bg-muted/50 text-center">
                    <p className="text-[13px] font-medium text-muted-foreground">
                      No changes detected in the import file.
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      All products in the file already exist with the same data.
                    </p>
                  </div>
                )}

                {/* New Products List */}
                {previewData.newProducts && previewData.newProducts.length > 0 && (
                  <div className="space-y-1">
                    <h3 className="text-[13px] font-bold text-primary-strong">
                      {(t('products.productsToCreate') === 'products.productsToCreate' ? 'Products to Create' : t('products.productsToCreate'))} ({previewData.newProducts.length})
                    </h3>
                    <div className="border border-border rounded-lg max-h-[200px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="h-7 bg-muted/60 hover:bg-muted/60">
                            <TableHead className="h-8 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground p-1.5">Row</TableHead>
                            <TableHead className="h-8 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground p-1.5">Name</TableHead>
                            <TableHead className="h-8 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground p-1.5">SKU</TableHead>
                            <TableHead className="h-8 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground p-1.5">Barcode</TableHead>
                            <TableHead className="h-8 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground p-1.5">Category</TableHead>
                            <TableHead className="h-8 text-end text-[10px] font-bold uppercase tracking-wider text-muted-foreground p-1.5">Wholesale Price</TableHead>
                            <TableHead className="h-8 text-end text-[10px] font-bold uppercase tracking-wider text-muted-foreground p-1.5">Retail Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewData.newProducts.slice(0, 20).map((product: any) => (
                            <TableRow key={product.row} className="h-6">
                              <TableCell className="text-[12px] p-1.5 tabular-nums">{product.row}</TableCell>
                              <TableCell className="text-[12px] p-1.5 font-medium">{product.name}</TableCell>
                              <TableCell className="text-[12px] p-1.5 font-mono">{product.sku || '-'}</TableCell>
                              <TableCell className="text-[12px] p-1.5 font-mono">{product.barcode || '-'}</TableCell>
                              <TableCell className="text-[12px] p-1.5">{product.category || '-'}</TableCell>
                              <TableCell className="text-[12px] p-1.5 text-end tabular-nums">${product.wholesale_price ? Number(product.wholesale_price).toFixed(2) : '-'}</TableCell>
                              <TableCell className="text-[12px] p-1.5 text-end tabular-nums">${product.retail_price ? Number(product.retail_price).toFixed(2) : '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {previewData.newProducts.length > 20 && (
                        <div className="p-1.5 text-[12px] text-muted-foreground text-center">
                          ... and {previewData.newProducts.length - 20} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Existing Products List */}
                {previewData.existingProducts && previewData.existingProducts.length > 0 && (
                  <div className="space-y-1">
                    <h3 className="text-[13px] font-bold text-warning-strong">
                      {(t('products.productsToUpdate') === 'products.productsToUpdate' ? 'Products to Update' : t('products.productsToUpdate'))} ({previewData.existingProducts.length})
                    </h3>
                    <p className="text-[12px] text-muted-foreground">
                      {t('products.checkToUpdate') === 'products.checkToUpdate' 
                        ? 'Select which products to update. Only changed fields will be shown.'
                        : t('products.checkToUpdate')}
                    </p>
                    <div className="border border-border rounded-lg max-h-[300px] overflow-y-auto space-y-1.5 p-1.5">
                      {previewData.existingProducts.map((product: any) => {
                        // Calculate which fields have changed
                        const changes: any = {};
                        if (product.name !== product.existing_name) changes.name = { before: product.existing_name, after: product.name };
                        if ((product.sku || '') !== (product.existing_sku || '')) changes.sku = { before: product.existing_sku || '-', after: product.sku || '-' };
                        if ((product.barcode || '') !== (product.existing_barcode || '')) changes.barcode = { before: product.existing_barcode || '-', after: product.barcode || '-' };
                        if ((product.category || '') !== (product.existing_category_name || '')) changes.category = { before: product.existing_category_name || '-', after: product.category || '-' };
                        if ((product.description || '') !== (product.existing_description || '')) changes.description = { before: product.existing_description || '-', after: product.description || '-' };
                        if ((product.shelf || '') !== (product.existing_shelf || '')) changes.shelf = { before: product.existing_shelf || '-', after: product.shelf || '-' };
                        // Check price changes
                        const existingWholesale = product.existing_wholesale_price || 0;
                        const existingRetail = product.existing_retail_price || 0;
                        const newWholesale = product.wholesale_price || 0;
                        const newRetail = product.retail_price || 0;
                        if (Math.abs(newWholesale - existingWholesale) > 0.01) {
                          changes.wholesale_price = { 
                            before: existingWholesale > 0 ? `$${Number(existingWholesale).toFixed(2)}` : '-', 
                            after: newWholesale > 0 ? `$${Number(newWholesale).toFixed(2)}` : '-' 
                          };
                        }
                        if (Math.abs((newRetail || 0) - (existingRetail || 0)) > 0.01) {
                          changes.retail_price = { 
                            before: existingRetail > 0 ? `$${Number(existingRetail).toFixed(2)}` : '-', 
                            after: (newRetail || 0) > 0 ? `$${Number(newRetail).toFixed(2)}` : '-' 
                          };
                        }
                        
                        const hasChanges = Object.keys(changes).length > 0;
                        
                        return (
                          <div key={product.row} className="border border-border rounded-md p-1.5 bg-warning-light">
                            <div className="flex items-start gap-1.5 mb-1">
                              <input
                                type="checkbox"
                                checked={checkedExistingProducts.has(product.row)}
                                onChange={(e) => {
                                  const newChecked = new Set(checkedExistingProducts);
                                  if (e.target.checked) {
                                    newChecked.add(product.row);
                                  } else {
                                    newChecked.delete(product.row);
                                  }
                                  setCheckedExistingProducts(newChecked);
                                }}
                                className="h-3.5 w-3.5 rounded border-input cursor-pointer mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[11px] font-semibold tabular-nums">Row {product.row}</span>
                                  <span className="text-[11px] font-medium text-warning-strong truncate">
                                    {product.existing_name}
                                  </span>
                                </div>
                                {hasChanges ? (
                                  <div className="space-y-0.5 mt-1">
                                    {Object.entries(changes).map(([field, change]: [string, any]) => (
                                      <div key={field} className="text-[11px] flex items-start gap-1 bg-card rounded p-1">
                                        <span className="font-medium text-muted-foreground capitalize min-w-[60px]">{field}:</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-destructive-strong line-through truncate">
                                            {change.before}
                                          </div>
                                          <div className="text-success-strong font-medium truncate">
                                            → {change.after}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-muted-foreground italic mt-0.5">
                                    No changes detected
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Errors List */}
                {previewData.errors && previewData.errors.length > 0 && (
                  <div className="space-y-1">
                    <h3 className="text-[13px] font-bold text-destructive-strong">
                      {(t('products.importErrors') === 'products.importErrors' ? 'Import Errors' : t('products.importErrors'))} ({previewData.errors.length})
                    </h3>
                    <div className="border border-destructive/30 rounded-lg p-2 bg-destructive/10">
                      {previewData.errors.slice(0, 10).map((error: any, idx: number) => (
                        <div key={idx} className="text-[12px] text-destructive-strong mb-1">
                          Row {error.row}: {error.error}
                        </div>
                      ))}
                      {previewData.errors.length > 10 && (
                        <div className="text-[11px] text-destructive-strong mt-1">
                          ... and {previewData.errors.length - 10} more errors
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setPreviewOpen(false);
                  setPendingFile(null);
                  setPreviewData(null);
                  setCheckedExistingProducts(new Set());
                }}
                disabled={importLoading}
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleConfirmImport}
                disabled={importLoading}
                className="bg-primary hover:bg-primary/90"
              >
                {importLoading 
                  ? (t('common.loading') === 'common.loading' ? 'Loading...' : t('common.loading'))
                  : (t('products.confirmImport') === 'products.confirmImport' ? 'Confirm & Import' : t('products.confirmImport'))}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default Products;
