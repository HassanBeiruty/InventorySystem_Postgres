import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scan, Package, CheckCircle2, ArrowRight } from "lucide-react";
import { productsRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const QuickAddProducts = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentProducts, setRecentProducts] = useState<any[]>([]);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus barcode input on mount
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

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

  // Handle name input (Enter saves)
  const handleNameKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (name.trim() && barcode.trim()) {
        await handleSubmit();
      }
    }
  };

  const fetchRecentProducts = async () => {
    try {
      const products = await productsRepo.list();
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
    if (!barcode.trim() || !name.trim()) {
      toast({
        title: "Error",
        description: "Both barcode and name are required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await productsRepo.quickAdd({
        barcode: barcode.trim(),
        name: name.trim(),
      });
      
      toast({
        title: "Success",
        description: `Product "${name.trim()}" added successfully!`,
      });

      // Reset form
      setBarcode("");
      setName("");
      
      // Refocus barcode input for next scan
      setTimeout(() => {
        barcodeInputRef.current?.focus();
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
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              Quick Add Products
            </h2>
            <p className="text-muted-foreground">
              Scan barcode and enter name to quickly register products
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/products")}
            className="gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            View All Products
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Quick Add Form */}
          <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
            <CardHeader className="border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
              <CardTitle className="flex items-center gap-2">
                <Scan className="w-6 h-6 text-primary" />
                Quick Add Product
              </CardTitle>
              <CardDescription>
                Optimized for barcode scanner workflow
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="barcode" className="text-base font-semibold">
                  Barcode <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="barcode"
                  ref={barcodeInputRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={handleBarcodeKeyDown}
                  placeholder="Scan or enter barcode"
                  className="h-12 text-lg"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Scan barcode with scanner (press Enter to continue)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-base font-semibold">
                  Product Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  placeholder="Enter product name"
                  className="h-12 text-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Enter name and press Enter to save
                </p>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={loading || !barcode.trim() || !name.trim()}
                className="w-full h-12 text-base font-semibold gradient-primary hover:shadow-glow"
              >
                {loading ? (
                  "Saving..."
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    Save Product
                  </>
                )}
              </Button>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground text-center">
                  💡 Tip: After saving, barcode field will auto-focus for next scan
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Recent Products */}
          <Card className="border-2 shadow-card">
            <CardHeader className="border-b bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
              <CardTitle className="flex items-center gap-2">
                <Package className="w-6 h-6 text-primary" />
                Recently Added
              </CardTitle>
              <CardDescription>
                Last 5 products you added
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {recentProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No products added yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-primary/5 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Barcode: {product.barcode || "N/A"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/products")}
                        className="text-xs"
                      >
                        View Details
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card className="border-2 bg-muted/20">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-3">Workflow Instructions:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Open this page and position barcode scanner</li>
              <li>Scan the product barcode (auto-fills barcode field)</li>
              <li>Press Enter or Tab to move to name field</li>
              <li>Type the product name</li>
              <li>Press Enter or click Save to register the product</li>
              <li>Barcode field auto-focuses for the next scan</li>
              <li>Add full details (category, description, prices) later in Products page</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default QuickAddProducts;

