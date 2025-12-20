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
import { invoicesRepo, exchangeRatesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { formatDateTimeLebanon } from "@/utils/dateUtils";

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
  const [paidAmount, setPaidAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState<"USD" | "LBP" | "EUR">("USD");
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && invoiceId) {
      fetchInvoiceDetails();
    } else if (!open) {
      // Reset state when dialog closes
      setInvoice(null);
      setPaidAmount("");
      setCurrencyCode("USD");
      setExchangeRate(null);
      setPaymentMethod("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  // Fetch exchange rate when currency changes and auto-fill paid amount
  useEffect(() => {
    if (!open || !currencyCode || !invoice) return;
    
    // USD always has rate 1.0, no need to fetch
    if (currencyCode === 'USD') {
      setExchangeRate(1.0);
      setFetchingRate(false);
      // Auto-fill paid amount with remaining balance in USD
      const totalAmount = parseFloat(String(invoice.total_amount || 0));
      const amountPaid = parseFloat(String(invoice.amount_paid || 0));
      const remainingBalance = totalAmount - amountPaid;
      if (remainingBalance > 0) {
        setPaidAmount(remainingBalance.toFixed(2));
      }
      return;
    }
    
    const fetchExchangeRate = async () => {
      setFetchingRate(true);
      try {
        const rateData = await exchangeRatesRepo.getCurrentRate(currencyCode);
        const rate = parseFloat(String(rateData.rate_to_usd));
        setExchangeRate(rate);
        
        // Auto-fill paid amount with remaining balance converted to selected currency
        // Remaining balance is in USD, so convert: remainingBalance * exchangeRate
        const totalAmount = parseFloat(String(invoice.total_amount || 0));
        const amountPaid = parseFloat(String(invoice.amount_paid || 0));
        const remainingBalance = totalAmount - amountPaid;
        if (remainingBalance > 0 && rate > 0) {
          const remainingInCurrency = remainingBalance * rate;
          setPaidAmount(remainingInCurrency.toFixed(2));
        }
      } catch (error: any) {
        console.error('Error fetching exchange rate:', error);
        toast({
          title: "Error",
          description: `Failed to fetch exchange rate for ${currencyCode}. Please ensure an exchange rate is configured.`,
          variant: "destructive",
        });
        setExchangeRate(null);
      } finally {
        setFetchingRate(false);
      }
    };

    fetchExchangeRate();
  }, [currencyCode, open, invoice, toast]);

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
        description: "Exchange rate is required. Please wait for it to load or select a different currency.",
        variant: "destructive",
      });
      return;
    }

    const totalAmount = parseFloat(String(invoice?.total_amount || 0));
    const amountPaid = parseFloat(String(invoice?.amount_paid || 0));
    const remainingBalance = totalAmount - amountPaid;
    
    // Calculate USD equivalent
    // Exchange rate is stored as "1 USD = X currency", so USD equivalent = paid_amount / exchange_rate
    const paidAmt = parseFloat(paidAmount);
    const usdEquivalent = currencyCode === 'USD' ? paidAmt : paidAmt / parseFloat(String(exchangeRate));
    
    // Use epsilon for floating point comparison
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
      // Ensure exchange rate is a number
      const exchangeRateValue = currencyCode === 'USD' ? 1.0 : parseFloat(String(exchangeRate));
      
      await invoicesRepo.recordPayment(invoiceId, {
        paid_amount: paidAmt,
        currency_code: currencyCode,
        exchange_rate_on_payment: exchangeRateValue,
        payment_method: paymentMethod || undefined,
        notes: notes || undefined,
      });
      
      toast({
        title: "Success",
        description: "Payment recorded successfully",
      });
      
      // Reset form and refresh invoice details
      setPaidAmount("");
      setCurrencyCode("USD");
      setExchangeRate(null);
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
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Payment</DialogTitle>
          <DialogDescription>Record payment for this invoice</DialogDescription>
        </DialogHeader>

        {loading || !invoice ? (
          <div className="space-y-3">
            {/* Loading Skeletons */}
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-32" />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Skeleton className="h-5" />
                <Skeleton className="h-5" />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </div>

            <div className="space-y-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>

            <div className="flex justify-end gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        ) : (
          <>
            {(() => {
              const totalAmount = parseFloat(String(invoice.total_amount || 0));
              const amountPaid = parseFloat(String(invoice.amount_paid || 0));
              const remainingBalance = totalAmount - amountPaid;
              const entityName = invoice.customers?.name || invoice.suppliers?.name || "N/A";
              
              return (
                <div className="space-y-3">
                  {/* Invoice Details */}
                  <div className="space-y-1.5">
                    <h3 className="font-semibold text-sm">Invoice Details</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Entity:</span>
                        <span className="ml-1.5 font-medium">{entityName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <span className="ml-1.5 font-medium capitalize">{invoice.invoice_type}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="border rounded-lg p-2">
                        <div className="text-[10px] text-muted-foreground">Total Amount</div>
                        <div className="text-base font-bold">${totalAmount.toFixed(2)}</div>
                      </div>
                      <div className="border rounded-lg p-2">
                        <div className="text-[10px] text-success">Total Paid</div>
                        <div className="text-base font-bold text-success">${amountPaid.toFixed(2)}</div>
                      </div>
                      <div className="border rounded-lg p-2">
                        <div className="text-[10px] text-warning">Remaining</div>
                        <div className="text-base font-bold text-warning">${remainingBalance.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Payment History */}
                  {invoice.payments && invoice.payments.length > 0 && (
                    <div className="space-y-1.5">
                      <h3 className="font-semibold text-sm">Payment History</h3>
                      <div className="border rounded-lg overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="whitespace-nowrap p-1.5 text-xs">Date</TableHead>
                              <TableHead className="whitespace-nowrap p-1.5 text-xs">Paid Amount</TableHead>
                              <TableHead className="whitespace-nowrap p-1.5 text-xs">Currency</TableHead>
                              <TableHead className="whitespace-nowrap p-1.5 text-xs">Rate</TableHead>
                              <TableHead className="whitespace-nowrap p-1.5 text-xs">USD Equivalent</TableHead>
                              <TableHead className="whitespace-nowrap p-1.5 text-xs">Method</TableHead>
                              <TableHead className="whitespace-nowrap p-1.5 text-xs">Notes</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoice.payments.map((payment) => (
                              <TableRow key={payment.id}>
                                <TableCell className="text-xs whitespace-nowrap p-1.5">
                                  {formatDateTimeLebanon(payment.payment_date, "MM/dd/yyyy")}
                                </TableCell>
                                <TableCell className="font-medium whitespace-nowrap p-1.5 text-xs">
                                  {parseFloat(String(payment.paid_amount || 0)).toFixed(2)}
                                </TableCell>
                                <TableCell className="whitespace-nowrap p-1.5 text-xs">{payment.currency_code || "USD"}</TableCell>
                                <TableCell className="text-xs whitespace-nowrap p-1.5">
                                  {parseFloat(String(payment.exchange_rate_on_payment || 1)).toFixed(6)}
                                </TableCell>
                                <TableCell className="font-medium text-success whitespace-nowrap p-1.5 text-xs">
                                  ${parseFloat(String(payment.usd_equivalent_amount || 0)).toFixed(2)}
                                </TableCell>
                                <TableCell className="whitespace-nowrap p-1.5 text-xs">{payment.payment_method || "-"}</TableCell>
                                <TableCell className="text-xs text-muted-foreground max-w-xs truncate p-1.5">{payment.notes || "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* New Payment Form */}
                  <form onSubmit={handleSubmit} className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="currency_code" className="text-xs">Currency *</Label>
                        <Select value={currencyCode} onValueChange={(value) => setCurrencyCode(value as "USD" | "LBP" | "EUR")}>
                          <SelectTrigger id="currency_code" className="h-8 text-sm">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                          <SelectContent side="bottom" align="start">
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="LBP">LBP</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="paid_amount" className="text-xs">Paid Amount ({currencyCode}) *</Label>
                        <Input
                          id="paid_amount"
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={paidAmount}
                          onChange={(e) => setPaidAmount(e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-sm"
                          required
                        />
                      </div>
                    </div>

                    {currencyCode !== "USD" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="exchange_rate" className="text-xs">Exchange Rate (1 USD = {currencyCode})</Label>
                          <Input
                            id="exchange_rate"
                            type="number"
                            step="0.000001"
                            value={exchangeRate !== null ? parseFloat(String(exchangeRate)).toFixed(6) : ""}
                            disabled
                            placeholder={fetchingRate ? "Loading..." : "Select currency"}
                            className="bg-muted h-8 text-sm"
                          />
                          {fetchingRate && (
                            <p className="text-[10px] text-muted-foreground">Fetching current rate...</p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="usd_equivalent" className="text-xs">USD Equivalent</Label>
                          <Input
                            id="usd_equivalent"
                            type="text"
                            value={
                              paidAmount && exchangeRate !== null
                                ? `$${(parseFloat(paidAmount) / parseFloat(String(exchangeRate))).toFixed(2)}`
                                : "$0.00"
                            }
                            disabled
                            className="bg-muted font-semibold h-8 text-sm"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label htmlFor="payment_method" className="text-xs">Payment Method</Label>
                      <Select value={paymentMethod || "none"} onValueChange={(value) => setPaymentMethod(value === "none" ? "" : value)}>
                        <SelectTrigger id="payment_method" className="h-8 text-sm">
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                        <SelectContent side="bottom" align="start">
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Credit Card">Credit Card</SelectItem>
                          <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                          <SelectItem value="Check">Check</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="notes" className="text-xs">Notes</Label>
                      <Input
                        id="notes"
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any notes about this payment..."
                        className="h-8 text-sm"
                      />
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={loading || remainingBalance <= 0 || !exchangeRate || exchangeRate <= 0 || fetchingRate}>
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

