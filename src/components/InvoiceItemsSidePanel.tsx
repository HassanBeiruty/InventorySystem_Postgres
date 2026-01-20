import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { invoicesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { formatDateTimeLebanon } from "@/utils/dateUtils";
import { Printer, X, Download } from "lucide-react";
import ProductNameWithCode from "@/components/ProductNameWithCode";

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
  product_sku?: string;
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

interface InvoiceItemsSidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
}

export default function InvoiceItemsSidePanel({ open, onOpenChange, invoiceId }: InvoiceItemsSidePanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);

  useEffect(() => {
    if (open && invoiceId) {
      fetchInvoiceDetails();
    } else if (!open) {
      // Reset state when panel closes
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

  // Helper to get theme color as hex for print
  const getThemeColorHex = (varName: string): string => {
    if (typeof window === "undefined") return "#000000";
    const root = document.documentElement;
    const hsl = getComputedStyle(root).getPropertyValue(varName).trim();
    if (!hsl) return "#000000";
    
    const match = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
    if (!match) return "#000000";
    
    const h = parseFloat(match[1]) / 360;
    const s = parseFloat(match[2]) / 100;
    const l = parseFloat(match[3]) / 100;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = l - c / 2;
    
    let r = 0, g = 0, b = 0;
    if (h < 1/6) { r = c; g = x; b = 0; }
    else if (h < 2/6) { r = x; g = c; b = 0; }
    else if (h < 3/6) { r = 0; g = c; b = x; }
    else if (h < 4/6) { r = 0; g = x; b = c; }
    else if (h < 5/6) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  const handlePrint = () => {
    if (!invoice) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const entityName = invoice.customers?.name || invoice.suppliers?.name || "N/A";
    const entityPhone = invoice.customers?.phone || invoice.suppliers?.phone || "N/A";
    const entityAddress = invoice.customers?.address || invoice.suppliers?.address || "N/A";
    const remainingBalance = Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0);
    
    // Get theme colors for print
    const successColor = getThemeColorHex('--success');
    const warningColor = getThemeColorHex('--warning');
    const destructiveColor = getThemeColorHex('--destructive');
    const primaryColor = getThemeColorHex('--primary');
    const secondaryColor = getThemeColorHex('--secondary');

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
            .badge-sell { background-color: ${primaryColor}; color: white; }
            .badge-buy { background-color: ${successColor}; color: white; }
            .badge-paid { background-color: ${successColor}; color: white; }
            .badge-partial { background-color: ${warningColor}; color: white; }
            .badge-pending { background-color: ${warningColor}; color: white; }
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
                <th>SKU/Barcode</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th style="text-align: right;">Total Price</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.invoice_items.map((item: InvoiceItem) => {
                // Use private_price_amount if it's a private price, otherwise use unit_price
                const displayUnitPrice = item.is_private_price && item.private_price_amount 
                  ? item.private_price_amount 
                  : item.unit_price || 0;
                return `
                <tr>
                  <td>#${item.product_id} ${item.product_name || 'Product'}${item.product_barcode || item.product_sku ? ` - ${item.product_barcode || item.product_sku}` : ''}</td>
                  <td>${item.product_sku || item.product_barcode || 'N/A'}</td>
                  <td>${item.quantity}</td>
                  <td>$${Number(displayUnitPrice).toFixed(2)}</td>
                  <td style="text-align: right;">$${Number(item.total_price || 0).toFixed(2)}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-item">
              <div class="summary-label">Total Amount</div>
              <div class="summary-value">$${Number(invoice.total_amount || 0).toFixed(2)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Amount Paid</div>
              <div class="summary-value" style="color: ${successColor};">$${Number(invoice.amount_paid || 0).toFixed(2)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Remaining Balance</div>
              <div class="summary-value" style="color: ${warningColor};">$${Number(remainingBalance || 0).toFixed(2)}</div>
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

  const handleExportPDF = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!invoice) return;

    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const entityName = invoice.customers?.name || invoice.suppliers?.name || "N/A";
      const entityPhone = invoice.customers?.phone || invoice.suppliers?.phone || "N/A";
      const entityAddress = invoice.customers?.address || invoice.suppliers?.address || "N/A";
      const remainingBalance = Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0);
      
      // Get theme colors for PDF
      const successColor = getThemeColorHex('--success');
      const warningColor = getThemeColorHex('--warning');
      const destructiveColor = getThemeColorHex('--destructive');
      const primaryColor = getThemeColorHex('--primary');
      const secondaryColor = getThemeColorHex('--secondary');

      // Create new PDF document
      const doc = new jsPDF();
    
      // Header
      doc.setFontSize(20);
      doc.setTextColor(0, 0, 0);
      doc.text("Invoice System", 105, 20, { align: "center" });
      
      doc.setFontSize(16);
      doc.text(`Invoice #${invoice.id}`, 105, 30, { align: "center" });
      
      // Invoice Info
      doc.setFontSize(10);
      doc.text(`Date: ${formatDateTimeLebanon(invoice.invoice_date, "MMM dd, yyyy")}`, 14, 45);
      doc.text(`Type: ${invoice.invoice_type.toUpperCase()}`, 14, 52);
      doc.text(`Status: ${invoice.payment_status === 'paid' ? 'Paid' : invoice.payment_status === 'partial' ? 'Partial' : 'Pending'}`, 105, 45);
      
      // Entity Details
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text(`${invoice.invoice_type === 'sell' ? 'Customer' : 'Supplier'} Details`, 14, 65);
      doc.setFont(undefined, "normal");
      doc.setFontSize(10);
      doc.text(`Name: ${entityName}`, 14, 72);
      doc.text(`Phone: ${entityPhone}`, 14, 79);
      doc.text(`Address: ${entityAddress}`, 14, 86);
      
      // Table data
      const tableData = invoice.invoice_items.map((item: InvoiceItem) => {
        // Use private_price_amount if it's a private price, otherwise use unit_price
        const displayUnitPrice = item.is_private_price && item.private_price_amount 
          ? item.private_price_amount 
          : item.unit_price || 0;
        return [
          `#${item.product_id} ${item.product_name || 'Product'}${item.product_barcode || item.product_sku ? ` - ${item.product_barcode || item.product_sku}` : ''}`,
          item.product_sku || item.product_barcode || 'N/A',
          item.quantity.toString(),
          `$${Number(displayUnitPrice).toFixed(2)}`,
          `$${Number(item.total_price || 0).toFixed(2)}`
        ];
      });
      
      // Add table
      autoTable(doc, {
        startY: 95,
        head: [['Product', 'SKU/Barcode', 'Quantity', 'Unit Price', 'Total Price']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: {
          4: { halign: 'right' }
        }
      });
      
      // Summary section
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("Summary", 14, finalY);
      
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      
      // Total Amount
      doc.text("Total Amount:", 14, finalY + 10);
      doc.setFont(undefined, "bold");
      doc.text(`$${Number(invoice.total_amount || 0).toFixed(2)}`, 60, finalY + 10);
      
      // Amount Paid
      doc.setFont(undefined, "normal");
      doc.text("Amount Paid:", 105, finalY + 10);
      const successRgb = successColor.startsWith('#') 
        ? [parseInt(successColor.substring(1, 3), 16), parseInt(successColor.substring(3, 5), 16), parseInt(successColor.substring(5, 7), 16)]
        : [34, 197, 94]; // Default green
      doc.setTextColor(successRgb[0], successRgb[1], successRgb[2]);
      doc.setFont(undefined, "bold");
      doc.text(`$${Number(invoice.amount_paid || 0).toFixed(2)}`, 150, finalY + 10);
      
      // Remaining Balance
      const warningRgb = warningColor.startsWith('#')
        ? [parseInt(warningColor.substring(1, 3), 16), parseInt(warningColor.substring(3, 5), 16), parseInt(warningColor.substring(5, 7), 16)]
        : [234, 179, 8]; // Default yellow
      doc.setTextColor(warningRgb[0], warningRgb[1], warningRgb[2]);
      doc.setFont(undefined, "normal");
      doc.text("Remaining Balance:", 14, finalY + 20);
      doc.setFont(undefined, "bold");
      doc.text(`$${Number(remainingBalance || 0).toFixed(2)}`, 60, finalY + 20);
      
      // Generate filename: invoicenumber_date
      const invoiceDate = new Date(invoice.invoice_date);
      const dateStr = invoiceDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      const filename = `${invoice.id}_${dateStr}.pdf`;
      
      // Save PDF directly (this downloads the file, no print dialog)
      doc.save(filename);
      
      toast({
        title: "Success",
        description: `Invoice PDF downloaded as ${filename}`,
      });
    } catch (error: any) {
      console.error("PDF export error:", error);
      toast({
        title: "Error",
        description: "Failed to generate PDF",
        variant: "destructive",
      });
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
              {loading || !invoice ? 'Loading...' : `Invoice #${invoice.id}`}
            </h2>
            <p className="text-xs text-muted-foreground">Invoice details</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!loading && invoice && (
              <>
                <Button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleExportPDF(e);
                  }}
                  type="button"
                  variant="outline" 
                  size="sm" 
                  className="h-8"
                  title="Export PDF"
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePrint();
                  }}
                  type="button"
                  variant="outline" 
                  size="sm" 
                  className="h-8"
                  title="Print"
                >
                  <Printer className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {loading || !invoice ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <>
              {/* Invoice Summary */}
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
              </div>

              {/* Invoice Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <span className="ml-2 font-medium">{formatDateTimeLebanon(invoice.invoice_date, "MMM dd, yyyy")}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <Badge variant={invoice.invoice_type === 'sell' ? 'default' : 'success'} className="ml-2">
                    {invoice.invoice_type.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <Badge 
                    variant={invoice.payment_status === 'paid' ? 'success' : invoice.payment_status === 'partial' ? 'warning' : 'warning'}
                    className="ml-2"
                  >
                    {invoice.payment_status === 'paid' ? 'Paid' : invoice.payment_status === 'partial' ? 'Partial' : 'Pending'}
                  </Badge>
                </div>
                {invoice.due_date && (
                  <div>
                    <span className="text-muted-foreground">Due Date:</span>
                    <span className={`ml-2 font-medium ${
                      new Date(invoice.due_date) < new Date() && invoice.payment_status !== 'paid' 
                        ? 'text-destructive' 
                        : ''
                    }`}>
                      {formatDateTimeLebanon(invoice.due_date, "MMM dd, yyyy")}
                    </span>
                  </div>
                )}
              </div>

              {/* Entity Info */}
              <div className="border rounded-lg p-3">
                <h3 className="font-semibold text-sm mb-2">
                  {invoice.invoice_type === 'sell' ? 'Customer' : 'Supplier'}
                </h3>
                <div className="text-sm">
                  <div className="font-medium">{invoice.customers?.name || invoice.suppliers?.name || "N/A"}</div>
                  <div className="text-muted-foreground text-xs mt-1">
                    {invoice.customers?.phone || invoice.suppliers?.phone || "N/A"}
                  </div>
                </div>
              </div>

              {/* Invoice Items */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Items ({invoice.invoice_items?.length || 0})</h3>
                <div className="border rounded-lg overflow-hidden">
                  {invoice.invoice_items && invoice.invoice_items.length > 0 ? (
                    <div className="divide-y">
                      {invoice.invoice_items.map((item) => (
                        <div key={item.id} className="p-2 hover:bg-muted/30 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <ProductNameWithCode 
                                product={item}
                                showId={true}
                                product_id={item.product_id}
                                nameClassName="font-medium text-xs"
                                codeClassName="text-[10px] text-muted-foreground font-mono ml-1.5"
                              />
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-xs text-muted-foreground mb-1">
                                {(() => {
                                  // Use private_price_amount if it's a private price, otherwise use unit_price
                                  const displayUnitPrice = item.is_private_price && item.private_price_amount 
                                    ? item.private_price_amount 
                                    : item.unit_price || 0;
                                  return `${item.quantity} × $${Number(displayUnitPrice).toFixed(2)}`;
                                })()}
                              </div>
                              <div className="font-bold text-xs text-primary">
                                ${Number(item.total_price || 0).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No items found
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

