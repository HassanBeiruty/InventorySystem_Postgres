import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ChevronUp, ChevronDown, Package, AlertTriangle } from "lucide-react";
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
  const [barcodeInput, setBarcodeInput] = useState("");
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
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
        const [prods, custs, supps, latest, stockData] = await Promise.all([
          productsRepo.list(),
          customersRepo.list(),
          suppliersRepo.list(),
          productPricesRepo.latestAll(),
          invoiceType === 'sell' ? inventoryRepo.today() : Promise.resolve([]),
        ]);
        
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

  // Handle barcode input from top field - link with active item's product dropdown
  const handleTopBarcodeSearch = (barcode: string) => {
    if (!barcode.trim()) return;
    
    // In edit mode, don't allow adding new items via barcode
    if (isEditMode) {
      toast({
        title: "Edit Mode",
        description: "Cannot add new items in edit mode. You can only modify quantity and price of existing items.",
        variant: "info",
      });
      setBarcodeInput("");
      return;
    }

    const product = products.find(p => 
      p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase().trim()
    );

    if (!product) {
      toast({
        title: "Product Not Available",
        description: `No product found with barcode: ${barcode}`,
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

    // Find first item without product or use active item index
    let targetIndex = activeItemIndex;
    if (!items[targetIndex] || items[targetIndex].product_id) {
      // Find first empty product
      const emptyIndex = items.findIndex(item => !item.product_id);
      if (emptyIndex >= 0) {
        targetIndex = emptyIndex;
      } else {
        // No empty item found, add a new one
        addItem();
        targetIndex = items.length; // New item will be at the end
        setActiveItemIndex(targetIndex);
      }
    }

    // Product found, fill the product dropdown for the target item
    // Use setTimeout to ensure new item is added before trying to update
    if (targetIndex === items.length) {
      setTimeout(() => {
        handleProductChange(targetIndex, String(product.id));
        // Remove any remaining empty items after adding product
        setTimeout(() => {
          setItems(prevItems => prevItems.filter(item => item.product_id || prevItems.length === 1));
        }, 50);
      }, 0);
    } else {
      handleProductChange(targetIndex, String(product.id));
      // Remove any remaining empty items after filling product
      setTimeout(() => {
        setItems(prevItems => prevItems.filter(item => item.product_id || prevItems.length === 1));
      }, 50);
    }

    // Clear barcode input and refocus for next scan
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
      const available = availableStock.get(productId) || 0;
      
      // Calculate total quantity for this product across all items (including current edit)
      const totalQuantityForProduct = items.reduce((sum, item, idx) => {
        if (idx === index) return sum + quantity;
        if (String(item.product_id) === productId) return sum + item.quantity;
        return sum;
      }, 0);
      
      if (totalQuantityForProduct > available) {
        toast({
          title: "Insufficient Stock",
          description: `Only ${available} units available for this product. Current request: ${totalQuantityForProduct} units.`,
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
    setItems([...items, {
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
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return items.filter(item => item.product_id).reduce((sum, item) => sum + item.total_price, 0);
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
        const available = availableStock.get(productId) || 0;
        
        // Calculate total quantity for this product across all valid items
        const totalQuantityForProduct = validItems
          .filter(i => String(i.product_id) === productId)
          .reduce((sum, i) => sum + i.quantity, 0);
        
        if (totalQuantityForProduct > available) {
          const product = products.find(p => String(p.id) === productId);
          stockErrors.push(`${product?.name || 'Product'}: ${totalQuantityForProduct} requested, but only ${available} available`);
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
        is_paid: false,
        due_date: dueDate || null,
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
      <div className="space-y-3 sm:space-y-4">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">
            {isEditMode ? (invoiceType === 'sell' ? t('invoiceForm.editSellInvoice') : t('invoiceForm.editBuyInvoice')) : (invoiceType === 'sell' ? t('invoiceForm.newSellInvoice') : t('invoiceForm.newBuyInvoice'))}
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base">
            {isEditMode ? (invoiceType === 'sell' ? t('invoiceForm.editSellInvoice') : t('invoiceForm.editBuyInvoice')) : (invoiceType === 'sell' ? t('invoiceForm.newSellInvoice') : t('invoiceForm.newBuyInvoice'))}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">{t('invoiceForm.invoiceDetails')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="entity-select" className="text-xs sm:text-sm">
                  {invoiceType === 'sell' ? t('invoiceForm.selectCustomer') : t('invoiceForm.selectSupplier')}
                </Label>
                <Select 
                  key={`${invoiceType}-${selectedEntity}-${(invoiceType === 'sell' ? customers : suppliers).length}`}
                  value={selectedEntity || ""} 
                  onValueChange={setSelectedEntity}
                >
                  <SelectTrigger id="entity-select" className="h-9 sm:h-10 text-sm">
                    <SelectValue placeholder={invoiceType === 'sell' ? t('invoiceForm.selectCustomer') : t('invoiceForm.selectSupplier')} />
                  </SelectTrigger>
                  <SelectContent side="bottom" align="start">
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
              
              <div className="space-y-1.5">
                <Label htmlFor="due_date" className="text-xs sm:text-sm">
                  Due Date <span className="text-muted-foreground text-[11px] sm:text-xs">(optional)</span>
                </Label>
                <Input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  placeholder={t("commonPlaceholders.selectDueDate")}
                  className="h-9 sm:h-10 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('invoiceForm.items')}</CardTitle>
              <CardDescription>{t('invoiceForm.addProducts')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Barcode Scanner Section */}
              <div className="border rounded-lg p-3 sm:p-4 bg-muted/30 space-y-3">
                <Label className="text-sm sm:text-base font-semibold">{t('invoiceForm.scanOrEnterBarcode')}</Label>
                <Input
                  ref={barcodeInputRef}
                  placeholder={t('invoiceForm.enterBarcodeOrScan')}
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
                  className="w-full h-10 text-base"
                  disabled={isEditMode}
                />
                <p className="text-xs text-muted-foreground">
                  {isEditMode 
                    ? "Barcode scanning is disabled in edit mode" 
                    : "Scan barcode with scanner or type manually (press Enter to search)"}
                </p>
              </div>
              {items.map((item, index) => {
                const availableQty = invoiceType === 'sell' && item.product_id ? (availableStock.get(String(item.product_id)) || 0) : null;
                const isLowStock = availableQty !== null && availableQty < 10;
                const isOutOfStock = availableQty !== null && availableQty === 0;
                
                return (
                  <div key={index} className="border rounded-lg p-3 sm:p-4 bg-card">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-2 items-end">
                      <div className="md:col-span-3 space-y-1">
                        <Label htmlFor={`product-${index}`} className="text-xs">{t('invoiceForm.product')}</Label>
                        <Select
                          value={item.product_id}
                          onValueChange={(value) => {
                            if (!isEditMode) {
                              handleProductChange(index, value);
                              setActiveItemIndex(index);
                            }
                          }}
                          onOpenChange={(open) => {
                            if (open && !isEditMode) {
                              setActiveItemIndex(index);
                            }
                          }}
                          disabled={isEditMode}
                        >
                          <SelectTrigger id={`product-${index}`} className="h-8 text-sm">
                            <SelectValue placeholder={t('invoiceForm.selectProduct')} />
                          </SelectTrigger>
                          <SelectContent side="bottom" align="start">
                            {products.map((product) => (
                              <SelectItem key={product.id} value={String(product.id)}>
                                <span className="text-muted-foreground text-xs">#{product.id}</span> {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="md:col-span-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">{t('invoiceForm.quantity')}</Label>
                          {invoiceType === 'sell' && item.product_id && availableQty !== null && (
                            <div className="flex items-center gap-1">
                              {isOutOfStock ? (
                                <AlertTriangle className="w-3 h-3 text-destructive" />
                              ) : isLowStock ? (
                                <AlertTriangle className="w-3 h-3 text-warning" />
                              ) : (
                                <Package className="w-3 h-3 text-muted-foreground" />
                              )}
                              <span className={`text-xs ${
                                isOutOfStock ? "text-destructive" : 
                                isLowStock ? "text-warning" : 
                                "text-muted-foreground"
                              }`}>
                                {availableQty}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="1"
                            max={availableQty !== null ? availableQty : undefined}
                            value={isNaN(item.quantity) || item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 1 : parseInt(e.target.value);
                              handleQuantityChange(index, isNaN(val) || val < 1 ? 1 : val);
                            }}
                            className="flex-1 h-8 sm:h-9 text-sm"
                          />
                          <div className="flex flex-col">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-4 w-6 sm:h-4 sm:w-6 rounded-b-none border-b-0 p-0"
                              onClick={() => {
                                const currentQty = isNaN(item.quantity) || item.quantity === 0 ? 1 : item.quantity;
                                const maxQty = availableQty !== null ? availableQty : undefined;
                                const newQty = maxQty !== undefined && currentQty >= maxQty ? currentQty : currentQty + 1;
                                handleQuantityChange(index, newQty);
                              }}
                              disabled={availableQty !== null && item.quantity >= availableQty}
                            >
                              <ChevronUp className="w-2.5 h-2.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-4 w-6 sm:h-4 sm:w-6 rounded-t-none p-0"
                              onClick={() => {
                                const currentQty = isNaN(item.quantity) || item.quantity === 0 ? 1 : item.quantity;
                                const newQty = currentQty > 1 ? currentQty - 1 : 1;
                                handleQuantityChange(index, newQty);
                              }}
                              disabled={item.quantity <= 1}
                            >
                              <ChevronDown className="w-2.5 h-2.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {invoiceType === 'sell' && (
                        <div className="md:col-span-2 space-y-1">
                          <Label htmlFor={`price-type-${index}`} className="text-xs">{t('invoiceForm.priceType')}</Label>
                          <Select
                            value={item.price_type}
                            onValueChange={(value: 'retail' | 'wholesale') => handlePriceTypeChange(index, value)}
                          >
                            <SelectTrigger id={`price-type-${index}`} className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent side="bottom" align="start">
                              <SelectItem value="retail">{t('invoiceForm.retail')}</SelectItem>
                              <SelectItem value="wholesale">{t('invoiceForm.wholesale')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      <div className={`${invoiceType === 'sell' ? 'md:col-span-2' : 'md:col-span-3'} space-y-1`}>
                        <Label className="text-xs">{invoiceType === 'buy' ? t('invoiceForm.cost') : t('invoiceForm.unitPrice')}</Label>
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
                          className={`h-8 text-sm ${invoiceType === 'sell' && !item.is_private_price ? "bg-muted" : ""}`}
                        />
                      </div>
                      
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-xs">{t('invoiceForm.total')}</Label>
                        <Input
                          type="number"
                          value={isNaN(item.total_price) ? '' : item.total_price.toFixed(2)}
                          disabled
                          className="h-8 text-sm bg-muted font-semibold cursor-default"
                        />
                      </div>
                      
                      {items.length > 1 && (
                        <div className="md:col-span-1 flex items-end">
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            onClick={() => removeItem(index)}
                            className="h-8 w-8"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                  {invoiceType === 'sell' && (
                    <div className="space-y-3 border-t pt-3 mt-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`private-${index}`}
                          checked={item.is_private_price}
                          onChange={(e) => handlePrivatePriceToggle(index, e.target.checked)}
                          className="rounded border-input"
                        />
                        <Label htmlFor={`private-${index}`} className="cursor-pointer font-medium">
                          {t('invoiceForm.useCustomPrice')} {item.price_type === 'retail' ? t('invoiceForm.retail') : t('invoiceForm.wholesale')})
                        </Label>
                      </div>
                      
                      {item.is_private_price && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs sm:text-sm">{t('invoiceForm.customPriceAmount')}</Label>
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
                              className="text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs sm:text-sm">{t('invoiceForm.reasonNote')}</Label>
                            <Input
                              type="text"
                              value={item.private_price_note}
                              onChange={(e) => {
                                const newItems = [...items];
                                newItems[index].private_price_note = e.target.value;
                                setItems(newItems);
                              }}
                              placeholder={t('invoiceForm.whyCustomPrice')}
                              className="text-sm"
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
                <Button type="button" variant="outline" onClick={addItem} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('invoiceForm.addItem')}
                </Button>
              )}
              
              <div className="flex justify-end pt-4 border-t">
                <div className="text-right space-y-2">
                  <div className="text-xs sm:text-sm text-muted-foreground">{t('invoiceForm.totalAmount')}</div>
                  <div className="text-2xl sm:text-3xl font-bold">${calculateTotal().toFixed(2)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/invoices")} className="w-full sm:w-auto">
              {t('invoiceForm.cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? (isEditMode ? t('invoiceForm.updating') : t('invoiceForm.creating')) : (isEditMode ? t('invoiceForm.updateInvoice') : t('invoiceForm.createInvoice'))}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default InvoiceForm;
