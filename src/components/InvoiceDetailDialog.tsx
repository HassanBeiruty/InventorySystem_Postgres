import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { invoicesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { Printer } from "lucide-react";

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
  due_date?: string | null;
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

  const handlePrint = () => {
    if (!invoice) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const entityName = invoice.customers?.name || invoice.suppliers?.name || "N/A";
    const entityPhone = invoice.customers?.phone || invoice.suppliers?.phone || "N/A";
    const entityAddress = invoice.customers?.address || invoice.suppliers?.address || "N/A";
    const remainingBalance = invoice.total_amount - invoice.amount_paid;

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice #${invoice.id}</title>
          <style>
            @media print {
              @page { margin: 1cm; }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #000;
              padding-bottom: 20px;
            }
            .invoice-info {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin-bottom: 30px;
            }
            .entity-details {
              border: 1px solid #ddd;
              padding: 15px;
              margin-bottom: 30px;
            }
            .entity-details h3 {
              margin-top: 0;
              border-bottom: 1px solid #ddd;
              padding-bottom: 10px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 10px;
              text-align: left;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            .summary {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 20px;
              border: 1px solid #ddd;
              padding: 20px;
              margin-top: 30px;
            }
            .summary-item {
              text-align: center;
            }
            .summary-label {
              font-size: 12px;
              color: #666;
              margin-bottom: 5px;
            }
            .summary-value {
              font-size: 24px;
              font-weight: bold;
            }
            .badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: bold;
            }
            .badge-sell { background-color: #4CAF50; color: white; }
            .badge-buy { background-color: #2196F3; color: white; }
            .badge-paid { background-color: #4CAF50; color: white; }
            .badge-partial { background-color: #FF9800; color: white; }
            .badge-pending { background-color: #f44336; color: white; }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Invoice System</h1>
            <h2>Invoice #${invoice.id}</h2>
          </div>
          
          <div class="invoice-info">
            <div>
              <strong>Date:</strong> ${formatDateTimeLebanon(invoice.invoice_date, "MMM dd, yyyy")}<br>
              <strong>Type:</strong> <span class="badge badge-${invoice.invoice_type}">${invoice.invoice_type.toUpperCase()}</span>
            </div>
            <div>
              <strong>Status:</strong> <span class="badge badge-${invoice.payment_status}">${invoice.payment_status === 'paid' ? 'Paid' : invoice.payment_status === 'partial' ? 'Partial' : 'Pending'}</span>
            </div>
          </div>

          <div class="entity-details">
            <h3>${invoice.invoice_type === 'sell' ? 'Customer' : 'Supplier'} Details</h3>
            <strong>Name:</strong> ${entityName}<br>
            <strong>Phone:</strong> ${entityPhone}<br>
            <strong>Address:</strong> ${entityAddress}
          </div>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Price Type</th>
                <th style="text-align: right;">Total Price</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.invoice_items.map((item: InvoiceItem) => `
                <tr>
                  <td>#${item.product_id} ${item.product_name || 'Product'}</td>
                  <td>${item.quantity}</td>
                  <td>$${item.unit_price.toFixed(2)}</td>
                  <td>${item.price_type}</td>
                  <td style="text-align: right;">$${item.total_price.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-item">
              <div class="summary-label">Total Amount</div>
              <div class="summary-value">$${invoice.total_amount.toFixed(2)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Amount Paid</div>
              <div class="summary-value" style="color: #4CAF50;">$${invoice.amount_paid.toFixed(2)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Remaining Balance</div>
              <div class="summary-value" style="color: #FF9800;">$${remainingBalance.toFixed(2)}</div>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>
                {loading || !invoice ? `Loading Invoice...` : `Invoice #${invoice.id}`}
              </DialogTitle>
              <DialogDescription>View complete invoice details and items</DialogDescription>
            </div>
            {!loading && invoice && (
              <Button onClick={handlePrint} variant="outline" size="sm">
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            )}
          </div>
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
                      <span className="text-muted-foreground">Due Date:</span>
                      {invoice.due_date ? (
                        <span className={`ml-2 font-medium ${
                          new Date(invoice.due_date) < new Date() && invoice.payment_status !== 'paid' 
                            ? 'text-red-600 font-semibold' 
                            : ''
                        }`}>
                          {formatDateTimeLebanon(invoice.due_date, "MMM dd, yyyy")}
                          {new Date(invoice.due_date) < new Date() && invoice.payment_status !== 'paid' && (
                            <Badge variant="destructive" className="ml-2">Overdue</Badge>
                          )}
                        </span>
                      ) : (
                        <span className="ml-2 text-muted-foreground italic">No due date</span>
                      )}
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

