import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PaymentDialog from "@/components/PaymentDialog";
import InvoiceDetailDialog from "@/components/InvoiceDetailDialog";
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
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log('Fetching invoices data...');
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

  const handleViewDetails = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setDetailDialogOpen(true);
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
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {t('invoices.title')}
            </h1>
            <p className="text-muted-foreground">{t('invoices.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
             <Button
               onClick={() => navigate("/invoices/new/buy")}
               className="gap-2 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 hover:from-emerald-700 hover:via-teal-600 hover:to-cyan-600 text-white hover:shadow-lg hover:shadow-emerald-500/50 transition-all duration-300 hover:scale-105 border-0"
             >
               <Plus className="w-4 h-4" />
               {t('invoices.newBuyInvoice')}
             </Button>
            <Button
              onClick={() => navigate("/invoices/new/sell")}
              className="gap-2 gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              {t('invoices.newSellInvoice')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              {showFilters ? t('common.hideFilters') : t('common.showFilters')}
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="border-2 rounded-lg p-4 bg-muted/20">
            <div className="grid gap-4 md:grid-cols-4">
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
                  <SelectContent>
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
                  <SelectContent>
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
                  <SelectContent>
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
                  <SelectContent>
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
                  <SelectContent>
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
        <div className="grid gap-3 md:grid-cols-8">
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">{t('invoices.totalInvoices')}</span>
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">{t('invoices.totalAmount')}</span>
            </div>
            <div className="text-lg font-bold text-primary">${stats.totalAmount.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-muted-foreground">{t('invoices.totalPaid')}</span>
            </div>
            <div className="text-lg font-bold text-green-600">${stats.totalPaid.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-medium text-muted-foreground">{t('invoices.totalOutstanding')}</span>
            </div>
            <div className="text-lg font-bold text-orange-600">${stats.totalOutstanding.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">{t('invoices.sell')}</span>
            </div>
            <div className="text-2xl font-bold text-primary">{stats.sell}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-medium text-muted-foreground">{t('invoices.buy')}</span>
            </div>
            <div className="text-2xl font-bold text-teal-600">{stats.buy}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">Paid</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.paid}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">Pending</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">{stats.pending + stats.partial}</div>
          </div>
        </div>

        {/* Table */}
        <div className="border-2 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5">
                <TableHead className="font-bold">Invoice#</TableHead>
                <TableHead className="font-bold">{t('invoices.date')}</TableHead>
                <TableHead className="font-bold">Due Date</TableHead>
                <TableHead className="font-bold">{t('invoices.type')}</TableHead>
                <TableHead className="font-bold">{t('invoices.entity')}</TableHead>
                <TableHead className="font-bold">{t('invoices.items')}</TableHead>
                <TableHead className="text-right font-bold">{t('invoices.amount')}</TableHead>
                <TableHead className="text-center font-bold">{t('invoices.status')}</TableHead>
                <TableHead className="text-center font-bold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array(10).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  </TableRow>
                ))
              ) : filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    {hasActiveFilters ? t('invoices.noInvoicesMatch') : t('invoices.noInvoices')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((invoice, idx) => (
                  <TableRow 
                    key={invoice.id}
                    className="hover:bg-primary/5 transition-colors animate-fade-in"
                    style={{ animationDelay: `${idx * 0.01}s` }}
                  >
                    <TableCell className="font-bold text-primary">
                      #{invoice.id}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTimeLebanon(invoice.invoice_date, "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {invoice.due_date ? (
                        <span className={new Date(invoice.due_date) < new Date() && invoice.payment_status !== 'paid' 
                          ? 'text-red-600 font-semibold' 
                          : 'text-muted-foreground'}>
                          {formatDateTimeLebanon(invoice.due_date, "MMM dd, yyyy")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">No due date</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        className={
                          invoice.invoice_type === 'sell'
                            ? 'bg-primary hover:bg-primary/90 text-primary-foreground border-primary'
                            : 'bg-teal-500 hover:bg-teal-600 text-white border-teal-600'
                        }
                      >
                        {invoice.invoice_type === 'sell' ? t('invoices.sell') : t('invoices.buy')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {invoice.customers?.name || invoice.suppliers?.name || "N/A"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.invoice_items?.length || 0} items
                    </TableCell>
                    <TableCell className={`text-right font-bold text-lg ${
                      invoice.payment_status === 'paid' 
                        ? 'text-green-600' 
                        : invoice.payment_status === 'partial'
                        ? 'text-orange-600'
                        : 'text-orange-600'
                    }`}>
                      ${Number(invoice.total_amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        className={
                          invoice.payment_status === 'paid' 
                            ? 'bg-green-500 hover:bg-green-600 text-white border-green-600' :
                          invoice.payment_status === 'partial'
                            ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-600' :
                          'bg-orange-100 hover:bg-orange-200 text-orange-800 border-orange-300'
                        }
                      >
                        {invoice.payment_status === 'paid' ? t('invoices.paid') : 
                         invoice.payment_status === 'partial' ? t('invoices.partial') : 
                         t('invoices.pending')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(invoice.id)}
                          className="gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          {t('invoices.view')}
                        </Button>
                        {invoice.payment_status !== 'paid' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/invoices/edit/${invoice.id}`)}
                              className="gap-1"
                            >
                              <Pencil className="w-4 h-4" />
                              {t('invoices.edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRecordPayment(invoice.id)}
                              className="gap-1"
                            >
                              <CreditCard className="w-4 h-4" />
                              {"Payment"}
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteInvoice(invoice.id)}
                          className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2 text-xs"
                        >
                          <Trash2 className="w-3 h-3" />
                          {"Delete"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Payment Dialog */}
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          invoiceId={selectedInvoiceId}
          onPaymentRecorded={handlePaymentRecorded}
        />

        {/* Invoice Detail Dialog */}
        <InvoiceDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          invoiceId={selectedInvoiceId}
        />
      </div>
    </DashboardLayout>
  );
};

export default InvoicesList;

