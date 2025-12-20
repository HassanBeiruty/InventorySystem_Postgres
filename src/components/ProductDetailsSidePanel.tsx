import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { productsRepo, productPricesRepo, inventoryRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";

interface ProductDetails {
  id: number;
  name: string;
  barcode: string | null;
  sku: string | null;
  shelf: string | null;
  description: string | null;
  category_id: number | null;
  category_name?: string | null;
  created_at: string;
}

interface ProductDetailsSidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
}

export default function ProductDetailsSidePanel({ open, onOpenChange, productId }: ProductDetailsSidePanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [latestPrice, setLatestPrice] = useState<{ wholesale_price: number | null; retail_price: number | null; effective_date: string | null } | null>(null);
  const [stockInfo, setStockInfo] = useState<{ available_qty: number; avg_cost: number } | null>(null);

  useEffect(() => {
    if (open && productId) {
      fetchProductDetails();
    } else if (!open) {
      // Reset state when panel closes
      setProduct(null);
      setLatestPrice(null);
      setStockInfo(null);
    }
  }, [open, productId]);

  const fetchProductDetails = async () => {
    setLoading(true);
    try {
      // Fetch product details
      const products = await productsRepo.list();
      const foundProduct = products.find((p: any) => String(p.id) === productId);
      
      if (!foundProduct) {
        toast({
          title: "Error",
          description: "Product not found",
          variant: "destructive",
        });
        onOpenChange(false);
        return;
      }

      setProduct(foundProduct);

      // Fetch latest price
      try {
        const price = await productPricesRepo.latestForProduct(productId);
        if (price) {
          setLatestPrice({
            wholesale_price: price.wholesale_price,
            retail_price: price.retail_price,
            effective_date: price.effective_date,
          });
        }
      } catch (error) {
        // Price not found is okay
        setLatestPrice(null);
      }

      // Fetch stock info
      try {
        const stockData = await inventoryRepo.today();
        const productStock = stockData.find((item: any) => String(item.product_id) === productId);
        if (productStock) {
          // Record exists - use actual values (even if 0)
          setStockInfo({
            available_qty: productStock.available_qty !== null && productStock.available_qty !== undefined 
              ? Number(productStock.available_qty) 
              : 0,
            avg_cost: productStock.avg_cost !== null && productStock.avg_cost !== undefined 
              ? Number(productStock.avg_cost) 
              : 0,
          });
        } else {
          // No record in daily_stock - set to null to show "No Stock Details available"
          setStockInfo(null);
        }
      } catch (error) {
        // Stock not found is okay - no record exists
        setStockInfo(null);
      }
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

  if (!open) return null;

  return (
    <>
      {/* Backdrop - Only on mobile/tablet */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity lg:hidden"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Side Panel */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[500px] lg:relative lg:h-full lg:w-full bg-background border-l lg:border lg:rounded-lg shadow-xl z-50 lg:z-auto flex flex-col">
        {/* Header */}
        <div className="border-b p-2 flex items-center justify-between bg-gradient-to-r from-primary/5 to-accent/5 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold truncate">
              {loading || !product ? 'Loading...' : `Product #${product.id}`}
            </h2>
            <p className="text-[10px] text-muted-foreground">Product details</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-7 w-7 p-0"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
          {loading || !product ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <>
              {/* Product Name */}
              <div className="border rounded-lg p-2 bg-secondary/10">
                <div className="text-xs text-muted-foreground mb-1">Product Name</div>
                <div className="text-sm font-bold">{product.name}</div>
              </div>

              {/* Basic Information */}
              <div className="border rounded-lg p-2">
                <div className="text-xs font-semibold mb-2">Basic Information</div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">Product ID</span>
                    <span className="text-xs font-medium">#{product.id}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">Barcode</span>
                    <span className="text-xs font-mono font-medium">{product.barcode || "N/A"}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">SKU</span>
                    <span className="text-xs font-mono font-medium">{product.sku || "N/A"}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-muted-foreground">Shelf</span>
                    <span className="text-xs font-medium">{product.shelf || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="border rounded-lg p-2">
                <div className="text-xs font-semibold mb-2">Description</div>
                <div className="text-xs text-muted-foreground min-h-[20px]">
                  {product.description || "No description available"}
                </div>
              </div>

              {/* Pricing */}
              <div className="border rounded-lg p-2 bg-secondary/10">
                <div className="text-xs font-semibold mb-2">Pricing Information</div>
                {latestPrice ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-xs text-muted-foreground">Wholesale Price</span>
                      <span className="text-xs font-bold">
                        ${latestPrice.wholesale_price ? Number(latestPrice.wholesale_price).toFixed(2) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-xs text-muted-foreground">Retail Price</span>
                      <span className="text-xs font-bold text-primary">
                        ${latestPrice.retail_price ? Number(latestPrice.retail_price).toFixed(2) : 'N/A'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No pricing information available</div>
                )}
              </div>

              {/* Stock Information */}
              <div className="border rounded-lg p-2 bg-secondary/10">
                <div className="text-xs font-semibold mb-2">Stock Information</div>
                {stockInfo !== null ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-xs text-muted-foreground">Available Quantity</span>
                      <span className={`text-xs font-bold ${stockInfo.available_qty === 0 ? 'text-destructive' : stockInfo.available_qty < 10 ? 'text-warning' : 'text-success'}`}>
                        {stockInfo.available_qty}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-xs text-muted-foreground">Average Cost</span>
                      <span className="text-xs font-bold">
                        ${stockInfo.avg_cost.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No Stock Details available</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

