import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import PaymentDialog from "@/components/PaymentDialog";
import InvoiceItemsSidePanel from "@/components/InvoiceItemsSidePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Filter, X, FileText, TrendingUp, TrendingDown, DollarSign, Plus, CreditCard, Eye, Pencil, Trash2 } from "lucide-react";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { invoicesRepo, productsRepo, customersRepo, suppliersRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const InvoicesList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  
  const [filters, setFilters] = useState({
    type: "all",
    product_id: "all",
    customer_id: "all",
    supplier_id: "all",
    payment_status: "all",
    start_date: "",
    end_date: "",
    search: "",
  });

  const [showFilters, setShowFilters] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  // Refetch when navigating back to this page (using focus event)
  useEffect(() => {
    const handleFocus = () => {
      // Only refetch if we've been away for more than 1 second
      const lastFetch = (window as any).__lastInvoiceFetch || 0;
      const now = Date.now();
      if (now - lastFetch > 1000) {
        fetchData();
        (window as any).__lastInvoiceFetch = now;
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invoicesData, productsData, customersData, suppliersData] = await Promise.all([
        invoicesRepo.listWithRelations(),
        productsRepo.list(),
        customersRepo.list(),
        suppliersRepo.list(),
      ]);
      
      const invoices = invoicesData || [];
      setInvoices(invoices);
      setFilteredInvoices(invoices); // Set initial filtered data
      setProducts(productsData || []);
      setCustomers(customersData || []);
      setSuppliers(suppliersData || []);
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

  const applyFilters = () => {
    let result = [...invoices];

    // Filter by type
    if (filters.type && filters.type !== "all") {
      result = result.filter(inv => inv.invoice_type === filters.type);
    }

    // Filter by payment status
    if (filters.payment_status && filters.payment_status !== "all") {
      result = result.filter(inv => inv.payment_status === filters.payment_status);
    }

    // Filter by customer
    if (filters.customer_id && filters.customer_id !== "all") {
      result = result.filter(inv => inv.customer_id === filters.customer_id);
    }

    // Filter by supplier
    if (filters.supplier_id && filters.supplier_id !== "all") {
      result = result.filter(inv => inv.supplier_id === filters.supplier_id);
    }

    // Filter by product (check invoice items)
    if (filters.product_id && filters.product_id !== "all") {
      result = result.filter(inv => 
        inv.invoice_items?.some((item: any) => item.product_id === filters.product_id)
      );
    }

    // Filter by date range
    if (filters.start_date) {
      result = result.filter(inv => new Date(inv.invoice_date) >= new Date(filters.start_date));
    }
    if (filters.end_date) {
      result = result.filter(inv => new Date(inv.invoice_date) <= new Date(filters.end_date));
    }

    // Search filter (invoice number, entity name, or amount)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(inv => {
        const invoiceNumber = inv.id?.toString() || "";
        const entityName = inv.customers?.name || inv.suppliers?.name || "";
        const amount = inv.total_amount?.toString() || "";
        return invoiceNumber.includes(searchLower) || 
               entityName.toLowerCase().includes(searchLower) || 
               amount.includes(searchLower);
      });
    }

    setFilteredInvoices(result);
  };

  useEffect(() => {
    if (invoices.length > 0) {
      applyFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, invoices]);

  const clearFilters = () => {
    setFilters({
      type: "all",
      product_id: "all",
      customer_id: "all",
      supplier_id: "all",
      payment_status: "all",
      start_date: "",
      end_date: "",
      search: "",
    });
  };

  const hasActiveFilters = filters.type !== "all" || filters.product_id !== "all" || filters.customer_id !== "all" || 
                           filters.supplier_id !== "all" || filters.payment_status !== "all" || 
                           filters.start_date !== "" || filters.end_date !== "" || filters.search !== "";

  const handleRecordPayment = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setPaymentDialogOpen(true);
  };

  const handleViewDetails = (invoiceId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    setSelectedInvoiceId(invoiceId);
    setSidePanelOpen(true);
  };

  const handleRowClick = (invoiceId: string) => {
    if (selectedInvoiceId === invoiceId && sidePanelOpen) {
      setSidePanelOpen(false);
      setSelectedInvoiceId("");
    } else {
      setSelectedInvoiceId(invoiceId);
      setSidePanelOpen(true);
    }
  };

  const handlePaymentRecorded = () => {
    fetchData(); // Refresh the invoice list
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm(t('invoices.confirmDelete') || 'Are you sure you want to delete this invoice? This action cannot be undone.')) {
      return;
    }

    try {
      await invoicesRepo.deleteInvoice(invoiceId);
      toast({
        title: t('invoices.deleteSuccess') || "Success",
        description: t('invoices.invoiceDeleted') || "Invoice deleted successfully",
      });
      // Invalidate all related queries to force immediate refresh
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["daily-stock"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
       // Small delay to allow stored procedure to complete
       await new Promise(resolve => setTimeout(resolve, 500));
       fetchData(); // Refresh the invoice list
    } catch (error: any) {
      toast({
        title: t('invoices.deleteError') || "Error",
        description: error.message || t('invoices.deleteFailed') || "Failed to delete invoice",
        variant: "destructive",
      });
    }
  };

  // Calculate summary stats
  const stats = {
    total: filteredInvoices.length,
    totalAmount: filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0),
    totalPaid: filteredInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0),
    totalOutstanding: filteredInvoices.reduce((sum, inv) => sum + Number(inv.remaining_balance || 0), 0),
    paid: filteredInvoices.filter(inv => inv.payment_status === 'paid').length,
    partial: filteredInvoices.filter(inv => inv.payment_status === 'partial').length,
    pending: filteredInvoices.filter(inv => inv.payment_status === 'pending').length,
    sell: filteredInvoices.filter(inv => inv.invoice_type === 'sell').length,
    buy: filteredInvoices.filter(inv => inv.invoice_type === 'buy').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-2 sm:space-y-3">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {t('invoices.title')}
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm">{t('invoices.subtitle')}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
             <Button
               onClick={() => navigate("/invoices/new/buy")}
               className="gap-1.5 sm:gap-2 bg-gradient-success text-white hover:shadow-lg hover:shadow-success/50 transition-all duration-300 hover:scale-105 border-0 text-xs sm:text-sm flex-1 sm:flex-initial dark:text-white [&_svg]:text-white"
             >
               <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
               <span className="hidden sm:inline">{t('invoices.newBuyInvoice')}</span>
               <span className="sm:hidden">Buy</span>
             </Button>
            <Button
              onClick={() => navigate("/invoices/new/sell")}
              className="gap-1.5 sm:gap-2 gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 text-xs sm:text-sm flex-1 sm:flex-initial"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{t('invoices.newSellInvoice')}</span>
              <span className="sm:hidden">Sell</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
            >
              <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{showFilters ? t('common.hideFilters') : t('common.showFilters')}</span>
              <span className="sm:hidden">Filters</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="border-2 rounded-lg p-3 sm:p-4 bg-muted/20">
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
              <div className="space-y-2">
                <Label>{t('invoices.search')}</Label>
                <Input
                  placeholder={t('invoices.searchPlaceholder')}
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('invoices.invoiceType')}</Label>
                <Select value={filters.type} onValueChange={(value) => setFilters({...filters, type: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('invoices.allTypes')} />
                  </SelectTrigger>
                  <SelectContent side="bottom" align="start">
                    <SelectItem value="all">{t('invoices.allTypes')}</SelectItem>
                    <SelectItem value="sell">{t('invoices.sell')}</SelectItem>
                    <SelectItem value="buy">{t('invoices.buy')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('invoices.paymentStatus')}</Label>
                <Select value={filters.payment_status} onValueChange={(value) => setFilters({...filters, payment_status: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('invoices.allStatuses')} />
                  </SelectTrigger>
                  <SelectContent side="bottom" align="start">
                    <SelectItem value="all">{t('invoices.allStatuses')}</SelectItem>
                    <SelectItem value="paid">{t('invoices.paid')}</SelectItem>
                    <SelectItem value="partial">{t('invoices.partiallyPaid')}</SelectItem>
                    <SelectItem value="pending">{t('invoices.pending')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('invoices.product')}</Label>
                <Select value={filters.product_id} onValueChange={(value) => setFilters({...filters, product_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('invoices.allProducts')} />
                  </SelectTrigger>
                  <SelectContent side="bottom" align="start">
                    <SelectItem value="all">{t('invoices.allProducts')}</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <span className="text-muted-foreground text-xs">#{product.id}</span> {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('invoices.customer')}</Label>
                <Select value={filters.customer_id} onValueChange={(value) => setFilters({...filters, customer_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('invoices.allCustomers')} />
                  </SelectTrigger>
                  <SelectContent side="bottom" align="start">
                    <SelectItem value="all">{t('invoices.allCustomers')}</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('invoices.supplier')}</Label>
                <Select value={filters.supplier_id} onValueChange={(value) => setFilters({...filters, supplier_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('invoices.allSuppliers')} />
                  </SelectTrigger>
                  <SelectContent side="bottom" align="start">
                    <SelectItem value="all">{t('invoices.allSuppliers')}</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
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
                  onChange={(e) => setFilters({...filters, start_date: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('invoices.endDate')}</Label>
                <Input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) => setFilters({...filters, end_date: e.target.value})}
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end mt-4">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-2" />
                  {t('common.clear')}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 md:grid-cols-8">
          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground truncate">{t('invoices.totalInvoices')}</span>
            </div>
            <div className="text-base font-bold">{stats.total}</div>
          </div>

          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground truncate">{t('invoices.totalAmount')}</span>
            </div>
            <div className="text-sm font-bold text-primary truncate">${stats.totalAmount.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-success" />
              <span className="text-xs font-medium text-muted-foreground">{t('invoices.totalPaid')}</span>
            </div>
            <div className="text-sm font-bold text-success">${stats.totalPaid.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-warning" />
              <span className="text-xs font-medium text-muted-foreground">{t('invoices.totalOutstanding')}</span>
            </div>
            <div className="text-sm font-bold text-warning">${stats.totalOutstanding.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">{t('invoices.sell')}</span>
            </div>
            <div className="text-lg font-bold text-primary">{stats.sell}</div>
          </div>

          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-success" />
              <span className="text-xs font-medium text-muted-foreground">{t('invoices.buy')}</span>
            </div>
            <div className="text-lg font-bold text-success">{stats.buy}</div>
          </div>

          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-medium text-muted-foreground">Paid</span>
            </div>
            <div className="text-lg font-bold text-success">{stats.paid}</div>
          </div>

          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-medium text-muted-foreground">Pending</span>
            </div>
            <div className="text-lg font-bold text-warning">{stats.pending + stats.partial}</div>
          </div>
        </div>

        {/* Main Content with Side Panel */}
        <div className="flex gap-4">
          {/* Table Section */}
          <div className={`flex-1 transition-all duration-300 ${sidePanelOpen ? 'lg:mr-[420px]' : ''}`}>
            <div className="border-2 rounded-lg overflow-hidden bg-background">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5">
                      <TableHead className="font-bold whitespace-nowrap p-2 text-xs">Invoice#</TableHead>
                      <TableHead className="font-bold whitespace-nowrap p-2 text-xs">Date</TableHead>
                      <TableHead className="font-bold whitespace-nowrap hidden lg:table-cell p-2 text-xs">Due Date</TableHead>
                      <TableHead className="font-bold whitespace-nowrap p-2 text-xs">Type</TableHead>
                      <TableHead className="font-bold whitespace-nowrap p-2 text-xs">Entity</TableHead>
                      <TableHead className="font-bold whitespace-nowrap p-2 text-xs min-w-[200px]">Items</TableHead>
                      <TableHead className="text-right font-bold whitespace-nowrap p-2 text-xs">Amount</TableHead>
                      <TableHead className="text-center font-bold whitespace-nowrap p-2 text-xs">Status</TableHead>
                      <TableHead className="text-center font-bold whitespace-nowrap p-2 text-xs w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array(10).fill(0).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          {hasActiveFilters ? t('invoices.noInvoicesMatch') : t('invoices.noInvoices')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInvoices.map((invoice, idx) => {
                        const isSelected = selectedInvoiceId === String(invoice.id);
                        const items = invoice.invoice_items || [];
                        const itemsPreview = items.slice(0, 2);
                        const remainingCount = items.length > 2 ? items.length - 2 : 0;
                        
                        return (
                          <TableRow 
                            key={invoice.id}
                            className={`hover:bg-primary/5 transition-colors cursor-pointer ${isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : ''}`}
                            onClick={() => handleRowClick(String(invoice.id))}
                          >
                            <TableCell className="font-bold text-primary p-2 text-xs">
                              #{invoice.id}
                            </TableCell>
                            <TableCell className="p-2 text-xs">
                              {formatDateTimeLebanon(invoice.invoice_date, "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell p-2 text-xs">
                              {invoice.due_date ? (
                                <span className={new Date(invoice.due_date) < new Date() && invoice.payment_status !== 'paid' 
                                  ? 'text-destructive font-semibold' 
                                  : 'text-muted-foreground'}>
                                  {formatDateTimeLebanon(invoice.due_date, "MMM dd, yyyy")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">-</span>
                              )}
                            </TableCell>
                            <TableCell className="p-2">
                              <Badge 
                                variant={invoice.invoice_type === 'sell' ? 'default' : 'success'}
                                className="text-xs"
                              >
                                {invoice.invoice_type === 'sell' ? t('invoices.sell') : t('invoices.buy')}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium p-3 text-sm max-w-[150px] truncate">
                              {invoice.customers?.name || invoice.suppliers?.name || "N/A"}
                            </TableCell>
                            <TableCell className="p-2">
                              {items.length > 0 ? (
                                <div className="space-y-1.5">
                                  {itemsPreview.map((item: any, itemIdx: number) => {
                                    const product = products.find((p: any) => String(p.id) === String(item.product_id));
                                    const productName = item.product_name || product?.name || 'Product';
                                    const productBarcode = item.product_barcode || product?.barcode || '';
                                    const productSku = item.product_sku || product?.sku || '';
                                    const identifier = productSku || productBarcode || '';
                                    
                                    return (
                                      <div key={itemIdx} className="text-xs bg-muted/30 rounded px-2 py-1">
                                        <div className="font-medium truncate">{productName}</div>
                                        <div className="text-muted-foreground text-[10px] font-mono truncate">
                                          {identifier && `${identifier} • `}Qty: {item.quantity} × ${Number(item.unit_price || 0).toFixed(2)}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {remainingCount > 0 && (
                                    <div className="text-xs text-muted-foreground italic px-2">
                                      +{remainingCount} more item{remainingCount !== 1 ? 's' : ''}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm italic">No items</span>
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-bold p-3 ${
                              invoice.payment_status === 'paid' 
                                ? 'text-success' 
                                : 'text-warning'
                            }`}>
                              ${Number(invoice.total_amount).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center p-3">
                              <Badge 
                                variant={
                                  invoice.payment_status === 'paid' 
                                    ? 'success' :
                                  invoice.payment_status === 'partial'
                                    ? 'warning' :
                                    'warning'
                                }
                                className="text-xs"
                              >
                                {invoice.payment_status === 'paid' ? t('invoices.paid') : 
                                 invoice.payment_status === 'partial' ? t('invoices.partial') : 
                                 t('invoices.pending')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center p-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => handleViewDetails(String(invoice.id), e)}
                                  className="h-8 w-8 p-0"
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {invoice.payment_status !== 'paid' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/invoices/edit/${invoice.id}`);
                                    }}
                                    className="h-8 w-8 p-0"
                                    title="Edit"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteInvoice(String(invoice.id));
                                  }}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* Fixed Side Panel */}
          <div className={`hidden lg:block fixed right-4 top-20 bottom-4 w-[400px] transition-transform duration-300 z-30 ${
            sidePanelOpen ? 'translate-x-0' : 'translate-x-[420px]'
          }`}>
            <InvoiceItemsSidePanel
              open={sidePanelOpen}
              onOpenChange={setSidePanelOpen}
              invoiceId={selectedInvoiceId}
            />
          </div>
        </div>

        {/* Payment Dialog */}
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          invoiceId={selectedInvoiceId}
          onPaymentRecorded={handlePaymentRecorded}
        />

        {/* Invoice Items Side Panel (Mobile/Tablet - Overlay) */}
        <div className="lg:hidden">
          <InvoiceItemsSidePanel
            open={sidePanelOpen}
            onOpenChange={setSidePanelOpen}
            invoiceId={selectedInvoiceId}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default InvoicesList;

