import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { invoicesRepo, exchangeRatesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { X, Pencil, Trash2 } from "lucide-react";

interface Payment {
  id: number;
  paid_amount: number;
  currency_code: string;
  exchange_rate_on_payment: number;
  usd_equivalent_amount: number;
  payment_date: string;
  payment_method: string | null;
  notes: string | null;
}

interface InvoiceDetails {
  id: number;
  invoice_type: string;
  total_amount: number;
  amount_paid: number;
  payment_status: string;
  invoice_date: string;
  due_date?: string | null;
  customers?: { name: string; phone: string };
  suppliers?: { name: string; phone: string };
  payments: Payment[];
}

interface InvoicePaymentsSidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onPaymentUpdated?: () => void;
}

export default function InvoicePaymentsSidePanel({ open, onOpenChange, invoiceId, onPaymentUpdated }: InvoicePaymentsSidePanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);
  
  // Edit form state
  const [paidAmount, setPaidAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState<"USD" | "LBP" | "EUR">("USD");
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState("");

  useEffect(() => {
    if (open && invoiceId) {
      fetchInvoiceDetails();
    } else if (!open) {
      setInvoice(null);
      setEditingPayment(null);
      setDeleteConfirmOpen(false);
      setDeletingPaymentId(null);
    }
  }, [open, invoiceId]);

  // Fetch exchange rate when currency changes
  useEffect(() => {
    if (!editDialogOpen || !currencyCode || !invoice) return;
    
    if (currencyCode === 'USD') {
      setExchangeRate(1.0);
      setFetchingRate(false);
      return;
    }
    
    const fetchExchangeRate = async () => {
      setFetchingRate(true);
      try {
        const rateData = await exchangeRatesRepo.getCurrentRate(currencyCode);
        const rate = parseFloat(String(rateData.rate_to_usd));
        setExchangeRate(rate);
      } catch (error: any) {
        console.error('Error fetching exchange rate:', error);
        toast({
          title: "Error",
          description: `Failed to fetch exchange rate for ${currencyCode}. Using current rate.`,
          variant: "destructive",
        });
        setExchangeRate(null);
      } finally {
        setFetchingRate(false);
      }
    };

    fetchExchangeRate();
  }, [currencyCode, editDialogOpen, invoice, toast]);

  const fetchInvoiceDetails = async () => {
    setLoading(true);
    try {
      const data = await invoicesRepo.getInvoiceDetails(invoiceId);
      setInvoice(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setPaidAmount(payment.paid_amount.toString());
    setCurrencyCode(payment.currency_code as "USD" | "LBP" | "EUR");
    setExchangeRate(payment.exchange_rate_on_payment);
    setPaymentMethod(payment.payment_method || "");
    setNotes(payment.notes || "");
    // Format payment_date for input (YYYY-MM-DD)
    const date = new Date(payment.payment_date);
    setPaymentDate(date.toISOString().split('T')[0]);
    setEditDialogOpen(true);
  };

  const handleDeletePayment = (paymentId: number) => {
    setDeletingPaymentId(paymentId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingPaymentId || !invoiceId) return;

    setLoading(true);
    try {
      await invoicesRepo.deletePayment(invoiceId, deletingPaymentId.toString());
      toast({
        title: "Success",
        description: "Payment deleted successfully. Invoice status recalculated.",
      });
      await fetchInvoiceDetails();
      setDeleteConfirmOpen(false);
      setDeletingPaymentId(null);
      onPaymentUpdated?.();
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

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingPayment || !invoiceId) return;

    if (!paidAmount || parseFloat(paidAmount) <= 0) {
      toast({
        title: "Error",
        description: "Payment amount must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (!exchangeRate || exchangeRate <= 0) {
      toast({
        title: "Error",
        description: "Exchange rate is required",
        variant: "destructive",
      });
      return;
    }

    const totalAmount = parseFloat(String(invoice?.total_amount || 0));
    const currentAmountPaid = parseFloat(String(invoice?.amount_paid || 0));
    const editingPaymentUsd = parseFloat(String(editingPayment.usd_equivalent_amount || 0));
    const remainingBalance = totalAmount - (currentAmountPaid - editingPaymentUsd);
    
    const paidAmt = parseFloat(paidAmount);
    const usdEquivalent = currencyCode === 'USD' ? paidAmt : paidAmt / parseFloat(String(exchangeRate));
    
    if (usdEquivalent > remainingBalance + 0.01) {
      toast({
        title: "Error",
        description: `Payment USD equivalent ($${usdEquivalent.toFixed(2)}) cannot exceed remaining balance of $${remainingBalance.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const exchangeRateValue = currencyCode === 'USD' ? 1.0 : parseFloat(String(exchangeRate));
      
      await invoicesRepo.updatePayment(invoiceId, editingPayment.id.toString(), {
        paid_amount: paidAmt,
        currency_code: currencyCode,
        exchange_rate_on_payment: exchangeRateValue,
        payment_method: paymentMethod || undefined,
        notes: notes || undefined,
        payment_date: paymentDate || undefined,
      });
      
      toast({
        title: "Success",
        description: "Payment updated successfully. Invoice status recalculated.",
      });
      
      setEditDialogOpen(false);
      setEditingPayment(null);
      await fetchInvoiceDetails();
      onPaymentUpdated?.();
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

  if (!open) return null;

  const remainingBalance = invoice ? Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0) : 0;

  return (
    <>
      {/* Backdrop - Only on mobile/tablet */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity lg:hidden"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Side Panel */}
      <div className="h-full bg-background border rounded-lg shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b p-3 flex items-center justify-between bg-gradient-to-r from-primary/5 to-accent/5 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold truncate">
              {loading || !invoice ? 'Loading...' : `Invoice #${invoice?.id} - Payments`}
            </h2>
            <p className="text-xs text-muted-foreground">Manage invoice payments</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 p-0 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {loading || !invoice ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              {/* Payment Summary */}
              <div className="border rounded-lg p-3 bg-secondary/10">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Total Amount</div>
                    <div className="text-sm font-bold">${Number(invoice.total_amount || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-success mb-1">Amount Paid</div>
                    <div className="text-sm font-bold text-success">${Number(invoice.amount_paid || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-warning mb-1">Remaining</div>
                    <div className="text-sm font-bold text-warning">${remainingBalance.toFixed(2)}</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    <Badge 
                      variant={invoice.payment_status === 'paid' ? 'success' : invoice.payment_status === 'partial' ? 'warning' : 'warning'}
                      className="text-xs"
                    >
                      {invoice.payment_status === 'paid' ? 'Paid' : invoice.payment_status === 'partial' ? 'Partial' : 'Pending'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Payments List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Payments ({invoice.payments?.length || 0})</h3>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  {invoice.payments && invoice.payments.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs p-2">Date</TableHead>
                          <TableHead className="text-xs p-2">Amount</TableHead>
                          <TableHead className="text-xs p-2">USD Eq.</TableHead>
                          <TableHead className="text-xs p-2">Method</TableHead>
                          <TableHead className="text-xs p-2 w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoice.payments.map((payment) => (
                          <TableRow key={payment.id} className="hover:bg-muted/20">
                            <TableCell className="text-xs p-2">
                              {formatDateTimeLebanon(payment.payment_date, "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell className="text-xs p-2">
                              <div className="font-medium">
                                {parseFloat(String(payment.paid_amount || 0)).toFixed(2)} {payment.currency_code}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                Rate: {parseFloat(String(payment.exchange_rate_on_payment || 1)).toFixed(6)}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs p-2 font-semibold text-success">
                              ${parseFloat(String(payment.usd_equivalent_amount || 0)).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-xs p-2">
                              {payment.payment_method || "-"}
                            </TableCell>
                            <TableCell className="p-2">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditPayment(payment)}
                                  className="h-7 w-7 p-0"
                                  title="Edit"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeletePayment(payment.id)}
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No payments found
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Notes */}
              {invoice.payments && invoice.payments.some(p => p.notes) && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Payment Notes</h3>
                  <div className="border rounded-lg p-3 space-y-2">
                    {invoice.payments
                      .filter(p => p.notes)
                      .map((payment) => (
                        <div key={payment.id} className="text-xs">
                          <div className="font-medium mb-1">
                            {formatDateTimeLebanon(payment.payment_date, "MMM dd, yyyy")} - ${parseFloat(String(payment.usd_equivalent_amount || 0)).toFixed(2)}
                          </div>
                          <div className="text-muted-foreground">{payment.notes}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit Payment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
            <DialogDescription>Update payment details</DialogDescription>
          </DialogHeader>

          {editingPayment && (
            <form onSubmit={handleUpdatePayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payment_date">Payment Date *</Label>
                  <Input
                    id="payment_date"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency_code">Currency *</Label>
                  <Select value={currencyCode} onValueChange={(value) => setCurrencyCode(value as "USD" | "LBP" | "EUR")}>
                    <SelectTrigger id="currency_code">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="LBP">LBP</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paid_amount">Paid Amount ({currencyCode}) *</Label>
                  <Input
                    id="paid_amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                {currencyCode !== "USD" && (
                  <div className="space-y-2">
                    <Label htmlFor="exchange_rate">Exchange Rate (1 USD = {currencyCode})</Label>
                    <Input
                      id="exchange_rate"
                      type="number"
                      step="0.000001"
                      value={exchangeRate !== null ? parseFloat(String(exchangeRate)).toFixed(6) : ""}
                      disabled
                      placeholder={fetchingRate ? "Loading..." : "Select currency"}
                      className="bg-muted"
                    />
                    {fetchingRate && (
                      <p className="text-xs text-muted-foreground">Fetching current rate...</p>
                    )}
                  </div>
                )}
              </div>

              {currencyCode !== "USD" && (
                <div className="space-y-2">
                  <Label htmlFor="usd_equivalent">USD Equivalent</Label>
                  <Input
                    id="usd_equivalent"
                    type="text"
                    value={
                      paidAmount && exchangeRate !== null
                        ? `$${(parseFloat(paidAmount) / parseFloat(String(exchangeRate))).toFixed(2)}`
                        : "$0.00"
                    }
                    disabled
                    className="bg-muted font-semibold"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="payment_method">Payment Method</Label>
                <Select value={paymentMethod || "none"} onValueChange={(value) => setPaymentMethod(value === "none" ? "" : value)}>
                  <SelectTrigger id="payment_method">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Credit Card">Credit Card</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Check">Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this payment..."
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !exchangeRate || exchangeRate <= 0 || fetchingRate}>
                  {loading ? "Updating..." : "Update Payment"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payment? This action cannot be undone. 
              The invoice status will be automatically recalculated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={loading}>
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

