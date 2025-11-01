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
import { Filter, X, FileText, TrendingUp, TrendingDown, DollarSign, Plus, CreditCard, Eye, Pencil } from "lucide-react";
import { format } from "date-fns";
import { invoicesRepo, productsRepo, customersRepo, suppliersRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";

const InvoicesList = () => {
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

    // Search filter (entity name or amount)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(inv => {
        const entityName = inv.customers?.name || inv.suppliers?.name || "";
        const amount = inv.total_amount?.toString() || "";
        return entityName.toLowerCase().includes(searchLower) || amount.includes(searchLower);
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
              Invoices
            </h1>
            <p className="text-muted-foreground">Manage your sales and purchase invoices</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigate("/invoices/new/sell")}
              className="gap-2 gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              New Sell Invoice
            </Button>
            <Button
              onClick={() => navigate("/invoices/new/buy")}
              variant="outline"
              className="gap-2 hover:scale-105 transition-all duration-300"
            >
              <Plus className="w-4 h-4" />
              New Buy Invoice
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="border-2 rounded-lg p-4 bg-muted/20">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Search</Label>
                <Input
                  placeholder="Entity name or amount..."
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label>Invoice Type</Label>
                <Select value={filters.type} onValueChange={(value) => setFilters({...filters, type: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="buy">Buy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select value={filters.payment_status} onValueChange={(value) => setFilters({...filters, payment_status: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="partial">Partially Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={filters.product_id} onValueChange={(value) => setFilters({...filters, product_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <span className="text-muted-foreground text-xs">#{product.id}</span> {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={filters.customer_id} onValueChange={(value) => setFilters({...filters, customer_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All customers</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={filters.supplier_id} onValueChange={(value) => setFilters({...filters, supplier_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="All suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All suppliers</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
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
              <div className="flex justify-end mt-4">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-2" />
                  Clear All Filters
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
              <span className="text-xs font-medium text-muted-foreground">Total</span>
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-accent" />
              <span className="text-xs font-medium text-muted-foreground">Total</span>
            </div>
            <div className="text-lg font-bold">${stats.totalAmount.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-muted-foreground">Paid</span>
            </div>
            <div className="text-lg font-bold text-green-600">${stats.totalPaid.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-medium text-muted-foreground">Outstanding</span>
            </div>
            <div className="text-lg font-bold text-orange-600">${stats.totalOutstanding.toFixed(2)}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-success" />
              <span className="text-xs font-medium text-muted-foreground">Sell</span>
            </div>
            <div className="text-2xl font-bold text-success">{stats.sell}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-destructive" />
              <span className="text-xs font-medium text-muted-foreground">Buy</span>
            </div>
            <div className="text-2xl font-bold text-destructive">{stats.buy}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">Paid</span>
            </div>
            <div className="text-2xl font-bold text-success">{stats.paid}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">Pending</span>
            </div>
            <div className="text-2xl font-bold text-warning">{stats.pending + stats.partial}</div>
          </div>
        </div>

        {/* Table */}
        <div className="border-2 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5">
                <TableHead className="font-bold">Invoice#</TableHead>
                <TableHead className="font-bold">Date</TableHead>
                <TableHead className="font-bold">Type</TableHead>
                <TableHead className="font-bold">Entity</TableHead>
                <TableHead className="font-bold">Items</TableHead>
                <TableHead className="text-right font-bold">Amount</TableHead>
                <TableHead className="text-center font-bold">Status</TableHead>
                <TableHead className="text-center font-bold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array(10).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
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
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    {hasActiveFilters ? "No invoices match your filters" : "No invoices found"}
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
                      {format(new Date(invoice.invoice_date), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={invoice.invoice_type === 'sell' ? 'default' : 'secondary'}>
                        {invoice.invoice_type === 'sell' ? 'Sell' : 'Buy'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {invoice.customers?.name || invoice.suppliers?.name || "N/A"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.invoice_items?.length || 0} items
                    </TableCell>
                    <TableCell className={`text-right font-bold text-lg ${invoice.invoice_type === 'sell' ? 'text-success' : 'text-destructive'}`}>
                      ${Number(invoice.total_amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={
                        invoice.payment_status === 'paid' ? 'default' : 
                        invoice.payment_status === 'partial' ? 'secondary' : 
                        'outline'
                      }>
                        {invoice.payment_status === 'paid' ? 'Paid' : 
                         invoice.payment_status === 'partial' ? 'Partial' : 
                         'Pending'}
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
                          View
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
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRecordPayment(invoice.id)}
                              className="gap-1"
                            >
                              <CreditCard className="w-4 h-4" />
                              Pay
                            </Button>
                          </>
                        )}
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

