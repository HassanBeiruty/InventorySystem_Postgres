import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw } from "lucide-react";
import { productsRepo } from "@/integrations/api/repo";
import { toast } from "sonner";
import { fetchJson } from "@/integrations/api/repo";

interface RecomputePositionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecomputePositionsDialog({
  open,
  onOpenChange,
}: RecomputePositionsDialogProps) {
  const queryClient = useQueryClient();
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fetchingProducts, setFetchingProducts] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProducts();
    } else {
      // Reset when dialog closes
      setSelectedProductId("");
    }
  }, [open]);

  const fetchProducts = async () => {
    setFetchingProducts(true);
    try {
      const dataResponse = await productsRepo.list({ limit: 1000 });
      const data = Array.isArray(dataResponse) ? dataResponse : dataResponse.data;
      setProducts(data || []);
    } catch (error: any) {
      console.error("Error fetching products:", error);
      toast.error("Failed to load products", {
        description: error.message || "Could not fetch products list",
      });
    } finally {
      setFetchingProducts(false);
    }
  };

  const handleRecompute = async () => {
    setLoading(true);
    try {
      const productId = selectedProductId === "" || selectedProductId === "all" 
        ? null 
        : parseInt(selectedProductId);

      const result = await fetchJson<{ success: boolean; message: string; product_id: number | null }>(
        "/api/admin/recompute-positions",
        {
          method: "POST",
          body: JSON.stringify({ product_id: productId }),
        }
      );
      
      toast.success("Positions recomputed successfully", {
        description: result.message || "Daily stock positions have been recalculated",
      });

      // Invalidate all related queries to force immediate refresh
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["daily-stock"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "health"] });

      onOpenChange(false);
    } catch (error: any) {
      console.error("Error recomputing positions:", error);
      toast.error("Failed to recompute positions", {
        description: error.message || "An error occurred while recomputing positions",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Recompute Positions
          </DialogTitle>
          <DialogDescription>
            Recalculate daily stock positions and fill gaps in the daily_stock table.
            Select a specific product or leave empty to process all products.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="product-select">Product (Optional)</Label>
            <Select
              value={selectedProductId || "all"}
              onValueChange={(value) => setSelectedProductId(value === "all" ? "" : value)}
              disabled={fetchingProducts || loading}
            >
              <SelectTrigger id="product-select">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent side="bottom" align="start">
                <SelectItem value="all">All Products</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={String(product.id)}>
                    {product.name}
                    {product.barcode && ` (${product.barcode})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {selectedProductId === "" || selectedProductId === "all"
                ? "Will recompute positions for all products"
                : `Will recompute positions for selected product only`}
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-medium">What this does:</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Detects gaps in daily stock records</li>
              <li>Fills missing dates with last known values</li>
              <li>Recalculates positions from earliest gap to today</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleRecompute} disabled={loading || fetchingProducts}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Recomputing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Recompute
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

