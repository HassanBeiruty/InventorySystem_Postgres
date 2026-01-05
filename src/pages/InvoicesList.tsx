import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import PaymentDialog from "@/components/PaymentDialog";
import InvoiceItemsSidePanel from "@/components/InvoiceItemsSidePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, TrendingUp, TrendingDown, DollarSign, Plus, Eye, Pencil, Trash2, Calendar, Search, X } from "lucide-react";
import { formatDateTimeLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { invoicesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const InvoicesList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Date filter state - default to 3 days ago to today
  const getDefaultStartDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - 3);
    return date.toISOString().split('T')[0];
  };
  const [startDate, setStartDate] = useState<string>(getDefaultStartDate());
  const [endDate, setEndDate] = useState<string>(getTodayLebanon());
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const invoicesData = await invoicesRepo.listWithRelations();
      const invoices = invoicesData || [];
      setInvoices(invoices);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
  }, [fetchData]);


  const handleRecordPayment = useCallback((invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setPaymentDialogOpen(true);
  }, []);

  const handleViewDetails = useCallback((invoiceId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    setSelectedInvoiceId(invoiceId);
    setSidePanelOpen(true);
  }, []);

  const handleRowClick = useCallback((invoiceId: string) => {
    setSelectedInvoiceId(prev => {
      if (prev === invoiceId && sidePanelOpen) {
        setSidePanelOpen(false);
        return "";
      } else {
        setSidePanelOpen(true);
        return invoiceId;
      }
    });
  }, [sidePanelOpen]);

  const handlePaymentRecorded = useCallback(() => {
    fetchData(); // Refresh the invoice list
  }, [fetchData]);

  const handleDeleteInvoice = useCallback(async (invoiceId: string) => {
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
  }, [t, toast, queryClient, fetchData]);

  // Memoize filtered invoices to avoid recalculating on every render
  const filteredInvoices = useMemo(() => {
    let result = [...invoices];

    // Filter by date range
    if (startDate) {
      result = result.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        return invDate >= start;
      });
    }
    if (endDate) {
      result = result.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return invDate <= end;
      });
    }

    // Search filter (invoice number, entity name, or amount)
    if (searchQuery.trim()) {
      const searchLower = searchQuery.toLowerCase();
      result = result.filter(inv => {
        const invoiceNumber = inv.id?.toString() || "";
        const entityName = inv.customers?.name || inv.suppliers?.name || "";
        const amount = inv.total_amount?.toString() || "";
        return invoiceNumber.includes(searchLower) || 
               entityName.toLowerCase().includes(searchLower) || 
               amount.includes(searchLower);
      });
    }

    return result;
  }, [invoices, startDate, endDate, searchQuery]);

  // Memoize summary stats to avoid recalculating on every render
  const stats = useMemo(() => ({
    total: filteredInvoices.length,
    totalAmount: filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0),
    totalPaid: filteredInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0),
    totalOutstanding: filteredInvoices.reduce((sum, inv) => sum + Number(inv.remaining_balance || 0), 0),
    paid: filteredInvoices.filter(inv => inv.payment_status === 'paid').length,
    partial: filteredInvoices.filter(inv => inv.payment_status === 'partial').length,
    pending: filteredInvoices.filter(inv => inv.payment_status === 'pending').length,
    sell: filteredInvoices.filter(inv => inv.invoice_type === 'sell').length,
    buy: filteredInvoices.filter(inv => inv.invoice_type === 'buy').length,
  }), [filteredInvoices]);

  return (
    <DashboardLayout>
      <div className="space-y-1.5 sm:space-y-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
              <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                {t('invoices.title')}
              </h1>
              <p className="text-muted-foreground text-[10px] sm:text-xs">{t('invoices.subtitle')}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 w-full sm:w-auto">
             <Button
               onClick={() => navigate("/invoices/new/buy")}
               className="gap-1 bg-gradient-success text-white hover:shadow-lg hover:shadow-success/50 transition-all duration-300 hover:scale-105 border-0 text-[10px] sm:text-xs h-7 flex-1 sm:flex-initial dark:text-white [&_svg]:text-white"
             >
               <Plus className="w-3 h-3" />
               <span className="hidden sm:inline">{t('invoices.newBuyInvoice')}</span>
               <span className="sm:hidden">Buy</span>
             </Button>
            <Button
              onClick={() => navigate("/invoices/new/sell")}
              className="gap-1 gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 text-[10px] sm:text-xs h-7 flex-1 sm:flex-initial"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden sm:inline">{t('invoices.newSellInvoice')}</span>
              <span className="sm:hidden">Sell</span>
            </Button>
          </div>
        </div>

        {/* Search and Date Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1">
          <div className="relative w-full sm:w-auto sm:min-w-[200px]">
            <Search className="absolute left-1.5 top-1/2 transform -translate-y-1/2 w-2.5 h-2.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search invoices (ID, customer, supplier, amount)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-6 pr-6 h-6 text-[10px]"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="absolute right-0.5 top-1/2 transform -translate-y-1/2 h-4 w-4 p-0"
              >
                <X className="w-2 h-2" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Label htmlFor="start-date-invoice" className="text-[9px] whitespace-nowrap">
              <Calendar className="w-2.5 h-2.5 inline mr-0.5" />
              From:
            </Label>
            <Input
              id="start-date-invoice"
              type="date"
              value={startDate}
              onChange={(e) => {
                const newStartDate = e.target.value;
                setStartDate(newStartDate);
                // If end date is before new start date, update end date
                if (endDate && newStartDate > endDate) {
                  setEndDate(newStartDate);
                }
              }}
              max={endDate || getTodayLebanon()}
              className="h-6 text-[10px] w-28"
            />
          </div>
          <div className="flex items-center gap-1">
            <Label htmlFor="end-date-invoice" className="text-[9px] whitespace-nowrap">
              To:
            </Label>
            <Input
              id="end-date-invoice"
              type="date"
              value={endDate}
              onChange={(e) => {
                const newEndDate = e.target.value;
                if (!startDate || newEndDate >= startDate) {
                  setEndDate(newEndDate);
                }
              }}
              min={startDate}
              max={getTodayLebanon()}
              className="h-6 text-[10px] w-28"
            />
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-4 md:grid-cols-8">
          <div className="border rounded-lg p-1.5">
            <div className="flex items-center gap-1 mb-1">
              <FileText className="w-3 h-3 text-primary flex-shrink-0" />
              <span className="text-[10px] font-medium text-muted-foreground truncate">{t('invoices.totalInvoices')}</span>
            </div>
            <div className="text-sm font-bold">{stats.total}</div>
          </div>

          <div className="border rounded-lg p-1.5">
            <div className="flex items-center gap-1 mb-1">
              <DollarSign className="w-3 h-3 text-primary flex-shrink-0" />
              <span className="text-[10px] font-medium text-muted-foreground truncate">{t('invoices.totalAmount')}</span>
            </div>
            <div className="text-xs font-bold text-primary truncate">${stats.totalAmount.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-1.5">
            <div className="flex items-center gap-1 mb-1">
              <DollarSign className="w-3 h-3 text-success" />
              <span className="text-[10px] font-medium text-muted-foreground">{t('invoices.totalPaid')}</span>
            </div>
            <div className="text-xs font-bold text-success">${stats.totalPaid.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-1.5">
            <div className="flex items-center gap-1 mb-1">
              <DollarSign className="w-3 h-3 text-warning" />
              <span className="text-[10px] font-medium text-muted-foreground">{t('invoices.totalOutstanding')}</span>
            </div>
            <div className="text-xs font-bold text-warning">${stats.totalOutstanding.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-1.5">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-medium text-muted-foreground">{t('invoices.sell')}</span>
            </div>
            <div className="text-sm font-bold text-primary">{stats.sell}</div>
          </div>

          <div className="border rounded-lg p-1.5">
            <div className="flex items-center gap-1 mb-1">
              <TrendingDown className="w-3 h-3 text-success" />
              <span className="text-[10px] font-medium text-muted-foreground">{t('invoices.buy')}</span>
            </div>
            <div className="text-sm font-bold text-success">{stats.buy}</div>
          </div>

          <div className="border rounded-lg p-1.5">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[10px] font-medium text-muted-foreground">Paid</span>
            </div>
            <div className="text-sm font-bold text-success">{stats.paid}</div>
          </div>

          <div className="border rounded-lg p-1.5">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[10px] font-medium text-muted-foreground">Pending</span>
            </div>
            <div className="text-sm font-bold text-muted-foreground">{stats.pending}</div>
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
                        <TableHead className="font-bold whitespace-nowrap p-1 text-[10px]">Invoice#</TableHead>
                        <TableHead className="font-bold whitespace-nowrap p-1 text-[10px]">Date</TableHead>
                        <TableHead className="font-bold whitespace-nowrap hidden lg:table-cell p-1 text-[10px]">Due Date</TableHead>
                        <TableHead className="font-bold whitespace-nowrap p-1 text-[10px]">Type</TableHead>
                        <TableHead className="font-bold whitespace-nowrap p-1 text-[10px]">Entity</TableHead>
                        <TableHead className="font-bold whitespace-nowrap p-1 text-[10px] min-w-[130px]">Items</TableHead>
                        <TableHead className="text-right font-bold whitespace-nowrap p-1 text-[10px] w-[80px]">Amount</TableHead>
                        <TableHead className="text-center font-bold whitespace-nowrap p-1 text-[10px]">Status</TableHead>
                        <TableHead className="text-center font-bold whitespace-nowrap p-1 text-[10px] w-[100px]">Actions</TableHead>
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
                          {searchQuery || startDate || endDate ? t('invoices.noInvoicesMatch') : t('invoices.noInvoices')}
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
                            <TableCell className="font-bold text-primary p-1 text-[10px]">
                              #{invoice.id}
                            </TableCell>
                            <TableCell className="p-1 text-[10px]">
                              {formatDateTimeLebanon(invoice.invoice_date, "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell p-1 text-[10px]">
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
                            <TableCell className="p-1">
                              <Badge 
                                variant={invoice.invoice_type === 'sell' ? 'default' : 'success'}
                                className="text-[10px]"
                              >
                                {invoice.invoice_type === 'sell' ? t('invoices.sell') : t('invoices.buy')}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium p-1 text-xs max-w-[120px] truncate">
                              {invoice.customers?.name || invoice.suppliers?.name || "N/A"}
                            </TableCell>
                            <TableCell className="p-1 pr-0.5">
                              {items.length > 0 ? (
                                <div className="space-y-0.5">
                                  {itemsPreview.map((item: any, itemIdx: number) => {
                                    const productName = item.product_name || 'Product';
                                    const productBarcode = item.product_barcode || '';
                                    const productSku = item.product_sku || '';
                                    const identifier = productSku || productBarcode || '';
                                    
                                    return (
                                      <div key={itemIdx} className="text-[10px] bg-muted/30 rounded px-1 py-0.5">
                                        <div className="font-semibold text-xs truncate">{productName}</div>
                                        <div className="text-muted-foreground text-[9px] font-mono truncate">
                                          {identifier && `${identifier} • `}Qty: {item.quantity} × ${Number(item.unit_price || 0).toFixed(2)}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {remainingCount > 0 && (
                                    <div className="text-[9px] text-muted-foreground italic px-1">
                                      +{remainingCount} more item{remainingCount !== 1 ? 's' : ''}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-[10px] italic">No items</span>
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-bold p-1 pl-0.5 ${
                              invoice.payment_status === 'paid' 
                                ? 'text-success' 
                                : invoice.payment_status === 'partial'
                                ? 'text-warning'
                                : 'text-muted-foreground'
                            }`}>
                              <span className="text-xs">${Number(invoice.total_amount).toFixed(2)}</span>
                            </TableCell>
                            <TableCell className="text-center p-1">
                              <Badge 
                                variant={
                                  invoice.payment_status === 'paid' 
                                    ? 'success' :
                                  invoice.payment_status === 'partial'
                                    ? 'warning' :
                                    'secondary'
                                }
                                className="text-[10px]"
                              >
                                {invoice.payment_status === 'paid' ? t('invoices.paid') : 
                                 invoice.payment_status === 'partial' ? t('invoices.partial') : 
                                 t('invoices.pending')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center p-1" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => handleViewDetails(String(invoice.id), e)}
                                  className="h-6 w-6 p-0"
                                  title="View Details"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                                {invoice.payment_status !== 'paid' ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/invoices/edit/${invoice.id}`);
                                    }}
                                    className="h-6 w-6 p-0"
                                    title="Edit"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                ) : (
                                  <div className="h-6 w-6" />
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteInvoice(String(invoice.id));
                                  }}
                                  disabled={Number(invoice.amount_paid || 0) > 0}
                                  className={`h-6 w-6 p-0 ${
                                    Number(invoice.amount_paid || 0) > 0
                                      ? 'text-warning hover:text-warning hover:bg-warning/10 cursor-not-allowed opacity-60'
                                      : 'text-destructive hover:text-destructive hover:bg-destructive/10'
                                  }`}
                                  title={
                                    Number(invoice.amount_paid || 0) > 0
                                      ? "Cannot delete invoice with payments. Remove all payments first."
                                      : "Delete"
                                  }
                                >
                                  <Trash2 className="w-3 h-3" />
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

