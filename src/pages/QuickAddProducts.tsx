import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scan, Package, CheckCircle2, ArrowRight, Hash, Zap, Lightbulb, ListChecks } from "lucide-react";
import { productsRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { normalizeBarcodeOrSku } from "@/utils/barcodeSkuUtils";
import ProductNameWithCode from "@/components/ProductNameWithCode";

const QuickAddProducts = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<'barcode' | 'sku'>('barcode');
  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentProducts, setRecentProducts] = useState<any[]>([]);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const skuInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount and when mode changes
  useEffect(() => {
    if (mode === 'barcode') {
      barcodeInputRef.current?.focus();
    } else {
      skuInputRef.current?.focus();
    }
  }, [mode]);

  // Handle barcode scanner input (usually ends with Enter)
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // If barcode is entered, move to name field
      if (barcode.trim()) {
        nameInputRef.current?.focus();
      }
    }
  };

  // Handle SKU scanner input (usually ends with Enter)
  const handleSkuKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // If SKU is entered, move to name field
      if (sku.trim()) {
        nameInputRef.current?.focus();
      }
    }
  };

  // Handle name input (Enter saves)
  const handleNameKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (mode === 'barcode' && name.trim() && barcode.trim()) {
        await handleSubmit();
      } else if (mode === 'sku' && name.trim() && sku.trim()) {
        await handleSubmit();
      }
    }
  };

  const fetchRecentProducts = async () => {
    try {
      const productsResponse = await productsRepo.list({ limit: 1000 });
      const products = Array.isArray(productsResponse) ? productsResponse : productsResponse.data;
      // Sort by ID descending (newest first) and get top 5
      const sorted = [...products].sort((a, b) => {
        return (b.id || 0) - (a.id || 0); // Descending order (highest ID = newest)
      });
      setRecentProducts(sorted.slice(0, 5));
    } catch (error) {
      // Silently fail - not critical
      console.error('Error fetching recent products:', error);
    }
  };

  useEffect(() => {
    fetchRecentProducts();
  }, []);

  const handleSubmit = async () => {
    if (mode === 'barcode') {
      if (!barcode.trim() || !name.trim()) {
        toast({
          title: "Error",
          description: "Both barcode and name are required",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (!sku.trim() || !name.trim()) {
        toast({
          title: "Error",
          description: "Both SKU and name are required",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'barcode') {
        // Normalize barcode before sending to API (removes all spaces, converts to uppercase)
        const normalizedBarcode = normalizeBarcodeOrSku(barcode);
        if (!normalizedBarcode) {
          toast({
            title: "Error",
            description: "Barcode is required",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        await productsRepo.quickAdd({
          barcode: normalizedBarcode,
          name: name.trim(),
        });
      } else {
        // Normalize SKU before sending to API (removes all spaces, converts to uppercase)
        const normalizedSku = normalizeBarcodeOrSku(sku);
        if (!normalizedSku) {
          toast({
            title: "Error",
            description: "SKU is required",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        await productsRepo.quickAddSku({
          sku: normalizedSku,
          name: name.trim(),
        });
      }
      
      toast({
        title: "Success",
        description: `Product "${name.trim()}" added successfully!`,
      });

      // Reset form
      setBarcode("");
      setSku("");
      setName("");
      
      // Refocus input for next scan
      setTimeout(() => {
        if (mode === 'barcode') {
          barcodeInputRef.current?.focus();
        } else {
          skuInputRef.current?.focus();
        }
        fetchRecentProducts();
      }, 100);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add product",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-2 sm:space-y-3 animate-fade-in">
        <InvoicePageHeader
          icon={Zap}
          title="Quick Add Products"
          description="Scan barcode or SKU and enter name to quickly register products"
          actions={
          <Button
            variant="outline"
            onClick={() => navigate("/products")}
            className="gap-1 h-8 text-[12px]"
          >
            <ArrowRight className="w-3 h-3" />
            <span className="hidden sm:inline">View All Products</span>
            <span className="sm:hidden">View All</span>
          </Button>
          }
        />

        <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
          {/* Quick Add Form */}
          <SectionCard
            icon={mode === 'barcode' ? Scan : Hash}
            title="Quick Add Product"
            description={`Optimized for ${mode === 'barcode' ? 'barcode' : 'SKU'} scanner workflow`}
            bodyClassName="space-y-3"
          >
              {/* Mode Toggle */}
              <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
                <Button
                  type="button"
                  variant={mode === 'barcode' ? 'default' : 'ghost'}
                  onClick={() => {
                    setMode('barcode');
                    setBarcode("");
                    setSku("");
                    setName("");
                    setTimeout(() => barcodeInputRef.current?.focus(), 100);
                  }}
                  className="flex-1 h-7 text-[12px]"
                >
                  <Scan className="w-3 h-3 me-1" />
                  Barcode
                </Button>
                <Button
                  type="button"
                  variant={mode === 'sku' ? 'default' : 'ghost'}
                  onClick={() => {
                    setMode('sku');
                    setBarcode("");
                    setSku("");
                    setName("");
                    setTimeout(() => skuInputRef.current?.focus(), 100);
                  }}
                  className="flex-1 h-7 text-[12px]"
                >
                  <Hash className="w-3 h-3 me-1" />
                  SKU
                </Button>
              </div>

              {mode === 'barcode' ? (
                <div className="space-y-1">
                  <Label htmlFor="barcode" className="text-[11px] font-medium">
                    Barcode <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="barcode"
                    ref={barcodeInputRef}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={handleBarcodeKeyDown}
                    placeholder="Scan or enter barcode"
                    className="h-8 text-[13px]"
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Scan barcode with scanner (press Enter to continue)
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="sku" className="text-[11px] font-medium">
                    SKU <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sku"
                    ref={skuInputRef}
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    onKeyDown={handleSkuKeyDown}
                    placeholder="Scan or enter SKU"
                    className="h-8 text-[13px]"
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Scan SKU with scanner (press Enter to continue)
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="name" className="text-[11px] font-medium">
                  Product Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  placeholder="Enter product name"
                  className="h-8 text-[13px]"
                />
                <p className="text-[11px] text-muted-foreground">
                  Enter name and press Enter to save
                </p>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={loading || (mode === 'barcode' ? (!barcode.trim() || !name.trim()) : (!sku.trim() || !name.trim()))}
                className="w-full h-8 text-[13px] font-semibold gradient-primary hover:shadow-glow"
              >
                {loading ? (
                  "Saving..."
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 me-1.5" />
                    Save Product
                  </>
                )}
              </Button>

              <div className="pt-2 border-t">
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground text-center">
                  <Lightbulb className="w-3.5 h-3.5 shrink-0 text-warning-strong" aria-hidden="true" />
                  Tip: After saving, {mode === 'barcode' ? 'barcode' : 'SKU'} field will auto-focus for next scan
                </p>
              </div>
          </SectionCard>

          {/* Recent Products */}
          <SectionCard
            icon={Package}
            title="Recently Added"
            description="Last 5 products you added"
          >
              {recentProducts.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-[12px]">No products added yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentProducts.map((product) => (
                    <div
                      key={product.id}
                      className="p-2 border border-border rounded-lg hover:bg-primary/5 transition-colors"
                    >
                      <p className="font-medium text-[13px] truncate mb-0.5">
                        <ProductNameWithCode 
                          product={product}
                          nameClassName="font-medium"
                          codeClassName="text-[11px] text-muted-foreground font-mono ms-1.5"
                        />
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {product.barcode && `Barcode: ${product.barcode}`}
                        {product.barcode && product.sku && " • "}
                        {product.sku && `SKU: ${product.sku}`}
                        {!product.barcode && !product.sku && "No identifier"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
          </SectionCard>
        </div>

        {/* Instructions */}
        <SectionCard icon={ListChecks} title="Workflow Instructions" className="bg-muted/20">
            <ol className="list-decimal list-inside space-y-1 text-[12px] text-muted-foreground">
              <li>Open this page and choose Barcode or SKU mode</li>
              <li>Scan the product barcode/SKU (auto-fills the field)</li>
              <li>Press Enter or Tab to move to name field</li>
              <li>Type the product name</li>
              <li>Press Enter or click Save to register the product</li>
              <li>The identifier field auto-focuses for the next scan</li>
              <li>Add full details (category, description, prices) later in Products page</li>
            </ol>
        </SectionCard>
      </div>
    </DashboardLayout>
  );
};

export default QuickAddProducts;

