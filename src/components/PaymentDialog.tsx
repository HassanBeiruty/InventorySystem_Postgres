import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { invoicesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Payment {
  id: number;
  payment_amount: number;
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
  customers?: { name: string };
  suppliers?: { name: string };
  payments: Payment[];
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onPaymentRecorded: () => void;
}

export default function PaymentDialog({ open, onOpenChange, invoiceId, onPaymentRecorded }: PaymentDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && invoiceId) {
      fetchInvoiceDetails();
    } else if (!open) {
      // Reset state when dialog closes
      setInvoice(null);
      setPaymentAmount("");
      setPaymentMethod("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast({
        title: "Error",
        description: "Payment amount must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    const remainingBalance = (invoice?.total_amount || 0) - (invoice?.amount_paid || 0);
    // Use epsilon for floating point comparison
    if (parseFloat(paymentAmount) > remainingBalance + 0.01) {
      toast({
        title: "Error",
        description: `Payment amount cannot exceed remaining balance of $${remainingBalance.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await invoicesRepo.recordPayment(invoiceId, {
        payment_amount: parseFloat(paymentAmount),
        payment_method: paymentMethod || undefined,
        notes: notes || undefined,
      });
      
      toast({
        title: "Success",
        description: "Payment recorded successfully",
      });
      
      // Reset form and refresh invoice details
      setPaymentAmount("");
      setPaymentMethod("");
      setNotes("");
      await fetchInvoiceDetails();
      onPaymentRecorded();
      
      // Close the dialog
      onOpenChange(false);
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


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Payment</DialogTitle>
          <DialogDescription>Record payment for this invoice</DialogDescription>
        </DialogHeader>

        {loading || !invoice ? (
          <div className="space-y-6">
            {/* Loading Skeletons */}
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Skeleton className="h-6" />
                <Skeleton className="h-6" />
              </div>
              <div className="grid grid-cols-3 gap-4 pt-2">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            </div>

            <div className="space-y-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>

            <div className="flex justify-end gap-2">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
        ) : (
          <>
            {(() => {
              const remainingBalance = invoice.total_amount - invoice.amount_paid;
              const entityName = invoice.customers?.name || invoice.suppliers?.name || "N/A";
              
              return (
                <div className="space-y-6">
                  {/* Invoice Details */}
                  <div className="space-y-2">
                    <h3 className="font-semibold">Invoice Details</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Entity:</span>
                        <span className="ml-2 font-medium">{entityName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <span className="ml-2 font-medium capitalize">{invoice.invoice_type}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-2">
                      <div className="border rounded-lg p-3">
                        <div className="text-xs text-muted-foreground">Total Amount</div>
                        <div className="text-lg font-bold">${invoice.total_amount.toFixed(2)}</div>
                      </div>
                      <div className="border rounded-lg p-3">
                        <div className="text-xs text-green-600">Total Paid</div>
                        <div className="text-lg font-bold text-green-600">${invoice.amount_paid.toFixed(2)}</div>
                      </div>
                      <div className="border rounded-lg p-3">
                        <div className="text-xs text-orange-600">Remaining</div>
                        <div className="text-lg font-bold text-orange-600">${remainingBalance.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Payment History */}
                  {invoice.payments && invoice.payments.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold">Payment History</h3>
                      <div className="border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Method</TableHead>
                              <TableHead>Notes</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoice.payments.map((payment) => (
                              <TableRow key={payment.id}>
                                <TableCell className="text-sm">
                                  {format(new Date(payment.payment_date), "MM/dd/yyyy")}
                                </TableCell>
                                <TableCell className="font-medium">${payment.payment_amount.toFixed(2)}</TableCell>
                                <TableCell>{payment.payment_method || "-"}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{payment.notes || "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* New Payment Form */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="payment_amount">Payment Amount *</Label>
                      <Input
                        id="payment_amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        required
                      />
                    </div>

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
                      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={loading || remainingBalance <= 0}>
                        {loading ? "Recording..." : "Record Payment"}
                      </Button>
                    </DialogFooter>
                  </form>
                </div>
              );
            })()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

