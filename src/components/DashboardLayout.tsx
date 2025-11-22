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
import { LogOut, Receipt, Package, Users, UserPlus, FileText, TrendingUp, Home, History, Warehouse, ChevronDown, Database, BarChart3, Calendar, DollarSign, AlertTriangle, FolderTree, AlertCircle, Settings } from "lucide-react";
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
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-0 sm:h-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 gradient-primary rounded-2xl flex items-center justify-center shadow-glow animate-float flex-shrink-0">
              <Receipt className="w-5 h-5 sm:w-7 sm:h-7 text-primary-foreground" />
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent animate-gradient truncate">
                Invoice System
              </h1>
              <p className="text-xs text-muted-foreground font-medium truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <LiveClock />
            <ThemeToggle />
            <LanguageSwitcher />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSignOut}
              className="hover:scale-105 transition-all duration-300 hover:shadow-md border-2 hover:border-primary/30 font-semibold text-xs sm:text-sm"
            >
              <LogOut className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('common.signOut')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation Menu */}
      <nav className="border-b-2 border-border/50 glass backdrop-blur-md relative z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-hide items-center -mx-3 sm:mx-0 px-3 sm:px-0">
            {/* Dashboard */}
            <Link to="/" className="no-underline inline-block">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`gap-1.5 sm:gap-2 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-xl font-semibold pointer-events-auto text-xs sm:text-sm whitespace-nowrap ${
                  location.pathname === "/" 
                    ? "dark:text-primary dark:[&_svg]:text-primary" 
                    : "dark:text-white dark:[&_svg]:text-white hover:bg-primary/20 hover:text-foreground"
                }`}
              >
                <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {t('nav.dashboard')}
              </Button>
            </Link>

            {/* Master Data Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`gap-1.5 sm:gap-2 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-xl font-semibold pointer-events-auto text-xs sm:text-sm whitespace-nowrap ${
                    location.pathname.startsWith("/products") || 
                    location.pathname.startsWith("/categories") || 
                    location.pathname.startsWith("/customers") || 
                    location.pathname.startsWith("/suppliers") || 
                    location.pathname.startsWith("/exchange-rates")
                      ? "dark:text-primary dark:[&_svg]:text-primary" 
                      : "dark:text-white dark:[&_svg]:text-white hover:bg-accent/20 hover:text-foreground"
                  }`}
                >
                  <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {t('nav.masterData')}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48 border-2">
                <DropdownMenuItem asChild>
                  <Link to="/products" className="cursor-pointer flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    <span className="font-medium">{t('nav.products')}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/categories" className="cursor-pointer flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-accent" />
                    <span className="font-medium">Categories</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/customers" className="cursor-pointer flex items-center gap-2">
                    <Users className="w-4 h-4 text-success" />
                    <span className="font-medium">{t('nav.customers')}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/suppliers" className="cursor-pointer flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-secondary" />
                    <span className="font-medium">{t('nav.suppliers')}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/exchange-rates" className="cursor-pointer flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <span className="font-medium">{t("exchangeRates.title")}</span>
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
                  className={`gap-1.5 sm:gap-2 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-xl font-semibold pointer-events-auto text-xs sm:text-sm whitespace-nowrap ${
                    location.pathname.startsWith("/invoices") 
                      ? "dark:text-primary dark:[&_svg]:text-primary" 
                      : "dark:text-white dark:[&_svg]:text-white hover:bg-success/20 hover:text-foreground"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {t('nav.invoices')}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48 border-2">
                <DropdownMenuItem asChild>
                  <Link to="/invoices" className="cursor-pointer flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="font-medium">All Invoices</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/invoices/overdue" className="cursor-pointer flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <span className="font-medium">Overdue Invoices</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Stock Tracking Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`gap-1.5 sm:gap-2 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-xl font-semibold pointer-events-auto text-xs sm:text-sm whitespace-nowrap ${
                    location.pathname.startsWith("/inventory") || 
                    location.pathname.startsWith("/daily-stocks") || 
                    location.pathname.startsWith("/stock-movements") || 
                    location.pathname.startsWith("/low-stock")
                      ? "dark:text-primary dark:[&_svg]:text-primary" 
                      : "dark:text-white dark:[&_svg]:text-white hover:bg-warning/20 hover:text-foreground"
                  }`}
                >
                  <Warehouse className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {t('nav.stockTracking')}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 border-2">
                <DropdownMenuItem asChild>
                  <Link to="/inventory" className="cursor-pointer flex items-center gap-2">
                    <Warehouse className="w-4 h-4 text-primary" />
                    <div className="flex flex-col">
                      <span className="font-medium">{t('nav.inventory')}</span>
                      <span className="text-xs text-muted-foreground">{t('inventory.todayPosition')}</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/daily-stocks" className="cursor-pointer flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-accent" />
                    <div className="flex flex-col">
                      <span className="font-medium">{t('nav.dailyStocks')}</span>
                      <span className="text-xs text-muted-foreground">{t('dailyStocks.records')}</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/stock-movements" className="cursor-pointer flex items-center gap-2">
                    <History className="w-4 h-4 text-warning" />
                    <div className="flex flex-col">
                      <span className="font-medium">{t('nav.stockMovements')}</span>
                      <span className="text-xs text-muted-foreground">{t('invoices.items')}</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/low-stock" className="cursor-pointer flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <div className="flex flex-col">
                      <span className="font-medium">Low Stock Alerts</span>
                      <span className="text-xs text-muted-foreground">Configurable threshold</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Pricing Costs Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`gap-1.5 sm:gap-2 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-xl font-semibold pointer-events-auto text-xs sm:text-sm whitespace-nowrap ${
                    location.pathname.startsWith("/product-costs") || 
                    location.pathname.startsWith("/product-prices")
                      ? "dark:text-primary dark:[&_svg]:text-primary" 
                      : "dark:text-white dark:[&_svg]:text-white hover:bg-success/20 hover:text-foreground"
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Prices & Costs
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 border-2">
                <DropdownMenuItem asChild>
                  <Link to="/product-costs" className="cursor-pointer flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-success" />
                    <div className="flex flex-col">
                      <span className="font-medium">{t('nav.productCosts')}</span>
                      <span className="text-xs text-muted-foreground">{t('productCosts.purchaseCosts')}</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/product-prices" className="cursor-pointer flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <div className="flex flex-col">
                      <span className="font-medium">Product Prices</span>
                      <span className="text-xs text-muted-foreground">Wholesale & retail pricing</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Reports */}
            <Link to="/reports" className="no-underline inline-block">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`gap-1.5 sm:gap-2 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-xl font-semibold pointer-events-auto text-xs sm:text-sm whitespace-nowrap ${
                  location.pathname === "/reports" 
                    ? "dark:text-primary dark:[&_svg]:text-primary" 
                    : "dark:text-white dark:[&_svg]:text-white hover:bg-accent/20 hover:text-foreground"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {t('nav.reports')}
              </Button>
            </Link>

            {/* Settings */}
            <Link to="/settings" className="no-underline inline-block">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`gap-1.5 sm:gap-2 hover:scale-105 transition-all duration-300 hover:shadow-md rounded-xl font-semibold pointer-events-auto text-xs sm:text-sm whitespace-nowrap ${
                  location.pathname === "/settings" 
                    ? "dark:text-primary dark:[&_svg]:text-primary" 
                    : "dark:text-white dark:[&_svg]:text-white hover:bg-accent/20 hover:text-foreground"
                }`}
              >
                <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {t("settings.title")}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
