import { useState, useEffect, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Filter, X, Pencil, Trash2, Eye, Plus } from "lucide-react";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { paymentsRepo, invoicesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import InvoicePaymentsSidePanel from "@/components/InvoicePaymentsSidePanel";
import AddPaymentDialog from "@/components/AddPaymentDialog";

interface Payment {
  id: number;
  invoice_id: number;
  paid_amount: number;
  currency_code: string;
  exchange_rate_on_payment: number;
  usd_equivalent_amount: number;
  payment_date: string;
  payment_method: string | null;
  notes: string | null;
  invoice_type: string;
  invoice_total_amount: number;
  invoice_date: string;
  customer_name: string | null;
  supplier_name: string | null;
}

const InvoicePayments = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  
  const [filters, setFilters] = useState({
    invoice_id: "all",
    currency_code: "all",
    start_date: "",
    end_date: "",
    search: "",
  });

  const [showFilters, setShowFilters] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [addPaymentDialogOpen, setAddPaymentDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [paymentsData, invoicesData] = await Promise.all([
        paymentsRepo.list(),
        invoicesRepo.listWithRelations(),
      ]);
      setPayments(paymentsData || []);
      setInvoices(invoicesData || []);
    } catch (error: any) {
      toast({
        title: t('common.error') || "Error",
        description: error.message || "Failed to load payments",
        variant: "destructive",
      });
      setPayments([]);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Memoize filtered payments to avoid recalculating on every render
  const filteredPayments = useMemo(() => {
    let filtered = [...payments];

    if (filters.invoice_id !== "all") {
      filtered = filtered.filter(p => String(p.invoice_id) === filters.invoice_id);
    }

    if (filters.currency_code !== "all") {
      filtered = filtered.filter(p => p.currency_code === filters.currency_code);
    }

    if (filters.start_date) {
      filtered = filtered.filter(p => {
        const paymentDate = new Date(p.payment_date);
        paymentDate.setHours(0, 0, 0, 0);
        const start = new Date(filters.start_date);
        start.setHours(0, 0, 0, 0);
        return paymentDate >= start;
      });
    }

    if (filters.end_date) {
      filtered = filtered.filter(p => {
        const paymentDate = new Date(p.payment_date);
        paymentDate.setHours(0, 0, 0, 0);
        const end = new Date(filters.end_date);
        end.setHours(23, 59, 59, 999);
        return paymentDate <= end;
      });
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(p => 
        String(p.invoice_id).includes(searchLower) ||
        (p.customer_name && p.customer_name.toLowerCase().includes(searchLower)) ||
        (p.supplier_name && p.supplier_name.toLowerCase().includes(searchLower)) ||
        String(p.paid_amount).includes(searchLower) ||
        (p.notes && p.notes.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  }, [payments, filters]);

  const clearFilters = useCallback(() => {
    setFilters({
      invoice_id: "all",
      currency_code: "all",
      start_date: "",
      end_date: "",
      search: "",
    });
  }, []);

  const hasActiveFilters = useMemo(() => 
    filters.invoice_id !== "all" || 
    filters.currency_code !== "all" || 
    filters.start_date !== "" || 
    filters.end_date !== "" || 
    filters.search !== "",
    [filters]
  );

  const handleViewPayment = useCallback((payment: Payment, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    // Toggle: if same payment is selected and panel is open, close it
    if (selectedPayment?.id === payment.id && sidePanelOpen) {
      setSidePanelOpen(false);
      setSelectedPayment(null);
    } else {
      setSelectedPayment(payment);
      setSidePanelOpen(true);
    }
  }, [selectedPayment, sidePanelOpen]);

  const handleDeletePayment = useCallback(async (payment: Payment) => {
    if (!confirm(`Are you sure you want to delete this payment? This action cannot be undone.`)) {
      return;
    }

    try {
      await invoicesRepo.deletePayment(String(payment.invoice_id), String(payment.id));
      toast({
        title: "Success",
        description: "Payment deleted successfully. Invoice status recalculated.",
      });
      await fetchData();
      if (selectedPayment?.id === payment.id) {
        setSidePanelOpen(false);
        setSelectedPayment(null);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [selectedPayment, toast, fetchData]);

  const handlePaymentUpdated = useCallback(() => {
    fetchData();
    setSidePanelOpen(false);
    setSelectedPayment(null);
  }, [fetchData]);

  // Memoize summary stats to avoid recalculating on every render
  const stats = useMemo(() => {
    const usdPayments = filteredPayments.filter(p => p.currency_code === 'USD');
    const lbpPayments = filteredPayments.filter(p => p.currency_code === 'LBP');
    const eurPayments = filteredPayments.filter(p => p.currency_code === 'EUR');
    
    return {
      total: filteredPayments.length,
      totalUsd: filteredPayments.reduce((sum, p) => sum + Number(p.usd_equivalent_amount || 0), 0),
      byCurrency: {
        USD: usdPayments.reduce((sum, p) => sum + Number(p.usd_equivalent_amount || 0), 0),
        LBP: lbpPayments.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0),
        EUR: eurPayments.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0),
      },
    };
  }, [filteredPayments]);

  return (
    <DashboardLayout>
      <div className="space-y-1.5 sm:space-y-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              💳 Invoice Payments
            </h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs">Manage all invoice payments</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              onClick={() => setAddPaymentDialogOpen(true)}
              size="sm"
              className="gap-1 h-7 sm:h-8 bg-gradient-success text-white hover:shadow-lg hover:shadow-success/50 transition-all duration-300 border-0 text-xs"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden sm:inline">Add Payment</span>
              <span className="sm:hidden">Add</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1 h-7 sm:h-8 text-xs"
            >
              <Filter className="w-3 h-3" />
              <span className="hidden sm:inline">{showFilters ? 'Hide' : 'Filters'}</span>
              <span className="sm:hidden">Filters</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="border rounded-lg p-2 bg-muted/20">
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Search</Label>
                <Input
                  placeholder="Search by invoice, customer, supplier, amount..."
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label>Invoice</Label>
                <Select value={filters.invoice_id} onValueChange={(value) => setFilters({...filters, invoice_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Invoices" />
                  </SelectTrigger>
                  <SelectContent side="bottom" align="start">
                    <SelectItem value="all">All Invoices</SelectItem>
                    {invoices.map((invoice) => (
                      <SelectItem key={invoice.id} value={String(invoice.id)}>
                        #{invoice.id} - {invoice.customers?.name || invoice.suppliers?.name || 'N/A'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={filters.currency_code} onValueChange={(value) => setFilters({...filters, currency_code: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Currencies" />
                  </SelectTrigger>
                  <SelectContent side="bottom" align="start">
                    <SelectItem value="all">All Currencies</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="LBP">LBP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
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

            {hasActiveFilters && (
              <div className="flex justify-end mt-2">
                <Button variant="outline" size="sm" onClick={clearFilters} className="h-7 text-xs">
                  <X className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-4">
          <div className="border rounded p-1.5">
            <div className="text-[10px] font-medium text-muted-foreground">Total Payments</div>
            <div className="text-sm font-bold">{stats.total}</div>
          </div>
          <div className="border rounded p-1.5">
            <div className="text-[10px] font-medium text-muted-foreground">Total USD</div>
            <div className="text-xs font-bold text-primary">${stats.totalUsd.toFixed(2)}</div>
          </div>
          <div className="border rounded p-1.5">
            <div className="text-[10px] font-medium text-muted-foreground">LBP Payments</div>
            <div className="text-xs font-bold">{stats.byCurrency.LBP.toFixed(2)} LBP</div>
          </div>
          <div className="border rounded p-1.5">
            <div className="text-[10px] font-medium text-muted-foreground">EUR Payments</div>
            <div className="text-xs font-bold">{stats.byCurrency.EUR.toFixed(2)} EUR</div>
          </div>
        </div>

        {/* Main Content with Side Panel */}
        <div className="flex gap-4">
          {/* Table Section */}
          <div className={`flex-1 transition-all duration-300 ${sidePanelOpen ? 'lg:mr-[420px]' : ''}`}>
            <div className="border rounded overflow-hidden bg-background">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5">
                      <TableHead className="font-bold whitespace-nowrap p-1.5 text-[10px]">Date</TableHead>
                      <TableHead className="font-bold whitespace-nowrap p-1.5 text-[10px]">Invoice#</TableHead>
                      <TableHead className="font-bold whitespace-nowrap p-1.5 text-[10px]">Entity</TableHead>
                      <TableHead className="font-bold whitespace-nowrap p-1.5 text-[10px]">Amount</TableHead>
                      <TableHead className="font-bold whitespace-nowrap p-1.5 text-[10px]">USD Eq.</TableHead>
                      <TableHead className="text-center font-bold whitespace-nowrap p-1.5 text-[10px] w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                       Array(10).fill(0).map((_, i) => (
                         <TableRow key={i}>
                           <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                           <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                           <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                           <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                           <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                           <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                         </TableRow>
                       ))
                     ) : filteredPayments.length === 0 ? (
                       <TableRow>
                         <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs">
                           {hasActiveFilters ? 'No payments match the filters' : 'No payments found'}
                         </TableCell>
                       </TableRow>
                    ) : (
                      filteredPayments.map((payment) => {
                        const entityName = payment.customer_name || payment.supplier_name || "N/A";
                        const isSelected = selectedPayment?.id === payment.id;
                        
                        return (
                          <TableRow 
                            key={payment.id}
                            className={`hover:bg-primary/5 transition-colors cursor-pointer ${isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : ''}`}
                            onClick={() => handleViewPayment(payment)}
                          >
                            <TableCell className="p-1.5 text-[10px]">
                              {formatDateTimeLebanon(payment.payment_date, "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell className="font-bold text-primary p-1.5 text-[10px]">
                              #{payment.invoice_id}
                            </TableCell>
                            <TableCell className="font-medium p-1.5 text-xs max-w-[120px] truncate">
                              {entityName}
                            </TableCell>
                            <TableCell className="p-1.5 text-[10px]">
                              <div className="font-medium">
                                {parseFloat(String(payment.paid_amount || 0)).toFixed(2)} {payment.currency_code}
                              </div>
                              <div className="text-[9px] text-muted-foreground">
                                Rate: {parseFloat(String(payment.exchange_rate_on_payment || 1)).toFixed(6)}
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold text-success p-1.5 text-[10px]">
                              ${parseFloat(String(payment.usd_equivalent_amount || 0)).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center p-1.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => handleViewPayment(payment, e)}
                                  className="h-6 w-6 p-0"
                                  title="View/Edit"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePayment(payment);
                                  }}
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Delete"
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
            {selectedPayment && (
              <InvoicePaymentsSidePanel
                open={sidePanelOpen}
                onOpenChange={setSidePanelOpen}
                invoiceId={String(selectedPayment.invoice_id)}
                onPaymentUpdated={handlePaymentUpdated}
              />
            )}
          </div>
        </div>

        {/* Invoice Payments Side Panel (Mobile/Tablet - Overlay) */}
        <div className="lg:hidden">
          {selectedPayment && (
            <InvoicePaymentsSidePanel
              open={sidePanelOpen}
              onOpenChange={setSidePanelOpen}
              invoiceId={String(selectedPayment.invoice_id)}
              onPaymentUpdated={handlePaymentUpdated}
            />
          )}
        </div>

        {/* Add Payment Dialog */}
        <AddPaymentDialog
          open={addPaymentDialogOpen}
          onOpenChange={setAddPaymentDialogOpen}
          invoices={invoices}
          onPaymentRecorded={handlePaymentUpdated}
        />
      </div>
    </DashboardLayout>
  );
};

export default InvoicePayments;

