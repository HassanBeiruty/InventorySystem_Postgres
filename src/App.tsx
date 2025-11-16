import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Lazy load pages for better initial load performance
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Products = lazy(() => import("./pages/Products"));
const Categories = lazy(() => import("./pages/Categories"));
const Customers = lazy(() => import("./pages/Customers"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const InvoicesList = lazy(() => import("./pages/InvoicesList"));
const OverdueInvoices = lazy(() => import("./pages/OverdueInvoices"));
const InvoiceForm = lazy(() => import("./pages/InvoiceForm"));
const Reports = lazy(() => import("./pages/Reports"));
const StockMovements = lazy(() => import("./pages/StockMovements"));
const Inventory = lazy(() => import("./pages/Inventory"));
const DailyStocks = lazy(() => import("./pages/DailyStocks"));
const ProductCosts = lazy(() => import("./pages/ProductCosts"));
const ProductPrices = lazy(() => import("./pages/ProductPrices"));
const ExchangeRates = lazy(() => import("./pages/ExchangeRates"));
const LowStock = lazy(() => import("./pages/LowStock"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Configure React Query with performance optimizations
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5, // 5 minutes - data considered fresh
			gcTime: 1000 * 60 * 30, // 30 minutes - garbage collection time (formerly cacheTime)
			refetchOnWindowFocus: false, // Don't refetch on window focus
			retry: 1, // Only retry once on failure
		},
	},
});

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/products" element={<Products />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/invoices" element={<InvoicesList />} />
            <Route path="/invoices/overdue" element={<OverdueInvoices />} />
            <Route path="/invoices/new/sell" element={<InvoiceForm />} />
            <Route path="/invoices/new/buy" element={<InvoiceForm />} />
            <Route path="/invoices/edit/:id" element={<InvoiceForm />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/stock-movements" element={<StockMovements />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/daily-stocks" element={<DailyStocks />} />
            <Route path="/product-costs" element={<ProductCosts />} />
            <Route path="/product-prices" element={<ProductPrices />} />
            <Route path="/exchange-rates" element={<ExchangeRates />} />
            <Route path="/low-stock" element={<LowStock />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
