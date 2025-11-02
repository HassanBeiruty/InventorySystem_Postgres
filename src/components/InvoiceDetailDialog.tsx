import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { invoicesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { formatDateTimeLebanon } from "@/utils/dateUtils";

interface InvoiceItem {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  price_type: string;
  is_private_price: boolean;
  private_price_amount: number | null;
  private_price_note: string | null;
  product_name?: string;
  product_barcode?: string;
}

interface InvoiceDetails {
  id: number;
  invoice_type: string;
  total_amount: number;
  amount_paid: number;
  payment_status: string;
  invoice_date: string;
  customers?: { name: string; phone: string; address: string };
  suppliers?: { name: string; phone: string; address: string };
  invoice_items: InvoiceItem[];
}

interface InvoiceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
}

export default function InvoiceDetailDialog({ open, onOpenChange, invoiceId }: InvoiceDetailDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);

  useEffect(() => {
    if (open && invoiceId) {
      fetchInvoiceDetails();
    } else if (!open) {
      // Reset state when dialog closes
      setInvoice(null);
    }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {loading || !invoice ? `Loading Invoice...` : `Invoice #${invoice.id}`}
          </DialogTitle>
          <DialogDescription>View complete invoice details and items</DialogDescription>
        </DialogHeader>

        {loading || !invoice ? (
          <div className="space-y-6">
            {/* Loading Skeletons */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Skeleton className="h-6 w-32" />
              </div>
              <div>
                <Skeleton className="h-6 w-32" />
              </div>
              <div>
                <Skeleton className="h-6 w-32" />
              </div>
              <div>
                <Skeleton className="h-6 w-32" />
              </div>
            </div>
            
            <div className="border rounded-lg p-4">
              <Skeleton className="h-6 w-40 mb-3" />
              <div className="grid grid-cols-3 gap-4 text-sm">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            </div>

            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <div className="border rounded-lg p-4">
                <Skeleton className="h-32" />
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-secondary/10">
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </div>
          </div>
        ) : (
          <>
            {(() => {
              const remainingBalance = invoice.total_amount - invoice.amount_paid;
              const entityName = invoice.customers?.name || invoice.suppliers?.name || "N/A";
              const entityPhone = invoice.customers?.phone || invoice.suppliers?.phone || "N/A";
              const entityAddress = invoice.customers?.address || invoice.suppliers?.address || "N/A";
              
              return (
                <div className="space-y-6">
                  {/* Invoice Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Invoice Number:</span>
                      <span className="ml-2 font-bold text-lg">#{invoice.id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date:</span>
                      <span className="ml-2 font-medium">{formatDateTimeLebanon(invoice.invoice_date, "MMM dd, yyyy")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Type:</span>
                      <Badge variant={invoice.invoice_type === 'sell' ? 'default' : 'secondary'} className="ml-2">
                        {invoice.invoice_type.toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <Badge 
                        variant={invoice.payment_status === 'paid' ? 'default' : invoice.payment_status === 'partial' ? 'secondary' : 'outline'}
                        className="ml-2"
                      >
                        {invoice.payment_status === 'paid' ? 'Paid' : invoice.payment_status === 'partial' ? 'Partial' : 'Pending'}
                      </Badge>
                    </div>
                  </div>

                  {/* Entity Details */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-3">
                      {invoice.invoice_type === 'sell' ? 'Customer' : 'Supplier'} Details
                    </h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Name</div>
                        <div className="font-medium">{entityName}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Phone</div>
                        <div className="font-medium">{entityPhone}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Address</div>
                        <div className="font-medium">{entityAddress}</div>
                      </div>
                    </div>
                  </div>

                  {/* Invoice Items */}
                  <div className="space-y-2">
                    <h3 className="font-semibold">Invoice Items</h3>
                    <div className="border rounded-lg">
                      {invoice.invoice_items && invoice.invoice_items.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="font-bold">Product</TableHead>
                              <TableHead className="font-bold">Quantity</TableHead>
                              <TableHead className="font-bold">Unit Price</TableHead>
                              <TableHead className="font-bold">Price Type</TableHead>
                              <TableHead className="font-bold text-right">Total Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoice.invoice_items.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>
                                  <div className="font-medium"><span className="text-muted-foreground text-sm">#{item.product_id}</span> {item.product_name || `Product`}</div>
                                  {item.product_barcode && (
                                    <div className="text-xs text-muted-foreground">Barcode: {item.product_barcode}</div>
                                  )}
                                </TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>${item.unit_price.toFixed(2)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="capitalize">
                                    {item.price_type}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-bold">${item.total_price.toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground">
                          No items found in this invoice
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="border rounded-lg p-4 bg-secondary/10">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Total Amount</div>
                        <div className="text-2xl font-bold">${invoice.total_amount.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-green-600">Amount Paid</div>
                        <div className="text-2xl font-bold text-green-600">${invoice.amount_paid.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-orange-600">Remaining Balance</div>
                        <div className="text-2xl font-bold text-orange-600">${remainingBalance.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

