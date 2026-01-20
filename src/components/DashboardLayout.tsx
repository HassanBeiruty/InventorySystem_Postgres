import { ReactNode, useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { auth } from "@/integrations/api/repo";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Receipt, Package, Users, UserPlus, FileText, TrendingUp, TrendingDown, Home, History, Warehouse, ChevronDown, Database, BarChart3, Calendar, DollarSign, AlertTriangle, FolderTree, AlertCircle, Settings, Scan, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LiveClock } from "@/components/LiveClock";
import { useTranslation } from "react-i18next";
type LocalUser = { email: string } | null;

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<LocalUser>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const unsub = auth.onAuthStateChange((_event, session) => {
      setUser(session ? { email: session.email } : null);
      if (!session) navigate("/auth");
    });
    (async () => {
      const session = await auth.getSession();
      setUser(session ? { email: session.email } : null);
      if (!session) navigate("/auth");
    })();
    return () => { unsub(); };
  }, [navigate]);

  const handleSignOut = async () => {
    await auth.signOut();
    toast.success("Signed out successfully");
    navigate("/auth");
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b-2 border-border/50 glass shadow-elegant backdrop-blur-xl">
        <div className="container mx-auto px-2 sm:px-3 py-1.5 sm:py-0 sm:h-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <div className="flex items-center gap-1.5 sm:gap-3 w-full sm:w-auto">
            <div className="relative w-8 h-8 sm:w-10 sm:h-10 gradient-primary rounded-xl flex items-center justify-center shadow-glow animate-float flex-shrink-0">
              <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-xl" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-lg font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent animate-gradient truncate">
                Invoice System
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
            <LiveClock />
            <ThemeToggle />
            <LanguageSwitcher />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSignOut}
              className="hover:scale-105 transition-all duration-300 hover:shadow-md border-2 hover:border-primary/30 font-semibold text-[10px] sm:text-xs h-7"
            >
              <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">{t('common.signOut')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation Menu */}
      <nav className="border-b-2 border-border/50 glass backdrop-blur-md relative z-10">
        <div className="container mx-auto px-2 sm:px-3 py-1.5 sm:py-2">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide items-center -mx-2 sm:mx-0 px-2 sm:px-0">
            {/* Dashboard */}
            <Link to="/" className="no-underline inline-block">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`gap-1 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-lg font-semibold pointer-events-auto text-[10px] sm:text-xs h-7 whitespace-nowrap ${
                  location.pathname === "/" 
                    ? "text-primary [&_svg]:text-primary dark:text-primary dark:[&_svg]:text-primary system:text-primary system:[&_svg]:text-primary" 
                    : "text-foreground [&_svg]:text-foreground dark:text-white dark:[&_svg]:text-white hover:bg-primary/20 hover:text-foreground"
                }`}
              >
                <Home className="w-3 h-3" />
                {t('nav.dashboard')}
              </Button>
            </Link>

            {/* Products Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`gap-1 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-lg font-semibold pointer-events-auto text-[10px] sm:text-xs h-7 whitespace-nowrap ${
                    location.pathname.startsWith("/products") ||
                    location.pathname.startsWith("/categories")
                      ? "text-primary [&_svg]:text-primary dark:text-primary dark:[&_svg]:text-primary system:text-primary system:[&_svg]:text-primary" 
                      : "text-foreground [&_svg]:text-foreground dark:text-white dark:[&_svg]:text-white system:text-foreground system:[&_svg]:text-foreground hover:bg-primary/20 hover:text-foreground"
                  }`}
                >
                  <Package className="w-3 h-3" />
                  {t('nav.products')}
                  <ChevronDown className="w-2.5 h-2.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 border-2 p-0.5">
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/products" className="cursor-pointer flex items-center gap-1.5">
                    <Package className="w-3 h-3" />
                    <span className="font-medium">All Products</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/products/quick-add" className="cursor-pointer flex items-center gap-1.5">
                    <Scan className="w-3 h-3" />
                    <span className="font-medium">Quick Add (Barcode Scanner)</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/categories" className="cursor-pointer flex items-center gap-1.5">
                    <FolderTree className="w-3 h-3" />
                    <span className="font-medium">Categories</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Customers & Suppliers */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`gap-1 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-lg font-semibold pointer-events-auto text-[10px] sm:text-xs h-7 whitespace-nowrap ${
                    location.pathname.startsWith("/customers") || 
                    location.pathname.startsWith("/suppliers")
                      ? "text-primary [&_svg]:text-primary dark:text-primary dark:[&_svg]:text-primary system:text-primary system:[&_svg]:text-primary" 
                      : "text-foreground [&_svg]:text-foreground dark:text-white dark:[&_svg]:text-white system:text-foreground system:[&_svg]:text-foreground hover:bg-success/20 hover:text-foreground"
                  }`}
                >
                  <Users className="w-3 h-3" />
                  Contacts
                  <ChevronDown className="w-2.5 h-2.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48 border-2 p-0.5">
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/customers" className="cursor-pointer flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    <span className="font-medium">{t('nav.customers')}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/suppliers" className="cursor-pointer flex items-center gap-1.5">
                    <UserPlus className="w-3 h-3" />
                    <span className="font-medium">{t('nav.suppliers')}</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Invoices */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`gap-1 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-lg font-semibold pointer-events-auto text-[10px] sm:text-xs h-7 whitespace-nowrap ${
                    location.pathname.startsWith("/invoices") 
                      ? "text-primary [&_svg]:text-primary dark:text-primary dark:[&_svg]:text-primary system:text-primary system:[&_svg]:text-primary" 
                      : "text-foreground [&_svg]:text-foreground dark:text-white dark:[&_svg]:text-white system:text-foreground system:[&_svg]:text-foreground hover:bg-success/20 hover:text-foreground"
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  {t('nav.invoices')}
                  <ChevronDown className="w-2.5 h-2.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 border-2 p-0.5">
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/invoices" className="cursor-pointer flex items-center gap-1.5">
                    <FileText className="w-3 h-3" />
                    <span className="font-medium">All Invoices</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <button onClick={() => navigate("/invoices/new/buy")} className="cursor-pointer flex items-center gap-1.5 w-full text-left">
                    <TrendingDown className="w-3 h-3" />
                    <span className="font-medium">New Buy Invoice</span>
                  </button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <button onClick={() => navigate("/invoices/new/sell")} className="cursor-pointer flex items-center gap-1.5 w-full text-left">
                    <TrendingUp className="w-3 h-3" />
                    <span className="font-medium">New Sell Invoice</span>
                  </button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/invoices/overdue" className="cursor-pointer flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" />
                    <span className="font-medium">Overdue Invoices</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/invoices/payments" className="cursor-pointer flex items-center gap-1.5">
                    <CreditCard className="w-3 h-3" />
                    <span className="font-medium">Invoice Payments</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Inventory & Stock */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`gap-1 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-lg font-semibold pointer-events-auto text-[10px] sm:text-xs h-7 whitespace-nowrap ${
                    location.pathname.startsWith("/inventory") || 
                    location.pathname.startsWith("/daily-stocks") || 
                    location.pathname.startsWith("/stock-movements") || 
                    location.pathname.startsWith("/low-stock")
                      ? "text-primary [&_svg]:text-primary dark:text-primary dark:[&_svg]:text-primary system:text-primary system:[&_svg]:text-primary" 
                      : "text-foreground [&_svg]:text-foreground dark:text-white dark:[&_svg]:text-white system:text-foreground system:[&_svg]:text-foreground hover:bg-warning/20 hover:text-foreground"
                  }`}
                >
                  <Warehouse className="w-3 h-3" />
                  Inventory
                  <ChevronDown className="w-2.5 h-2.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 border-2 p-0.5">
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/inventory" className="cursor-pointer flex items-center gap-1.5">
                    <Warehouse className="w-3 h-3" />
                    <span className="font-medium">Today's Stock</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/daily-stocks" className="cursor-pointer flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    <span className="font-medium">Daily History</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/stock-movements" className="cursor-pointer flex items-center gap-1.5">
                    <History className="w-3 h-3" />
                    <span className="font-medium">Stock Movements</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/low-stock" className="cursor-pointer flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" />
                    <span className="font-medium">Low Stock Alerts</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Reports */}
            <Link to="/reports" className="no-underline inline-block">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`gap-1 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-lg font-semibold pointer-events-auto text-[10px] sm:text-xs h-7 whitespace-nowrap ${
                  location.pathname === "/reports" 
                    ? "text-primary [&_svg]:text-primary dark:text-primary dark:[&_svg]:text-primary system:text-primary system:[&_svg]:text-primary" 
                    : "text-foreground [&_svg]:text-foreground dark:text-white dark:[&_svg]:text-white system:text-foreground system:[&_svg]:text-foreground hover:bg-accent/20 hover:text-foreground"
                }`}
              >
                <BarChart3 className="w-3 h-3" />
                {t('nav.reports')}
              </Button>
            </Link>

            {/* Settings & Configuration */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`gap-1 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-lg font-semibold pointer-events-auto text-[10px] sm:text-xs h-7 whitespace-nowrap ${
                    location.pathname.startsWith("/settings") || 
                    location.pathname.startsWith("/exchange-rates") ||
                    location.pathname.startsWith("/product-costs") ||
                    location.pathname.startsWith("/product-prices")
                      ? "text-primary [&_svg]:text-primary dark:text-primary dark:[&_svg]:text-primary system:text-primary system:[&_svg]:text-primary" 
                      : "text-foreground [&_svg]:text-foreground dark:text-white dark:[&_svg]:text-white system:text-foreground system:[&_svg]:text-foreground hover:bg-accent/20 hover:text-foreground"
                  }`}
                >
                  <Settings className="w-3 h-3" />
                  Settings
                  <ChevronDown className="w-2.5 h-2.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 border-2 p-0.5">
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/settings" className="cursor-pointer flex items-center gap-1.5">
                    <Settings className="w-3 h-3" />
                    <span className="font-medium">{t("settings.title")}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/exchange-rates" className="cursor-pointer flex items-center gap-1.5">
                    <DollarSign className="w-3 h-3" />
                    <span className="font-medium">{t("exchangeRates.title")}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/product-costs" className="cursor-pointer flex items-center gap-1.5">
                    <TrendingDown className="w-3 h-3" />
                    <span className="font-medium">Product Costs</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/product-prices" className="cursor-pointer flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3" />
                    <span className="font-medium">Product Prices</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="px-1.5 py-1 text-xs">
                  <Link to="/barcode-generator" className="cursor-pointer flex items-center gap-1.5">
                    <Scan className="w-3 h-3" />
                    <span className="font-medium">Barcode Generator</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
