import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ChevronUp, ChevronDown, Package, AlertTriangle, Search, X } from "lucide-react";
import { productsRepo, customersRepo, suppliersRepo, invoicesRepo, productPricesRepo, inventoryRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface InvoiceItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  price_type: 'retail' | 'wholesale';
  total_price: number;
  is_private_price: boolean;
  private_price_amount: number;
  private_price_note: string;
  barcode?: string;
}

const InvoiceForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [invoiceType, setInvoiceType] = useState<'buy' | 'sell'>(location.pathname.includes('/buy') ? 'buy' : 'sell');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [hasPayments, setHasPayments] = useState(false);
  
  // Update invoice type when URL changes
  useEffect(() => {
    if (isEditMode) return; // Don't change type in edit mode
    
    const newType = location.pathname.includes('/buy') ? 'buy' : 'sell';
    setInvoiceType(newType);
    setSelectedEntity(""); // Reset selected entity when switching types
    setItems([{
      product_id: "",
      quantity: 1,
      unit_price: 0,
      price_type: 'retail',
      total_price: 0,
      is_private_price: false,
      private_price_amount: 0,
      private_price_note: "",
      barcode: "",
    }]);
    // When switching between buy/sell, focus barcode for fast scanning
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  }, [location.pathname, isEditMode]);
  const [products, setProducts] = useState<any[]>([]);
  const [latestPrices, setLatestPrices] = useState<Record<string, { wholesale_price: number | null; retail_price: number | null }>>({});
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [availableStock, setAvailableStock] = useState<Map<string, number>>(new Map());
  
  const [selectedEntity, setSelectedEntity] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const [paidDirectly, setPaidDirectly] = useState<boolean>(true);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [productSearchQuery, setProductSearchQuery] = useState<Record<number, string>>({});
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const productSearchInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [items, setItems] = useState<InvoiceItem[]>([{
    product_id: "",
    quantity: 1,
    unit_price: 0,
    price_type: 'retail',
    total_price: 0,
    is_private_price: false,
    private_price_amount: 0,
    private_price_note: "",
    barcode: "",
  }]);

  useEffect(() => {
    let cancelled = false;
    
    const initializeData = async () => {
      try {
        const [prodsResponse, custs, supps, latest, stockData] = await Promise.all([
          productsRepo.list({ limit: 1000 }),
          customersRepo.list(),
          suppliersRepo.list(),
          productPricesRepo.latestAll(),
          invoiceType === 'sell' ? inventoryRepo.today() : Promise.resolve([]),
        ]);
        const prods = Array.isArray(prodsResponse) ? prodsResponse : prodsResponse.data;
        
                // Don't update state if component unmounted
        if (cancelled) return;

        // Ensure "Unknown Customer" exists for sell invoices
        let customersList = custs || [];
        if (invoiceType === 'sell') {
          let unknownCustomer = customersList.find((c: any) => 
            c.name && c.name.toLowerCase().trim() === 'unknown customer'
          );
          
          // If "Unknown Customer" doesn't exist, create it
          if (!unknownCustomer) {
            try {
              await customersRepo.add({
                name: 'Unknown Customer',
                phone: null,
                address: null,
                credit_limit: 0
              });
              // Reload customers to get the new one
              const updatedCustomers = await customersRepo.list();
              customersList = updatedCustomers || [];
              unknownCustomer = customersList.find((c: any) => 
                c.name && c.name.toLowerCase().trim() === 'unknown customer'
              );
            } catch (error: any) {
              console.warn('Could not create Unknown Customer:', error);
            }
          }
          
          // Set "Unknown Customer" as default for new sell invoices
          if (!isEditMode && unknownCustomer) {
            setSelectedEntity(String(unknownCustomer.id));
          }
        }

        setProducts(prods || []);
        setCustomers(customersList);
        setSuppliers(supps || []);
        
        // Map available stock by product_id
        if (invoiceType === 'sell' && stockData) {
          const stockMap = new Map<string, number>();
          (stockData as any[]).forEach((item: any) => {
            const productId = String(item.product_id);
            stockMap.set(productId, Number(item.available_qty) || 0);
          });
          setAvailableStock(stockMap);
        }
        
        // Data loaded successfully
        
        const lp: Record<string, { wholesale_price: number | null; retail_price: number | null }> = {};
        (latest || []).forEach((row: any) => {
          // Store with string key for consistency
          const productIdStr = String(row.product_id);
          lp[productIdStr] = { wholesale_price: row.wholesale_price ?? null, retail_price: row.retail_price ?? null };
        });
        // Latest prices loaded
        
        if (cancelled) return;
        setLatestPrices(lp);
        
        // Now load invoice data if in edit mode, with the fresh data
        if (isEditMode && id && !cancelled) {
          await loadInvoiceData(id, prods || [], custs || [], supps || []);
          // Reload stock data if it's a sell invoice
          if (invoiceType === 'sell') {
            const editStockData = await inventoryRepo.today();
            if (editStockData && !cancelled) {
              const stockMap = new Map<string, number>();
              (editStockData as any[]).forEach((item: any) => {
                const productId = String(item.product_id);
                stockMap.set(productId, Number(item.available_qty) || 0);
              });
              setAvailableStock(stockMap);
            }
          }
        }
        
        if (cancelled) return;
        setPageLoading(false);
      } catch (error: any) {
        if (cancelled) return;
        console.error('Error fetching data:', error);
        setPageLoading(false);
        toast({
          title: "Error",
          description: `Failed to load data. ${error.message}`,
          variant: "destructive",
        });
      }
    };
    
    initializeData();
    
    // Cleanup function
    return () => {
      cancelled = true;
    };
  }, [isEditMode, id]);
  
  // Reset hasPayments when creating a new invoice
  useEffect(() => {
    if (!isEditMode) {
      setHasPayments(false);
    }
  }, [isEditMode]);
  
  // Debug: Log when selectedEntity changes
  useEffect(() => {
    if (selectedEntity) {
      const entityList = invoiceType === 'sell' ? customers : suppliers;
      const found = entityList.find(e => String(e.id) === selectedEntity);
      // Selected entity updated
    }
  }, [selectedEntity, invoiceType, customers, suppliers]);

  const loadInvoiceData = async (invoiceId: string, prods: any[] = [], custs: any[] = [], supps: any[] = []) => {
    try {
      setLoading(true);
      const invoiceData = await invoicesRepo.getInvoiceDetails(invoiceId);
      
      // Check if invoice has payments
      const payments = invoiceData.payments || [];
      setHasPayments(payments.length > 0);
      
      // Use passed data or fallback to state
      const productsList = prods.length > 0 ? prods : products;
      const customersList = custs.length > 0 ? custs : customers;
      const suppliersList = supps.length > 0 ? supps : suppliers;
      
      // Set invoice type from loaded data
      if (invoiceData.invoice_type) {
        setInvoiceType(invoiceData.invoice_type);
      }
      
      // Set due date if it exists
      if (invoiceData.due_date) {
        // Convert date to YYYY-MM-DD format for input
        const date = new Date(invoiceData.due_date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        setDueDate(`${year}-${month}-${day}`);
      } else {
        setDueDate("");
      }
      
      // Set the entity (customer or supplier) - ensure we convert to string
      
      if (invoiceData.customer_id) {
        const customerId = String(invoiceData.customer_id);
        const customer = customersList.find(c => {
          const cIdStr = String(c.id);
          const cIdNum = Number(c.id);
          return cIdStr === customerId || cIdNum === Number(invoiceData.customer_id);
        });
        if (customer) {
          setSelectedEntity(customerId);
        } else {
          // Try setting anyway
          setSelectedEntity(customerId);
        }
      } else if (invoiceData.supplier_id !== null && invoiceData.supplier_id !== undefined) {
        const supplierId = String(invoiceData.supplier_id);
        const supplier = suppliersList.find(s => {
          const sIdStr = String(s.id);
          const sIdNum = Number(s.id);
          return sIdStr === supplierId || sIdNum === Number(invoiceData.supplier_id);
        });
        if (supplier) {
          setSelectedEntity(supplierId);
        } else {
          // Try setting anyway - sometimes the value needs to be set for the Select to work
          setSelectedEntity(supplierId);
        }
      }

      // Load invoice items - ensure product_id matches products array
      if (invoiceData.invoice_items && invoiceData.invoice_items.length > 0) {
        const loadedItems: InvoiceItem[] = invoiceData.invoice_items.map((item: any) => {
          // Try to find matching product by ID (handle both string and number)
          const productId = item.product_id;
          const productIdStr = String(productId);
          const matchingProduct = productsList.find(p => 
            String(p.id) === productIdStr || Number(p.id) === Number(productId)
          );
          
          if (!matchingProduct) {
            // Product not found for item, will use fallback
          } else {
            // Product matched successfully
          }
          
          // Get product barcode from the loaded product
          const loadedProduct = productsList.find(p => 
            String(p.id) === productIdStr || Number(p.id) === Number(productId)
          );
          
          return {
            product_id: productIdStr, // Convert to string for consistency
            quantity: Number(item.quantity) || 1,
            unit_price: Number(item.unit_price) || 0,
            price_type: item.price_type || 'retail',
            total_price: Number(item.total_price) || 0,
            is_private_price: !!item.is_private_price,
            private_price_amount: Number(item.private_price_amount) || 0,
            private_price_note: item.private_price_note || "",
            barcode: loadedProduct?.barcode || "",
          };
        });
        // Items loaded successfully
        setItems(loadedItems);
      } else {
        // No invoice items found
      }
    } catch (error: any) {
      console.error('Error loading invoice:', error);
      toast({
        title: "Error",
        description: `Failed to load invoice. ${error.message}`,
        variant: "destructive",
      });
      navigate("/invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find(p => String(p.id) === productId || p.id === productId);
    if (product) {
      // Check if this product is already in another item
      const existingItemIndex = items.findIndex((item, idx) => 
        idx !== index && item.product_id && String(item.product_id) === String(productId)
      );
      
      if (existingItemIndex !== -1) {
        toast({
          title: "Duplicate Product",
          description: `This product is already added to the invoice at row ${existingItemIndex + 1}. Please remove the duplicate or edit the existing item.`,
          variant: "destructive",
        });
        return; // Don't change the product
      }
      
      const newItems = [...items];
      newItems[index].product_id = productId;
      // Update top barcode field when product is selected
      setBarcodeInput(product.barcode || "");
      setActiveItemIndex(index);
      
      if (invoiceType === 'sell') {
        // For SELL invoices, default to retail price from product_prices
        const lp = latestPrices[productId];
        const retailPrice = lp?.retail_price != null ? Number(lp.retail_price) : 0;
        newItems[index].unit_price = retailPrice;
        newItems[index].price_type = 'retail';
        
        // Warn if product has no price set
        if (retailPrice === 0 && (!lp || lp.retail_price === null)) {
          toast({
            title: "Price Not Set",
            description: `Product "${product.name}" has no price set. Please add a price in the Product Prices page before selling this product.`,
            variant: "destructive",
          });
        }
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

  // Handle barcode/SKU input from top field - link with active item's product dropdown
  const handleTopBarcodeSearch = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    
    // In edit mode, don't allow adding new items via barcode/SKU
    if (isEditMode) {
      toast({
        title: "Edit Mode",
        description: "Cannot add new items in edit mode. You can only modify quantity and price of existing items.",
        variant: "info",
      });
      setBarcodeInput("");
      return;
    }

    // Try to find product by barcode first, then by SKU
    const product = products.find(p => 
      (p.barcode && p.barcode.toLowerCase() === trimmed.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase() === trimmed.toLowerCase())
    );

    if (!product) {
      toast({
        title: "Product Not Available",
        description: `No product found with barcode or SKU: ${trimmed}`,
        variant: "info",
      });
      // Clear and refocus for next scan
      setBarcodeInput("");
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
      return;
    }

    // Check if this product is already in the items list
    const existingItemIndex = items.findIndex(item =>
      item.product_id && String(item.product_id) === String(product.id)
    );
    
    if (existingItemIndex !== -1) {
      toast({
        title: "Duplicate Product",
        description: `This product is already added to the invoice at row ${existingItemIndex + 1}. Please remove the duplicate or edit the existing item.`,
        variant: "destructive",
      });
      // Focus on the existing item
      setActiveItemIndex(existingItemIndex);
      return;
    }

    // Insert or reuse a row and assign the product in a single, synchronous update
    let newActiveIndex = activeItemIndex;
    const productIdStr = String(product.id);

    setItems(prevItems => {
      const updated = [...prevItems];

      // Find target row
      let targetIndex = newActiveIndex;
      if (!updated[targetIndex] || updated[targetIndex].product_id) {
        const emptyIndex = updated.findIndex(item => !item.product_id);
        if (emptyIndex >= 0) {
          targetIndex = emptyIndex;
        } else {
          // No empty row – append a new one
          updated.push({
            product_id: "",
            quantity: 1,
            unit_price: 0,
            price_type: "retail",
            total_price: 0,
            is_private_price: false,
            private_price_amount: 0,
            private_price_note: "",
            barcode: "",
          });
          targetIndex = updated.length - 1;
        }
      }

      const item = updated[targetIndex];
      item.product_id = productIdStr;

      if (invoiceType === "sell") {
        const lp = latestPrices[productIdStr];
        const retailPrice = lp?.retail_price != null ? Number(lp.retail_price) : 0;
        item.unit_price = retailPrice;
        item.price_type = "retail";

        if (retailPrice === 0 && (!lp || lp.retail_price === null)) {
          toast({
            title: "Price Not Set",
            description: `Product "${product.name}" has no price set. Please add a price in the Product Prices page before selling this product.`,
            variant: "destructive",
          });
        }
      } else {
        item.unit_price = 0;
        item.price_type = "wholesale";
      }

      const effectivePrice = item.is_private_price
        ? item.private_price_amount
        : item.unit_price;
      item.total_price = effectivePrice * item.quantity;

      newActiveIndex = targetIndex;
      return updated;
    });

    setActiveItemIndex(newActiveIndex);
    setBarcodeInput("");
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  const handlePriceTypeChange = (index: number, priceType: 'retail' | 'wholesale') => {
    const productId = items[index].product_id;
    if (productId) {
      const newItems = [...items];
      newItems[index].price_type = priceType;
      // Try to find price by both string and number product_id
      const lp = latestPrices[productId] || latestPrices[Number(productId)];
      const selectedPrice = priceType === 'retail'
        ? (lp?.retail_price != null ? Number(lp.retail_price) : 0)
        : (lp?.wholesale_price != null ? Number(lp.wholesale_price) : 0);
      newItems[index].unit_price = selectedPrice;
      
      // Warn if switching to a price type that has no price set (only for sell invoices)
      if (invoiceType === 'sell' && selectedPrice === 0) {
        const product = products.find(p => String(p.id) === productId);
        const priceTypeName = priceType === 'retail' ? 'retail' : 'wholesale';
        toast({
          title: "Price Not Set",
          description: `Product "${product?.name || 'Product'}" has no ${priceTypeName} price set. Please add a price in the Product Prices page before selling this product.`,
          variant: "destructive",
        });
      }
      
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
    if (invoiceType === 'sell' && items[index].product_id) {
      const productId = String(items[index].product_id);
      const effectiveAvailable = getEffectiveAvailableStock(productId, index);
      
      if (effectiveAvailable !== null && quantity > effectiveAvailable) {
        toast({
          title: "Insufficient Stock",
          description: `Only ${effectiveAvailable} units available for this product (after accounting for items already in invoice).`,
          variant: "destructive",
        });
        return; // Don't update quantity
      }
    }
    
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
    setItems([{
      product_id: "",
      quantity: 1,
      unit_price: 0,
      price_type: 'retail',
      total_price: 0,
      is_private_price: false,
      private_price_amount: 0,
      private_price_note: "",
      barcode: "",
    }, ...items]);
  };

  const removeItem = (index: number) => {
    if (hasPayments) {
      return; // Silently prevent removal if payments exist
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return items.filter(item => item.product_id).reduce((sum, item) => sum + item.total_price, 0);
  };

  // Calculate effective available stock for a product (base stock minus what's already in invoice)
  const getEffectiveAvailableStock = (productId: string, excludeIndex?: number) => {
    if (invoiceType !== 'sell' || !productId) return null;
    const baseAvailable = availableStock.get(String(productId)) || 0;
    
    // Calculate total quantity of this product already in invoice items (excluding current item)
    const totalInInvoice = items.reduce((sum, item, idx) => {
      if (idx === excludeIndex) return sum; // Exclude current item being edited
      if (String(item.product_id) === String(productId)) {
        return sum + item.quantity;
      }
      return sum;
    }, 0);
    
    return Math.max(0, baseAvailable - totalInInvoice);
  };

  // Scroll to top when page loads - run after page is fully rendered
  useEffect(() => {
    if (!pageLoading) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        // Also scroll document element for compatibility
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
    }
  }, [pageLoading]);

  // Auto-focus barcode input when form is ready and not in edit mode
  useEffect(() => {
    if (!pageLoading && !isEditMode) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 50);
    }
  }, [pageLoading, isEditMode, invoiceType]);


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

    // Filter out empty items (no product selected) before validation
    const validItems = items.filter(item => item.product_id);
    
    if (validItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one product to the invoice",
        variant: "destructive",
      });
      return;
    }

    // Validate that no two items have the same product
    const productIds = validItems.map(item => String(item.product_id));
    const duplicateProductIds = productIds.filter((productId, index) => 
      productIds.indexOf(productId) !== index
    );
    
    if (duplicateProductIds.length > 0) {
      const duplicateProducts = duplicateProductIds.map(productId => {
        const product = products.find(p => String(p.id) === productId);
        return product?.name || `Product ID: ${productId}`;
      });
      
      toast({
        title: "Duplicate Products Found",
        description: `Each product can only appear once in an invoice. Please remove duplicates: ${[...new Set(duplicateProducts)].join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    if (validItems.some(item => item.quantity <= 0)) {
      toast({
        title: "Error",
        description: "Please fill all item details",
        variant: "destructive",
      });
      return;
    }

    // For buy invoices, validate that cost is entered
    if (invoiceType === 'buy' && validItems.some(item => !item.unit_price || item.unit_price <= 0)) {
      toast({
        title: "Cost Required",
        description: "Please enter the purchase cost for all items",
        variant: "destructive",
      });
      return;
    }

    // For sell invoices, validate that products have prices set (not 0)
    if (invoiceType === 'sell') {
      const itemsWithoutPrice: string[] = [];
      validItems.forEach((item) => {
        const effectivePrice = item.is_private_price ? item.private_price_amount : item.unit_price;
        if (!effectivePrice || effectivePrice <= 0) {
          const product = products.find(p => String(p.id) === String(item.product_id));
          itemsWithoutPrice.push(product?.name || `Product #${item.product_id}`);
        }
      });

      if (itemsWithoutPrice.length > 0) {
        toast({
          title: "Price Required",
          description: `The following products need a price before selling: ${itemsWithoutPrice.join(', ')}. Please add prices in the Product Prices page first.`,
          variant: "destructive",
        });
        return;
      }
    }

    // Validate stock availability for sell invoices
    if (invoiceType === 'sell') {
      const stockErrors: string[] = [];
      validItems.forEach((item, index) => {
        if (!item.product_id) return;
        const productId = String(item.product_id);
        const effectiveAvailable = getEffectiveAvailableStock(productId, index);
        
        if (effectiveAvailable !== null && item.quantity > effectiveAvailable) {
          const product = products.find(p => String(p.id) === productId);
          stockErrors.push(`${product?.name || 'Product'}: ${item.quantity} requested, but only ${effectiveAvailable} available (after accounting for items already in invoice)`);
        }
      });
      
      if (stockErrors.length > 0) {
        toast({
          title: "Insufficient Stock",
          description: stockErrors.join('\n'),
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);

    try {
      const invoiceData = {
        invoice_type: invoiceType,
        customer_id: invoiceType === 'sell' ? selectedEntity : null,
        supplier_id: invoiceType === 'buy' ? selectedEntity : null,
        total_amount: calculateTotal(),
        due_date: dueDate || null,
        paid_directly: !isEditMode ? paidDirectly : false, // Only apply to new invoices
        items: validItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          price_type: item.price_type,
          is_private_price: item.is_private_price,
          private_price_amount: item.is_private_price ? item.private_price_amount : null,
          private_price_note: item.is_private_price ? item.private_price_note : null,
        })),
      };

      if (isEditMode && id) {
        // Updating invoice
        await invoicesRepo.updateInvoice(id, invoiceData);
        toast({
          title: "Success",
          description: "Invoice updated successfully",
        });
        // Invalidate all related queries to force immediate refresh
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["invoices"] }),
          queryClient.invalidateQueries({ queryKey: ["inventory"] }),
          queryClient.invalidateQueries({ queryKey: ["daily-stock"] }),
          queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        ]);
      } else {
        await invoicesRepo.createInvoice(invoiceData);
        toast({
          title: "Success",
          description: "Invoice created successfully",
        });
        // Invalidate all related queries to force immediate refresh
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["invoices"] }),
          queryClient.invalidateQueries({ queryKey: ["inventory"] }),
          queryClient.invalidateQueries({ queryKey: ["daily-stock"] }),
          queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        ]);
      }

       // Small delay to allow stored procedure to complete
       await new Promise(resolve => setTimeout(resolve, 500));
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

  if (pageLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-8 animate-fade-in">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground">Loading invoice form...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-0.5">
        <div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight">
            {isEditMode ? (invoiceType === 'sell' ? t('invoiceForm.editSellInvoice') : t('invoiceForm.editBuyInvoice')) : (invoiceType === 'sell' ? t('invoiceForm.newSellInvoice') : t('invoiceForm.newBuyInvoice'))}
          </h2>
          <p className="text-muted-foreground text-[9px] sm:text-[10px]">
            {isEditMode 
              ? (invoiceType === 'sell' ? 'Edit sell invoice details and items' : 'Edit buy invoice details and items')
              : (invoiceType === 'sell' ? 'Create a new sell invoice' : 'Create a new buy invoice')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-1.5">
          <Card className="border-2">
            <CardHeader className="pb-1 pt-1.5 px-2.5 bg-gradient-to-r from-muted/30 to-transparent">
              <CardTitle className="text-xs sm:text-sm font-bold">{t('invoiceForm.invoiceDetails')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-1.5 px-2.5 pb-2">
              <div className="grid gap-2 sm:grid-cols-3 items-start">
                {/* Supplier */}
                <div className="space-y-0.5">
                  <Label htmlFor="entity-select" className="text-[10px] sm:text-xs font-medium flex items-center gap-1">
                    {invoiceType === 'sell' ? '👤 Customer' : '📦 Supplier'}
                  </Label>
                  <Select 
                    key={`${invoiceType}-${selectedEntity}-${(invoiceType === 'sell' ? customers : suppliers).length}`}
                    value={selectedEntity || ""} 
                    onValueChange={setSelectedEntity}
                  >
                    <SelectTrigger id="entity-select" className="h-8 text-xs border-2 hover:border-primary/50 transition-colors">
                      <SelectValue placeholder={invoiceType === 'sell' ? t('invoiceForm.selectCustomer') : t('invoiceForm.selectSupplier')} />
                    </SelectTrigger>
                    <SelectContent side="bottom" align="start" className="max-h-[50vh] overflow-y-auto">
                      {(invoiceType === 'sell' ? customers : suppliers).length === 0 ? (
                        <SelectItem value="loading" disabled>Loading...</SelectItem>
                      ) : (
                        (invoiceType === 'sell' ? customers : suppliers).map((entity) => {
                          const entityId = String(entity.id);
                          return (
                            <SelectItem key={entity.id} value={entityId}>
                              {entity.name}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Due Date */}
                <div className="space-y-0.5">
                  <Label htmlFor="due_date" className="text-[10px] sm:text-xs font-medium flex items-center gap-1">
                    📅 Due Date <span className="text-muted-foreground text-[9px] font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    placeholder={t("commonPlaceholders.selectDueDate")}
                    className="h-8 text-xs border-2 hover:border-primary/50 transition-colors"
                  />
                </div>

                {/* Barcode/SKU Scanner */}
                <div className="space-y-0.5 border-2 border-primary/40 rounded-lg p-1.5 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/5 shadow-sm">
                  <Label className="text-[10px] sm:text-xs font-semibold flex items-center gap-1 text-primary">
                    🔍 Scan Barcode/SKU
                  </Label>
                  <Input
                    ref={barcodeInputRef}
                    placeholder="Scan or type barcode/SKU..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (barcodeInput.trim()) {
                          handleTopBarcodeSearch(barcodeInput);
                        }
                      }
                    }}
                    className="w-full h-8 text-xs border-2 border-primary/40 hover:border-primary/60 focus:border-primary bg-background/50 font-mono font-semibold transition-all"
                    disabled={isEditMode}
                  />
                  <p className="text-[8px] sm:text-[9px] text-muted-foreground font-medium">
                    {isEditMode ? "⚠️ Disabled in edit mode" : "Press Enter to search"}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 pt-2 border-t mt-2">
                <input
                  type="checkbox"
                  id="paid-directly"
                  checked={paidDirectly}
                  onChange={(e) => setPaidDirectly(e.target.checked)}
                  className="rounded border-input w-4 h-4"
                  disabled={isEditMode}
                />
                <Label htmlFor="paid-directly" className="cursor-pointer text-[10px] sm:text-xs font-medium">
                  💰 Mark as paid directly (invoice will be fully paid on creation)
                </Label>
              </div>
              {isEditMode && (
                <div className="mt-1">
                  <p className="text-[9px] text-muted-foreground">
                    ⚠️ Payment status cannot be changed in edit mode
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-1 pt-1.5 px-2.5 bg-gradient-to-r from-muted/30 to-transparent">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xs sm:text-sm font-bold">{t('invoiceForm.items')}</CardTitle>
                  <CardDescription className="text-[9px] sm:text-[10px]">{t('invoiceForm.addProducts')}</CardDescription>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-1.5 px-2.5 pb-2">
              {items.map((item, index) => {
                const availableQty = getEffectiveAvailableStock(String(item.product_id), index);
                const isLowStock = availableQty !== null && availableQty < 10;
                const isOutOfStock = availableQty !== null && availableQty === 0;
                
                return (
                  <div key={index} className="border-2 rounded-lg p-1.5 bg-gradient-to-br from-card to-muted/10 hover:shadow-md transition-all">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-1 items-end">
                      <div className="md:col-span-3 space-y-0.5">
                        <Label htmlFor={`product-${index}`} className="text-[9px] sm:text-[10px]">{t('invoiceForm.product')}</Label>
                        <Select
                          value={item.product_id}
                          onValueChange={(value) => {
                            if (!isEditMode) {
                              handleProductChange(index, value);
                              setActiveItemIndex(index);
                              // Clear search when product is selected
                              setProductSearchQuery(prev => ({ ...prev, [index]: "" }));
                            }
                          }}
                          onOpenChange={(open) => {
                            if (open && !isEditMode) {
                              setActiveItemIndex(index);
                              // Focus the search input when dropdown opens
                              setTimeout(() => {
                                productSearchInputRefs.current[index]?.focus();
                              }, 100);
                            } else {
                              // Clear search when dropdown closes
                              setProductSearchQuery(prev => ({ ...prev, [index]: "" }));
                            }
                          }}
                          disabled={isEditMode}
                        >
                          <SelectTrigger id={`product-${index}`} className="h-7 text-xs">
                            <SelectValue placeholder={t('invoiceForm.selectProduct')} />
                          </SelectTrigger>
                          <SelectContent 
                            side="bottom" 
                            align="start" 
                            position="popper" 
                            avoidCollisions={false}
                            sideOffset={4}
                            className="max-h-[200px] overflow-y-auto"
                          >
                            <div className="sticky top-0 z-10 bg-popover border-b p-1.5">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <Input
                                  ref={(el) => {
                                    productSearchInputRefs.current[index] = el;
                                  }}
                                  type="text"
                                  placeholder="Search products (name, barcode, SKU, ID)..."
                                  value={productSearchQuery[index] || ""}
                                  onChange={(e) => {
                                    setProductSearchQuery(prev => ({ ...prev, [index]: e.target.value }));
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  className="w-full pl-8 pr-8 h-7 text-xs"
                                  autoFocus
                                />
                                {(productSearchQuery[index] || "").trim() && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setProductSearchQuery(prev => ({ ...prev, [index]: "" }));
                                    }}
                                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                              {(() => {
                                const searchQuery = (productSearchQuery[index] || "").toLowerCase().trim();
                                const filteredProducts = searchQuery
                                  ? products.filter(product => {
                                      const name = (product.name || "").toLowerCase();
                                      const barcode = (product.barcode || "").toLowerCase();
                                      const sku = (product.sku || "").toLowerCase();
                                      const id = (product.id || "").toString();
                                      return name.includes(searchQuery) || 
                                             barcode.includes(searchQuery) || 
                                             sku.includes(searchQuery) || 
                                             id.includes(searchQuery);
                                    })
                                  : products;
                                
                                if (filteredProducts.length === 0) {
                                  return (
                                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                                      No products found matching "{productSearchQuery[index]}"
                                    </div>
                                  );
                                }
                                
                                return filteredProducts.map((product) => (
                                  <SelectItem key={product.id} value={String(product.id)}>
                                    <span className="text-muted-foreground text-xs">#{product.id}</span> {product.name}
                                    {product.barcode && (
                                      <span className="text-muted-foreground text-xs ml-2">({product.barcode})</span>
                                    )}
                                    {product.sku && (
                                      <span className="text-muted-foreground text-xs ml-1">SKU: {product.sku}</span>
                                    )}
                                  </SelectItem>
                                ));
                              })()}
                            </div>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="md:col-span-2 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-[9px] sm:text-[10px]">{t('invoiceForm.quantity')}</Label>
                          {invoiceType === 'sell' && item.product_id && availableQty !== null && (
                            <div className="flex items-center gap-0.5">
                              {isOutOfStock ? (
                                <AlertTriangle className="w-2.5 h-2.5 text-destructive" />
                              ) : isLowStock ? (
                                <AlertTriangle className="w-2.5 h-2.5 text-warning" />
                              ) : (
                                <Package className="w-2.5 h-2.5 text-muted-foreground" />
                              )}
                              <span className={`text-[10px] ${
                                isOutOfStock ? "text-destructive" : 
                                isLowStock ? "text-warning" : 
                                "text-muted-foreground"
                              }`}>
                                {availableQty}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Input
                            type="number"
                            min="1"
                            max={availableQty !== null ? availableQty : undefined}
                            value={isNaN(item.quantity) || item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 1 : parseInt(e.target.value);
                              handleQuantityChange(index, isNaN(val) || val < 1 ? 1 : val);
                            }}
                            className="flex-1 h-7 text-xs"
                          />
                          <div className="flex flex-col">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-3.5 w-5 rounded-b-none border-b-0 p-0"
                              onClick={() => {
                                const currentQty = isNaN(item.quantity) || item.quantity === 0 ? 1 : item.quantity;
                                const maxQty = availableQty !== null ? availableQty : undefined;
                                const newQty = maxQty !== undefined && currentQty >= maxQty ? currentQty : currentQty + 1;
                                handleQuantityChange(index, newQty);
                              }}
                              disabled={availableQty !== null && item.quantity >= availableQty}
                            >
                              <ChevronUp className="w-2 h-2" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-3.5 w-5 rounded-t-none p-0"
                              onClick={() => {
                                const currentQty = isNaN(item.quantity) || item.quantity === 0 ? 1 : item.quantity;
                                const newQty = currentQty > 1 ? currentQty - 1 : 1;
                                handleQuantityChange(index, newQty);
                              }}
                              disabled={item.quantity <= 1}
                            >
                              <ChevronDown className="w-2 h-2" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {invoiceType === 'sell' && (
                        <div className="md:col-span-2 space-y-0.5">
                          <Label htmlFor={`price-type-${index}`} className="text-[9px] sm:text-[10px]">{t('invoiceForm.priceType')}</Label>
                          <Select
                            value={item.price_type}
                            onValueChange={(value: 'retail' | 'wholesale') => handlePriceTypeChange(index, value)}
                          >
                            <SelectTrigger id={`price-type-${index}`} className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent side="bottom" align="start" className="max-h-[50vh] overflow-y-auto">
                              <SelectItem value="retail">{t('invoiceForm.retail')}</SelectItem>
                              <SelectItem value="wholesale">{t('invoiceForm.wholesale')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      <div className={`${invoiceType === 'sell' ? 'md:col-span-2' : 'md:col-span-3'} space-y-0.5`}>
                        <Label className="text-[9px] sm:text-[10px]">{invoiceType === 'buy' ? t('invoiceForm.cost') : t('invoiceForm.unitPrice')}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={isNaN(item.unit_price) ? '' : item.unit_price}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            handleUnitPriceChange(index, isNaN(val) ? 0 : val);
                          }}
                          disabled={invoiceType === 'sell' && !item.is_private_price}
                          placeholder={invoiceType === 'buy' ? t('invoiceForm.enterCost') : ''}
                          className={`h-7 text-xs ${invoiceType === 'sell' && !item.is_private_price ? "bg-muted" : ""}`}
                        />
                      </div>
                      
                      <div className="md:col-span-2 space-y-0.5">
                        <Label className="text-[9px] sm:text-[10px]">{t('invoiceForm.total')}</Label>
                        <Input
                          type="number"
                          value={isNaN(item.total_price) ? '' : item.total_price.toFixed(2)}
                          disabled
                          className="h-7 text-xs bg-muted font-semibold cursor-default"
                        />
                      </div>
                      
                      {items.length > 1 && (
                        <div className="md:col-span-1 flex items-end">
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            onClick={() => removeItem(index)}
                            disabled={hasPayments}
                            className={`h-7 w-7 ${
                              hasPayments
                                ? 'opacity-60 cursor-not-allowed bg-warning/10 text-warning hover:bg-warning/20 hover:text-warning'
                                : ''
                            }`}
                            title={
                              hasPayments
                                ? "Cannot remove items from invoice with payments. Remove all payments first."
                                : "Remove item"
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                  {invoiceType === 'sell' && (
                    <div className="space-y-0.5 border-t pt-1 mt-1">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id={`private-${index}`}
                          checked={item.is_private_price}
                          onChange={(e) => handlePrivatePriceToggle(index, e.target.checked)}
                          className="rounded border-input w-3.5 h-3.5"
                        />
                        <Label htmlFor={`private-${index}`} className="cursor-pointer text-[9px] sm:text-[10px] font-medium">
                          {t('invoiceForm.useCustomPrice')} {item.price_type === 'retail' ? t('invoiceForm.retail') : t('invoiceForm.wholesale')})
                        </Label>
                      </div>
                      
                      {item.is_private_price && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          <div className="space-y-0.5">
                            <Label className="text-[9px] sm:text-[10px]">{t('invoiceForm.customPriceAmount')}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={isNaN(item.private_price_amount) || item.private_price_amount === 0 ? '' : item.private_price_amount}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                handlePrivatePriceChange(index, isNaN(val) ? 0 : val);
                              }}
                              placeholder={t('invoiceForm.enterCustomPrice')}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-[9px] sm:text-[10px]">{t('invoiceForm.reasonNote')}</Label>
                            <Input
                              type="text"
                              value={item.private_price_note}
                              onChange={(e) => {
                                const newItems = [...items];
                                newItems[index].private_price_note = e.target.value;
                                setItems(newItems);
                              }}
                              placeholder={t('invoiceForm.whyCustomPrice')}
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}
              
              {/* Hide Add Item button in edit mode */}
              {!isEditMode && (
                <Button type="button" variant="outline" onClick={addItem} className="w-full h-8 text-xs border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-all">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  {t('invoiceForm.addItem')}
                </Button>
              )}
              
              <div className="flex justify-end pt-2 border-t-2 mt-2">
                <div className="text-right space-y-0.5 bg-gradient-to-br from-primary/5 to-accent/5 px-4 py-2 rounded-lg border-2">
                  <div className="text-[10px] sm:text-xs text-muted-foreground font-medium">{t('invoiceForm.totalAmount')}</div>
                  <div className="text-lg sm:text-2xl font-bold text-primary">${calculateTotal().toFixed(2)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate("/invoices")} className="w-full sm:w-auto h-9 text-xs border-2 hover:bg-muted">
              {t('invoiceForm.cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto h-9 text-xs font-semibold shadow-md hover:shadow-lg transition-all">
              {loading ? (isEditMode ? t('invoiceForm.updating') : t('invoiceForm.creating')) : (isEditMode ? t('invoiceForm.updateInvoice') : t('invoiceForm.createInvoice'))}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default InvoiceForm;
