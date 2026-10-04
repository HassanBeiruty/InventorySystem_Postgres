import { Fragment, useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, AlertTriangle, User, Truck, CalendarDays, ScanBarcode, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { productsRepo, customersRepo, suppliersRepo, invoicesRepo, productPricesRepo, inventoryRepo, packagesRepo, type PackageEntity } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { InvoiceFormItem } from "@/components/invoice/types";
import { PackageLineGroup } from "@/components/invoice/PackageLineGroup";
import { ProductSearchBar, type ProductSearchInfo } from "@/components/invoice/ProductSearchBar";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { FieldLabel } from "@/components/page-ui/FieldLabel";
import { QtyStepper } from "@/components/page-ui/QtyStepper";
import { TotalSummary } from "@/components/page-ui/TotalSummary";
import {
  applyPackage,
  collectPackageGroups,
  createPackageLines,
  findPackageConflicts,
  findPackageStockShortages,
  regroupLoadedLines,
  removePackage,
} from "@/utils/invoicePackageLines";

type InvoiceItem = InvoiceFormItem;

/** Grid columns of an invoice line and of the column headings above the lines (lg and up). */
const LINE_COLUMNS = {
  sell: "lg:grid-cols-[minmax(0,1fr)_136px_116px_108px_108px_32px]",
  buy: "lg:grid-cols-[minmax(0,1fr)_136px_132px_120px_32px]",
} as const;

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
    setItems([]);
    // When switching between buy/sell, focus the product search for fast scanning
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  }, [location.pathname, isEditMode]);
  const [products, setProducts] = useState<any[]>([]);
  // Named packages; offered in the product search on SELL invoices only
  const [packages, setPackages] = useState<PackageEntity[]>([]);
  const [latestPrices, setLatestPrices] = useState<Record<string, { wholesale_price: number | null; retail_price: number | null }>>({});
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [availableStock, setAvailableStock] = useState<Map<string, number>>(new Map());
  // False until today's stock has loaded, so the search doesn't show every product as out of stock
  const [stockReady, setStockReady] = useState(false);

  const [selectedEntity, setSelectedEntity] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const [paidDirectly, setPaidDirectly] = useState<boolean>(true);
  const [partialPaidAmount, setPartialPaidAmount] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Lines are added from the product search only, so the list never holds empty rows
  const [items, setItems] = useState<InvoiceItem[]>([]);
  // The line to highlight after it was added or increased (tick restarts the same line)
  const [flash, setFlash] = useState<{ index: number; tick: number } | null>(null);
  const lineRefs = useRef<Record<number, HTMLElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    
    const initializeData = async () => {
      try {
        const [prodsResponse, custs, supps, latest, pkgs] = await Promise.all([
          productsRepo.list({ limit: 1000 }),
          customersRepo.list(),
          suppliersRepo.list(),
          productPricesRepo.latestAll(),
          packagesRepo.list().catch(() => [] as PackageEntity[]),
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
        setPackages(pkgs || []);
        setCustomers(customersList);
        setSuppliers(supps || []);
        
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
  
  // Available stock: sell invoices enforce it, buy invoices only show it in the product search.
  // Reloaded whenever the invoice type changes: the same form instance is reused when navigating
  // from a buy or edit invoice to a new sell invoice, so loading it once on mount left every
  // product at 0 available.
  useEffect(() => {
    let cancelled = false;
    setStockReady(false);
    inventoryRepo.today()
      .then((rows) => {
        if (cancelled) return;
        const stockMap = new Map<string, number>();
        (rows || []).forEach((row: any) => {
          stockMap.set(String(row.product_id), Number(row.available_qty) || 0);
        });
        setAvailableStock(stockMap);
        setStockReady(true);
      })
      .catch((error: any) => {
        if (cancelled) return;
        toast({ title: "Error", description: `Failed to load stock. ${error.message}`, variant: "destructive" });
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceType, id, toast]);

  // Reset hasPayments when creating a new invoice
  useEffect(() => {
    if (!isEditMode) {
      setHasPayments(false);
    }
  }, [isEditMode]);
  
  useEffect(() => {
    if (selectedEntity) {
      const entityList = invoiceType === 'sell' ? customers : suppliers;
      const found = entityList.find(e => String(e.id) === selectedEntity);
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
            ...(item.package_id != null ? {
              package_id: String(item.package_id),
              package_name: item.package_name || "",
              package_qty: Number(item.package_qty) || 1,
              package_price: Number(item.package_price) || 0,
            } : {}),
          };
        });
        // Package lines are shown together under their package
        setItems(regroupLoadedLines(loadedItems));
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

  // Build a fresh invoice item row for a product, applying default pricing
  // exactly like a manual product selection (retail price for sell, 0 for buy).
  const buildRowForProduct = (productId: string): InvoiceItem => {
    let unitPrice = 0;
    const priceType: 'retail' | 'wholesale' = invoiceType === 'sell' ? 'retail' : 'wholesale';
    if (invoiceType === 'sell') {
      const lp = latestPrices[productId];
      unitPrice = lp?.retail_price != null ? Number(lp.retail_price) : 0;
    }
    return {
      product_id: productId,
      quantity: 1,
      unit_price: unitPrice,
      price_type: priceType,
      total_price: unitPrice,
      is_private_price: false,
      private_price_amount: 0,
      private_price_note: "",
      barcode: "",
    };
  };

  // ----- Packages (SELL only) -----
  // A package is a run of ordinary private-price lines sharing a package_id. The user changes
  // only the package qty and price; the lines' quantities and private prices follow.
  const packageGroups = useMemo(() => collectPackageGroups(items), [items]);
  const productsById = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);
  const productName = (productId: string) => productsById.get(String(productId))?.name || `Product #${productId}`;

  const warnPackageShortages = (shortages: Array<{ productId: string; requested: number; available: number }>) => {
    toast({
      title: "Insufficient Stock",
      description: shortages
        .map((s) => `${productName(s.productId)}: ${s.requested} needed, only ${s.available} available`)
        .join('\n'),
      variant: "destructive",
    });
  };

  // ----- Adding lines -----
  // The product search is the only way to add lines. A product appears once per invoice:
  // choosing one that is already its own line adds 1 to it, and choosing a package that is
  // already on the invoice sells one more package. New lines go to the top, right under the
  // search. Each returns false when nothing was added (the reason is toasted), so the search
  // keeps what was typed.

  const flashLine = (index: number) => setFlash((prev) => ({ index, tick: (prev?.tick ?? 0) + 1 }));

  const warnIfUnpriced = (product: { id: number | string; name?: string }) => {
    if (invoiceType !== 'sell' || latestPrices[String(product.id)]?.retail_price != null) return;
    toast({
      title: "Price Not Set",
      description: `Product "${product.name}" has no price set. Please add a price in the Product Prices page before selling this product.`,
      variant: "destructive",
    });
  };

  const addProductFromSearch = (productId: string): boolean => {
    const product = productsById.get(productId);
    if (!product || isEditMode) return false;

    const existingIndex = items.findIndex((item) => String(item.product_id) === productId);
    if (existingIndex !== -1) {
      const existing = items[existingIndex];
      if (existing.package_id) {
        toast({
          title: "Already in a package",
          description: `"${product.name}" is part of the package "${existing.package_name}". Change the package qty instead.`,
          variant: "destructive",
        });
        return false;
      }
      const quantity = existing.quantity + 1;
      if (!handleQuantityChange(existingIndex, quantity)) return false;
      flashLine(existingIndex);
      toast({ title: "Quantity increased", description: `"${product.name}" is now ${quantity} on this invoice.` });
      return true;
    }

    const available = stockReady ? getEffectiveAvailableStock(productId) : null;
    if (available !== null && available <= 0) {
      toast({ title: "Out of Stock", description: `"${product.name}" has no stock available to sell.`, variant: "destructive" });
      return false;
    }

    setItems([buildRowForProduct(productId), ...items]);
    flashLine(0);
    warnIfUnpriced(product);
    return true;
  };

  const addPackageFromSearch = (packageId: string): boolean => {
    const pkg = packages.find((p) => String(p.id) === packageId);
    if (!pkg || isEditMode || invoiceType !== 'sell') return false;

    // Already on the invoice: sell one more package instead of adding its products twice
    const existing = packageGroups.get(packageId);
    if (existing) {
      const qty = existing.qty + 1;
      if (!handlePackageQtyChange(packageId, qty)) return false;
      flashLine(existing.indexes[0]);
      toast({ title: "Package already on the invoice", description: `"${pkg.name}" quantity increased to ${qty}.` });
      return true;
    }

    // One product per invoice: a package can't reuse a product that is already on it
    const conflicts = findPackageConflicts(items, pkg);
    if (conflicts.length > 0) {
      toast({
        title: `Can't add "${pkg.name}"`,
        description: conflicts
          .map((c) => `${productName(c.productId)} is already on this invoice${c.inPackage !== null ? ` in package "${c.inPackage}"` : ''}`)
          .join('. ') + '. Each product can appear only once per invoice.',
        variant: "destructive",
      });
      return false;
    }

    const next = [...createPackageLines(pkg, buildRowForProduct), ...items];
    setItems(next);
    flashLine(0);

    const shortages = findPackageStockShortages(next, packageId, 1, (pid, i) => getEffectiveAvailableStock(pid, i, next));
    if (shortages.length > 0) {
      warnPackageShortages(shortages);
    } else {
      toast({
        title: "Package added",
        description: `"${pkg.name}" added at $${Number(pkg.default_price).toFixed(2)}. Change the package qty or price to update its lines.`,
      });
    }
    return true;
  };

  const handleSearchNotFound = (query: string) => {
    toast({
      title: "Product Not Available",
      description: `No product matches "${query}". Check the barcode or SKU, or search by name.`,
      variant: "info",
    });
  };

  // The column headings sit above the first line that isn't part of a package
  const firstLineIndex = items.findIndex((item) => !item.package_id);

  // Where each product already sits on the invoice, for the search results
  const placementByProduct = useMemo(() => {
    const placement = new Map<string, { packageName: string | null }>();
    items.forEach((item) => {
      if (item.product_id) placement.set(String(item.product_id), { packageName: item.package_id ? item.package_name || "" : null });
    });
    return placement;
  }, [items]);

  const describeProduct = (productId: string): ProductSearchInfo => {
    const prices = latestPrices[productId];
    const price = invoiceType === 'sell' ? prices?.retail_price : prices?.wholesale_price;
    return {
      stock: !stockReady ? null : invoiceType === 'sell' ? getEffectiveAvailableStock(productId) : availableStock.get(productId) ?? 0,
      price: price != null ? Number(price) : null,
      onInvoice: placementByProduct.get(productId) ?? null,
    };
  };

  /** Returns false when the stock check rejects the new qty. */
  const handlePackageQtyChange = (packageId: string, qty: number): boolean => {
    const shortages = findPackageStockShortages(items, packageId, qty, (pid, i) => getEffectiveAvailableStock(pid, i));
    if (shortages.length > 0) {
      warnPackageShortages(shortages);
      return false; // Don't update quantity
    }
    setItems(applyPackage(items, packageId, { qty }));
    return true;
  };

  const handlePackagePriceChange = (packageId: string, price: number) => {
    setItems(applyPackage(items, packageId, { price }));
  };

  const handleRemovePackage = (packageId: string) => {
    if (hasPayments) {
      return; // Same rule as removeItem
    }
    setItems(removePackage(items, packageId));
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

  /** Returns false when the stock check rejects the new quantity. */
  const handleQuantityChange = (index: number, quantity: number): boolean => {
    if (invoiceType === 'sell' && items[index].product_id) {
      const productId = String(items[index].product_id);
      const effectiveAvailable = getEffectiveAvailableStock(productId, index);

      if (effectiveAvailable !== null && quantity > effectiveAvailable) {
        toast({
          title: "Insufficient Stock",
          description: `Only ${effectiveAvailable} units available for this product (after accounting for items already in invoice).`,
          variant: "destructive",
        });
        return false; // Don't update quantity
      }
    }

    const newItems = [...items];
    newItems[index].quantity = quantity;
    const effectivePrice = newItems[index].is_private_price
      ? newItems[index].private_price_amount
      : newItems[index].unit_price;
    newItems[index].total_price = effectivePrice * quantity;
    setItems(newItems);
    return true;
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
  const getEffectiveAvailableStock = (productId: string, excludeIndex?: number, list: InvoiceItem[] = items) => {
    if (invoiceType !== 'sell' || !productId) return null;
    const baseAvailable = availableStock.get(String(productId)) || 0;

    // Calculate total quantity of this product already in invoice items (excluding current item)
    const totalInInvoice = list.reduce((sum, item, idx) => {
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

  // Auto-focus the product search when the form is ready, so a scanner works straight away
  useEffect(() => {
    if (!pageLoading && !isEditMode) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [pageLoading, isEditMode, invoiceType]);

  // Briefly ring the line that was just added or increased
  useEffect(() => {
    if (!flash || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    lineRefs.current[flash.index]?.animate(
      [{ boxShadow: `0 0 0 4px hsl(${primary} / 0.4)` }, { boxShadow: `0 0 0 4px hsl(${primary} / 0)` }],
      { duration: 1400, easing: "ease-out" },
    );
  }, [flash]);


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
      // Package lines are priced by their package: a line may get $0 (e.g. a free accessory),
      // but the package itself must have a price
      const unpricedPackages = [...packageGroups.values()].filter((group) => !(group.price > 0));
      if (unpricedPackages.length > 0) {
        toast({
          title: "Package Price Required",
          description: `Enter a price above 0 for: ${unpricedPackages.map((group) => group.name).join(', ')}.`,
          variant: "destructive",
        });
        return;
      }

      const itemsWithoutPrice: string[] = [];
      validItems.forEach((item) => {
        if (item.package_id) return;
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
      validItems.forEach((item) => {
        if (!item.product_id) return;
        const productId = String(item.product_id);
        // Exclude the line itself by its position in `items` (validItems skips empty rows)
        const effectiveAvailable = getEffectiveAvailableStock(productId, items.indexOf(item));
        
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

    // Validate partial payment amount (only for new invoices that are not paid directly)
    if (!isEditMode && !paidDirectly && partialPaidAmount > 0) {
      const totalAmount = calculateTotal();
      if (partialPaidAmount < 0) {
        toast({
          title: "Invalid Partial Payment",
          description: "Partial paid amount cannot be negative.",
          variant: "destructive",
        });
        return;
      }
      if (partialPaidAmount >= totalAmount) {
        toast({
          title: "Invalid Partial Payment",
          description: `Partial paid amount must be less than the total amount ($${totalAmount.toFixed(2)}). To fully pay the invoice, use "Mark as paid directly".`,
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
        // Partial payment only applies to new invoices that are not paid directly
        partial_paid_amount: !isEditMode && !paidDirectly ? partialPaidAmount : 0,
        items: validItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          price_type: item.price_type,
          is_private_price: item.is_private_price,
          private_price_amount: item.is_private_price ? item.private_price_amount : null,
          private_price_note: item.is_private_price ? item.private_price_note : null,
          ...(item.package_id ? {
            package_id: Number(item.package_id),
            package_name: item.package_name,
            package_qty: item.package_qty,
            package_price: item.package_price,
          } : {}),
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
              <p className="text-muted-foreground">{t('invoiceForm.loadingInvoiceForm')}</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-3">
        <InvoicePageHeader
          icon={invoiceType === 'sell' ? TrendingUp : TrendingDown}
          title={isEditMode ? (invoiceType === 'sell' ? t('invoiceForm.editSellInvoice') : t('invoiceForm.editBuyInvoice')) : (invoiceType === 'sell' ? t('invoiceForm.newSellInvoice') : t('invoiceForm.newBuyInvoice'))}
          description={isEditMode
            ? (invoiceType === 'sell' ? t('invoiceForm.editSellInvoiceDescription') : t('invoiceForm.editBuyInvoiceDescription'))
            : (invoiceType === 'sell' ? t('invoiceForm.newSellInvoiceDescription') : t('invoiceForm.newBuyInvoiceDescription'))}
        />

        <form onSubmit={handleSubmit} className="space-y-3">
          <SectionCard title={t('invoiceForm.invoiceDetails')}>
              <div className="grid gap-3 sm:grid-cols-2 items-start">
                {/* Supplier */}
                <div className="space-y-1">
                  <FieldLabel htmlFor="entity-select" icon={invoiceType === 'sell' ? User : Truck}>
                    {invoiceType === 'sell' ? 'Customer' : 'Supplier'}
                  </FieldLabel>
                  <Select 
                    key={`${invoiceType}-${selectedEntity}-${(invoiceType === 'sell' ? customers : suppliers).length}`}
                    value={selectedEntity || ""} 
                    onValueChange={setSelectedEntity}
                  >
                    <SelectTrigger id="entity-select" className="h-8 text-[13px]">
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
                <div className="space-y-1">
                  <FieldLabel htmlFor="due_date" icon={CalendarDays} hint="(optional)">
                    Due Date
                  </FieldLabel>
                  <Input
                    id="due_date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    placeholder={t("commonPlaceholders.selectDueDate")}
                    className="h-8 text-[13px]"
                  />
                </div>
              </div>
              
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="paid-directly"
                    checked={paidDirectly}
                    onChange={(e) => {
                      setPaidDirectly(e.target.checked);
                      if (e.target.checked) setPartialPaidAmount(0);
                    }}
                    className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                    disabled={isEditMode}
                  />
                  <Label htmlFor="paid-directly" className="flex cursor-pointer items-center gap-1.5 text-[12px] font-medium">
                    <Wallet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    Mark as paid directly (invoice will be fully paid on creation)
                  </Label>
                </div>
                {!isEditMode && !paidDirectly && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="partial-paid-amount" className="text-[12px] font-medium whitespace-nowrap">
                      Partial paid (USD)
                    </Label>
                    <Input
                      id="partial-paid-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      max={calculateTotal()}
                      value={partialPaidAmount === 0 ? "" : partialPaidAmount}
                      onChange={(e) => setPartialPaidAmount(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-28 h-8 text-[13px] tabular-nums"
                    />
                  </div>
                )}
              </div>
              {!isEditMode && !paidDirectly && (
                <p className="text-[11px] text-muted-foreground">
                  {partialPaidAmount > 0
                    ? partialPaidAmount >= calculateTotal()
                      ? `Must be less than the total ($${calculateTotal().toFixed(2)})`
                      : `Invoice will be marked partially paid ($${partialPaidAmount.toFixed(2)} of $${calculateTotal().toFixed(2)})`
                    : "Leave as 0 for an unpaid (pending) invoice"}
                </p>
              )}
              {isEditMode && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning-strong" aria-hidden="true" />
                  Payment status cannot be changed in edit mode
                </p>
              )}
          </SectionCard>

          <SectionCard
            title={t('invoiceForm.items')}
            description={t('productSearch.itemsDescription', 'Search or scan to add. Each product appears once per invoice.')}
            meta={`${items.length} ${items.length === 1 ? 'item' : 'items'}`}
          >
              <ProductSearchBar
                ref={searchInputRef}
                products={products}
                packages={packages}
                invoiceType={invoiceType}
                describe={describeProduct}
                isPackageOnInvoice={(packageId) => packageGroups.has(packageId)}
                onAddProduct={addProductFromSearch}
                onAddPackage={addPackageFromSearch}
                onNotFound={handleSearchNotFound}
                disabled={isEditMode}
              />

              {items.length === 0 && (
                <div className="flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-border px-4 py-8 text-center">
                  <ScanBarcode className="mb-1 h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  <p className="text-[13px] font-semibold">{t('productSearch.emptyTitle', 'No products on this invoice yet')}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {invoiceType === 'sell'
                      ? t('productSearch.emptyHintSell', 'Search or scan above to add a product or package.')
                      : t('productSearch.emptyHintBuy', 'Search or scan above to add a product.')}
                  </p>
                </div>
              )}

              {items.map((item, index) => {
                // A package renders once, at its first line, as one group
                if (item.package_id) {
                  const group = packageGroups.get(item.package_id);
                  if (!group || group.indexes[0] !== index) return null;
                  const pkg = packages.find((p) => String(p.id) === group.packageId);
                  return (
                    <div key={`package-${group.packageId}`} ref={(el) => { lineRefs.current[index] = el; }} className="rounded-xl">
                      <PackageLineGroup
                        group={group}
                        defaultPrice={pkg ? Number(pkg.default_price) : null}
                        productsById={productsById}
                        getAvailable={(productId, lineIndex) => getEffectiveAvailableStock(productId, lineIndex)}
                        canRemove={!hasPayments}
                        onQtyChange={(qty) => handlePackageQtyChange(group.packageId, qty)}
                        onPriceChange={(price) => handlePackagePriceChange(group.packageId, price)}
                        onRemove={() => handleRemovePackage(group.packageId)}
                      />
                    </div>
                  );
                }

                const product = productsById.get(String(item.product_id));
                const code = product?.barcode || product?.sku || "";
                const availableQty = getEffectiveAvailableStock(String(item.product_id), index);
                const isLowStock = availableQty !== null && availableQty < 10;
                const isOutOfStock = availableQty !== null && availableQty === 0;

                return (
                  <Fragment key={index}>
                  {index === firstLineIndex && (
                    // One row of column headings on wide screens; each field keeps its own label for screen readers
                    <div aria-hidden="true" className={cn("hidden gap-2 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground lg:grid", LINE_COLUMNS[invoiceType])}>
                      <span>{t('invoiceForm.product')}</span>
                      <span>{t('invoiceForm.quantity')}</span>
                      {invoiceType === 'sell' && <span>{t('invoiceForm.priceType')}</span>}
                      <span>{invoiceType === 'buy' ? t('invoiceForm.cost') : t('invoiceForm.unitPrice')}</span>
                      <span>{t('invoiceForm.total')}</span>
                    </div>
                  )}
                  <div
                    ref={(el) => { lineRefs.current[index] = el; }}
                    className="relative rounded-xl border-2 border-border bg-card p-2.5 transition-shadow hover:shadow-sm"
                  >
                    <div className={cn("grid grid-cols-2 items-end gap-2 lg:items-center", LINE_COLUMNS[invoiceType])}>
                      <div className="col-span-2 min-w-0 pe-10 lg:col-span-1 lg:pe-0">
                        <div className="truncate text-[13px] font-semibold" title={productName(item.product_id)}>
                          {productName(item.product_id)}
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                          {code && <span className="truncate font-mono">{code}</span>}
                          <span className="shrink-0 tabular-nums">{code && '· '}#{item.product_id}</span>
                          {availableQty !== null && (
                            <span
                              title="Available stock"
                              className={cn(
                                "flex shrink-0 items-center gap-1 tabular-nums",
                                isOutOfStock ? "font-semibold text-destructive-strong" : isLowStock && "font-semibold text-warning-strong",
                              )}
                            >
                              <span aria-hidden="true">·</span>
                              {(isOutOfStock || isLowStock) && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                              {t('productSearch.available', '{{count}} available', { count: availableQty })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 lg:space-y-0">
                        <Label htmlFor={`qty-${index}`} className="text-[11px] font-medium lg:sr-only">{t('invoiceForm.quantity')}</Label>
                        <QtyStepper
                          id={`qty-${index}`}
                          value={isNaN(item.quantity) || item.quantity < 1 ? 1 : item.quantity}
                          max={availableQty !== null ? availableQty : undefined}
                          onChange={(qty) => handleQuantityChange(index, qty)}
                        />
                      </div>

                      {invoiceType === 'sell' && (
                        <div className="space-y-1 lg:space-y-0">
                          <Label htmlFor={`price-type-${index}`} className="text-[11px] font-medium lg:sr-only">{t('invoiceForm.priceType')}</Label>
                          <Select
                            value={item.price_type}
                            onValueChange={(value: 'retail' | 'wholesale') => handlePriceTypeChange(index, value)}
                          >
                            <SelectTrigger id={`price-type-${index}`} className="h-8 text-[13px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent side="bottom" align="start" className="max-h-[50vh] overflow-y-auto">
                              <SelectItem value="retail">{t('invoiceForm.retail')}</SelectItem>
                              <SelectItem value="wholesale">{t('invoiceForm.wholesale')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-1 lg:space-y-0">
                        <Label htmlFor={`unit-price-${index}`} className="text-[11px] font-medium lg:sr-only">
                          {invoiceType === 'buy' ? t('invoiceForm.cost') : t('invoiceForm.unitPrice')}
                        </Label>
                        <Input
                          id={`unit-price-${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={isNaN(item.unit_price) ? '' : invoiceType === 'sell' && !item.is_private_price ? item.unit_price.toFixed(2) : item.unit_price}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            handleUnitPriceChange(index, isNaN(val) ? 0 : val);
                          }}
                          disabled={invoiceType === 'sell' && !item.is_private_price}
                          placeholder={invoiceType === 'buy' ? t('invoiceForm.enterCost') : ''}
                          className={`h-8 text-[13px] tabular-nums ${invoiceType === 'sell' && !item.is_private_price ? "bg-muted" : ""}`}
                        />
                      </div>

                      <div className="space-y-1 lg:space-y-0">
                        <Label htmlFor={`total-${index}`} className="text-[11px] font-medium lg:sr-only">{t('invoiceForm.total')}</Label>
                        <Input
                          id={`total-${index}`}
                          type="number"
                          value={isNaN(item.total_price) ? '' : item.total_price.toFixed(2)}
                          disabled
                          className="h-8 text-[13px] bg-muted font-semibold tabular-nums cursor-default"
                        />
                      </div>

                      {/* Top corner of the card on small screens, last column on wide ones */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        disabled={hasPayments}
                        aria-label={`Remove ${productName(item.product_id)}`}
                        title={
                          hasPayments
                            ? "Cannot remove items from invoice with payments. Remove all payments first."
                            : "Remove item"
                        }
                        className="absolute end-2 top-2 h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:static"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                  {invoiceType === 'sell' && (
                    <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id={`private-${index}`}
                          checked={item.is_private_price}
                          onChange={(e) => handlePrivatePriceToggle(index, e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-[hsl(var(--primary))]"
                        />
                        <Label htmlFor={`private-${index}`} className="cursor-pointer text-[12px] font-medium">
                          {t('invoiceForm.useCustomPrice')} {item.price_type === 'retail' ? t('invoiceForm.retail') : t('invoiceForm.wholesale')})
                        </Label>
                      </div>
                      
                      {item.is_private_price && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px] font-medium">{t('invoiceForm.customPriceAmount')}</Label>
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
                              className="h-8 text-[13px]"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] font-medium">{t('invoiceForm.reasonNote')}</Label>
                            <Input
                              type="text"
                              value={item.private_price_note}
                              onChange={(e) => {
                                const newItems = [...items];
                                newItems[index].private_price_note = e.target.value;
                                setItems(newItems);
                              }}
                              placeholder={t('invoiceForm.whyCustomPrice')}
                              className="h-8 text-[13px]"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                  </Fragment>
                );
              })}

              <div className="flex border-t border-border pt-3">
                <TotalSummary label={t('invoiceForm.totalAmount')} amount={calculateTotal()} />
              </div>
          </SectionCard>

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/invoices")} className="w-full sm:w-auto h-9 px-4 text-[13px] border-2 hover:bg-muted">
              {t('invoiceForm.cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto h-9 px-5 text-[13px] font-semibold shadow-md hover:shadow-lg transition-all">
              {loading ? (isEditMode ? t('invoiceForm.updating') : t('invoiceForm.creating')) : (isEditMode ? t('invoiceForm.updateInvoice') : t('invoiceForm.createInvoice'))}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default InvoiceForm;
