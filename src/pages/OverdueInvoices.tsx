import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import PaymentDialog from "@/components/PaymentDialog";
import InvoiceDetailDialog from "@/components/InvoiceDetailDialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, DollarSign, Eye, CreditCard, Pencil, Trash2, Calendar } from "lucide-react";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { invoicesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const OverdueInvoices = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const invoicesData = await invoicesRepo.getOverdueInvoices();
      setInvoices(invoicesData || []);
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
    if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      return;
    }

    try {
      await invoicesRepo.deleteInvoice(invoiceId);
      toast({
        title: "Success",
        description: "Invoice deleted successfully",
      });
      // Invalidate all related queries to force immediate refresh
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["daily-stock"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      // Small delay to ensure database commits complete (reduced since backend is optimized)
      await new Promise(resolve => setTimeout(resolve, 500));
      fetchData(); // Refresh the invoice list
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete invoice",
        variant: "destructive",
      });
    }
  };

  const calculateDaysOverdue = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // Calculate summary stats
  const stats = {
    total: invoices.length,
    totalAmount: invoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0),
    totalOutstanding: invoices.reduce((sum, inv) => sum + Number(inv.remaining_balance || 0), 0),
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-destructive via-warning to-destructive bg-clip-text text-transparent">
              Overdue Invoices
            </h1>
            <p className="text-muted-foreground">
              Invoices with due date past today and payment status not paid
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border rounded-lg p-3 bg-destructive/10 dark:bg-destructive/20 border-destructive/30 dark:border-destructive/40">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <span className="text-xs font-medium text-destructive">Overdue Invoices</span>
            </div>
            <div className="text-2xl font-bold text-destructive">{stats.total}</div>
          </div>

          <div className="border rounded-lg p-3 bg-warning/10 dark:bg-warning/20 border-warning/30 dark:border-warning/40">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-warning" />
              <span className="text-xs font-medium text-warning">Total Amount</span>
            </div>
            <div className="text-lg font-bold text-warning">${stats.totalAmount.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-3 bg-destructive/10 dark:bg-destructive/20 border-destructive/30 dark:border-destructive/40">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-destructive" />
              <span className="text-xs font-medium text-destructive">Outstanding Balance</span>
            </div>
            <div className="text-lg font-bold text-destructive">${stats.totalOutstanding.toFixed(2)}</div>
          </div>
        </div>

        {/* Table */}
        <div className="border-2 rounded-lg overflow-hidden border-destructive/30 dark:border-destructive/40">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-destructive/10 to-warning/10 dark:from-destructive/20 dark:to-warning/20">
                <TableHead className="font-bold">Invoice#</TableHead>
                <TableHead className="font-bold">Date</TableHead>
                <TableHead className="font-bold">Due Date</TableHead>
                <TableHead className="font-bold">Days Overdue</TableHead>
                <TableHead className="font-bold">Type</TableHead>
                <TableHead className="font-bold">Entity</TableHead>
                <TableHead className="font-bold">Items</TableHead>
                <TableHead className="text-right font-bold">Amount</TableHead>
                <TableHead className="text-right font-bold">Outstanding</TableHead>
                <TableHead className="text-center font-bold">Status</TableHead>
                <TableHead className="text-center font-bold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  </TableRow>
                ))
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Calendar className="w-12 h-12 text-muted-foreground" />
                      <p className="text-lg font-medium">No overdue invoices</p>
                      <p className="text-sm">All invoices are up to date!</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice, idx) => {
                  const daysOverdue = calculateDaysOverdue(invoice.due_date);
                  return (
                    <TableRow 
                      key={invoice.id}
                      className="hover:bg-destructive/10 dark:hover:bg-destructive/20 transition-colors animate-fade-in"
                      style={{ animationDelay: `${idx * 0.01}s` }}
                    >
                      <TableCell className="font-bold text-primary">
                        #{invoice.id}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTimeLebanon(invoice.invoice_date, "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-destructive font-semibold">
                          {formatDateTimeLebanon(invoice.due_date, "MMM dd, yyyy")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="font-bold">
                          {daysOverdue} {daysOverdue === 1 ? 'day' : 'days'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={invoice.invoice_type === 'sell' ? 'default' : 'success'}
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
                      <TableCell className="text-right font-bold text-lg text-warning">
                        ${Number(invoice.total_amount).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg text-destructive">
                        ${Number(invoice.remaining_balance || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="warning"
                        >
                          {invoice.payment_status === 'partial' ? t('invoices.partial') : t('invoices.pending')}
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
                            variant="default"
                            size="sm"
                            onClick={() => handleRecordPayment(invoice.id)}
                            className="gap-1 bg-success hover:bg-success/90"
                          >
                            <CreditCard className="w-4 h-4" />
                            Payment
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteInvoice(invoice.id)}
                            className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2 text-xs"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
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

export default OverdueInvoices;

