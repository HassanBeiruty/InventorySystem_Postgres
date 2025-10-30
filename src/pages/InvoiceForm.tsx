import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { productsRepo, customersRepo, suppliersRepo, invoicesRepo, productPricesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";

interface InvoiceItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  price_type: 'retail' | 'wholesale';
  total_price: number;
  is_private_price: boolean;
  private_price_amount: number;
  private_price_note: string;
}

const InvoiceForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const invoiceType = location.pathname.includes('/buy') ? 'buy' : 'sell';
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [latestPrices, setLatestPrices] = useState<Record<string, { wholesale_price: number | null; retail_price: number | null }>>({});
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  
  const [selectedEntity, setSelectedEntity] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([{
    product_id: "",
    quantity: 1,
    unit_price: 0,
    price_type: 'retail',
    total_price: 0,
    is_private_price: false,
    private_price_amount: 0,
    private_price_note: "",
  }]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [prods, custs, supps, latest] = await Promise.all([
      productsRepo.list(),
      customersRepo.list(),
      suppliersRepo.list(),
      productPricesRepo.latestAll(),
    ]);
    setProducts(prods || []);
    setCustomers(custs || []);
    setSuppliers(supps || []);
    const lp: Record<string, { wholesale_price: number | null; retail_price: number | null }> = {};
    (latest || []).forEach((row: any) => {
      lp[row.product_id] = { wholesale_price: row.wholesale_price ?? null, retail_price: row.retail_price ?? null };
    });
    setLatestPrices(lp);
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      const newItems = [...items];
      newItems[index].product_id = productId;
      
      if (invoiceType === 'sell') {
        // For SELL invoices, default to retail price from product_prices
        const lp = latestPrices[productId];
        newItems[index].unit_price = lp?.retail_price != null ? Number(lp.retail_price) : 0;
        newItems[index].price_type = 'retail';
      } else {
        // For BUY invoices, start with wholesale as reference but user must enter actual cost
        newItems[index].unit_price = 0; // User must enter
        newItems[index].price_type = 'wholesale';
      }
      
      const effectivePrice = newItems[index].is_private_price 
        ? newItems[index].private_price_amount 
        : newItems[index].unit_price;
      newItems[index].total_price = effectivePrice * newItems[index].quantity;
      setItems(newItems);
    }
  };

  const handlePriceTypeChange = (index: number, priceType: 'retail' | 'wholesale') => {
    const productId = items[index].product_id;
    if (productId) {
      const newItems = [...items];
      newItems[index].price_type = priceType;
      const lp = latestPrices[productId];
      newItems[index].unit_price = priceType === 'retail'
        ? (lp?.retail_price != null ? Number(lp.retail_price) : 0)
        : (lp?.wholesale_price != null ? Number(lp.wholesale_price) : 0);
      
      if (!newItems[index].is_private_price) {
        newItems[index].total_price = newItems[index].unit_price * newItems[index].quantity;
      }
      setItems(newItems);
    }
  };

  const handleUnitPriceChange = (index: number, price: number) => {
    const newItems = [...items];
    newItems[index].unit_price = price;
    if (!newItems[index].is_private_price) {
      newItems[index].total_price = price * newItems[index].quantity;
    }
    setItems(newItems);
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    const newItems = [...items];
    newItems[index].quantity = quantity;
    const effectivePrice = newItems[index].is_private_price 
      ? newItems[index].private_price_amount 
      : newItems[index].unit_price;
    newItems[index].total_price = effectivePrice * quantity;
    setItems(newItems);
  };

  const handlePrivatePriceToggle = (index: number, enabled: boolean) => {
    const newItems = [...items];
    newItems[index].is_private_price = enabled;
    if (!enabled) {
      newItems[index].private_price_amount = 0;
      newItems[index].private_price_note = "";
    }
    const effectivePrice = enabled 
      ? newItems[index].private_price_amount 
      : newItems[index].unit_price;
    newItems[index].total_price = effectivePrice * newItems[index].quantity;
    setItems(newItems);
  };

  const handlePrivatePriceChange = (index: number, price: number) => {
    const newItems = [...items];
    newItems[index].private_price_amount = price;
    newItems[index].total_price = price * newItems[index].quantity;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, {
      product_id: "",
      quantity: 1,
      unit_price: 0,
      price_type: 'retail',
      total_price: 0,
      is_private_price: false,
      private_price_amount: 0,
      private_price_note: "",
    }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.total_price, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedEntity) {
      toast({
        title: "Error",
        description: `Please select a ${invoiceType === 'sell' ? 'customer' : 'supplier'}`,
        variant: "destructive",
      });
      return;
    }

    if (items.some(item => !item.product_id || item.quantity <= 0)) {
      toast({
        title: "Error",
        description: "Please fill all item details",
        variant: "destructive",
      });
      return;
    }

    // For buy invoices, validate that cost is entered
    if (invoiceType === 'buy' && items.some(item => !item.unit_price || item.unit_price <= 0)) {
      toast({
        title: "Cost Required",
        description: "Please enter the purchase cost for all items",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      await invoicesRepo.createInvoice({
        invoice_type: invoiceType,
        customer_id: invoiceType === 'sell' ? selectedEntity : null,
        supplier_id: invoiceType === 'buy' ? selectedEntity : null,
        total_amount: calculateTotal(),
        is_paid: false,
        items: items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          price_type: item.price_type,
          is_private_price: item.is_private_price,
          private_price_amount: item.is_private_price ? item.private_price_amount : null,
          private_price_note: item.is_private_price ? item.private_price_note : null,
        })),
      });

      toast({
        title: "Success",
        description: "Invoice created successfully",
      });

      navigate("/invoices");
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
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {invoiceType === 'sell' ? 'New Sell Invoice' : 'New Buy Invoice'}
          </h2>
          <p className="text-muted-foreground">
            Create a new {invoiceType} invoice
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
              <CardDescription>
                Select {invoiceType === 'sell' ? 'customer' : 'supplier'} and add items
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>
                  {invoiceType === 'sell' ? 'Customer' : 'Supplier'}
                </Label>
                <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${invoiceType === 'sell' ? 'customer' : 'supplier'}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(invoiceType === 'sell' ? customers : suppliers).map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>
                        {entity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>Add products to this invoice</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-4">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1 space-y-2">
                      <Label>Product</Label>
                      <Select
                        value={item.product_id}
                        onValueChange={(value) => handleProductChange(index, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="w-24 space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(index, parseInt(e.target.value))}
                      />
                    </div>
                    
                    {invoiceType === 'sell' && (
                      <div className="w-32 space-y-2">
                        <Label>Price Type</Label>
                        <Select
                          value={item.price_type}
                          onValueChange={(value: 'retail' | 'wholesale') => handlePriceTypeChange(index, value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="retail">Retail</SelectItem>
                            <SelectItem value="wholesale">Wholesale</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    <div className="w-32 space-y-2">
                      <Label>{invoiceType === 'buy' ? 'Cost' : 'Unit Price'}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_price || ''}
                        onChange={(e) => handleUnitPriceChange(index, parseFloat(e.target.value) || 0)}
                        disabled={invoiceType === 'sell' && !item.is_private_price}
                        placeholder={invoiceType === 'buy' ? 'Enter cost' : ''}
                      />
                    </div>
                    
                    <div className="w-32 space-y-2">
                      <Label>Total</Label>
                      <Input
                        type="number"
                        value={item.total_price.toFixed(2)}
                        disabled
                      />
                    </div>
                    
                    {items.length > 1 && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {invoiceType === 'sell' && (
                    <div className="space-y-3 border-t pt-3 bg-muted/30 p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`private-${index}`}
                          checked={item.is_private_price}
                          onChange={(e) => handlePrivatePriceToggle(index, e.target.checked)}
                          className="rounded"
                        />
                        <Label htmlFor={`private-${index}`} className="cursor-pointer font-medium">
                          Use Custom Price (Override {item.price_type === 'retail' ? 'Retail' : 'Wholesale'})
                        </Label>
                      </div>
                      
                      {item.is_private_price && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Custom Price Amount</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.private_price_amount || ''}
                              onChange={(e) => handlePrivatePriceChange(index, parseFloat(e.target.value) || 0)}
                              placeholder="Enter custom price"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Reason / Note</Label>
                            <Input
                              type="text"
                              value={item.private_price_note}
                              onChange={(e) => {
                                const newItems = [...items];
                                newItems[index].private_price_note = e.target.value;
                                setItems(newItems);
                              }}
                              placeholder="Why this custom price?"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              <Button type="button" variant="outline" onClick={addItem} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
              
              <div className="flex justify-end pt-4 border-t">
                <div className="text-right space-y-2">
                  <div className="text-sm text-muted-foreground">Total Amount</div>
                  <div className="text-3xl font-bold">${calculateTotal().toFixed(2)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/invoices")}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Invoice"}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default InvoiceForm;
