import React, { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { createQueryClient } from "@/integrations/api/queries";

// Page code is split per route; the busiest pages are also fetched ahead of time (see AppShell)
const loadDashboard = () => import("./pages/Dashboard");
const loadInvoicesList = () => import("./pages/InvoicesList");
const loadInvoiceForm = () => import("./pages/InvoiceForm");
const loadProducts = () => import("./pages/Products");

const Dashboard = lazy(loadDashboard);
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Products = lazy(loadProducts);
const QuickAddProducts = lazy(() => import("./pages/QuickAddProducts"));
const Categories = lazy(() => import("./pages/Categories"));
const Packages = lazy(() => import("./pages/Packages"));
const Customers = lazy(() => import("./pages/Customers"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const InvoicesList = lazy(loadInvoicesList);
const InvoicePayments = lazy(() => import("./pages/InvoicePayments"));
const OverdueInvoices = lazy(() => import("./pages/OverdueInvoices"));
const InvoiceForm = lazy(loadInvoiceForm);
const Reports = lazy(() => import("./pages/Reports"));
const StockMovements = lazy(() => import("./pages/StockMovements"));
const Inventory = lazy(() => import("./pages/Inventory"));
const DailyStocks = lazy(() => import("./pages/DailyStocks"));
const ProductCosts = lazy(() => import("./pages/ProductCosts"));
const ProductPrices = lazy(() => import("./pages/ProductPrices"));
const ExchangeRates = lazy(() => import("./pages/ExchangeRates"));
const LowStock = lazy(() => import("./pages/LowStock"));
const Settings = lazy(() => import("./pages/Settings"));
const BarcodeGenerator = lazy(() => import("./pages/BarcodeGenerator"));
const LandedCost = lazy(() => import("./pages/LandedCost"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = createQueryClient();

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

/** The signed-in shell. Once the first page is up, the main pages' code downloads in the background. */
const AppShell = () => {
  useEffect(() => {
    const prefetch = () => {
      [loadDashboard, loadInvoicesList, loadInvoiceForm, loadProducts].forEach((load) => load().catch(() => {}));
    };
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(prefetch, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = setTimeout(prefetch, 1500);
    return () => clearTimeout(handle);
  }, []);

  return <DashboardLayout />;
};

const App = () => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/quick-add" element={<QuickAddProducts />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/packages" element={<Packages />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/invoices" element={<InvoicesList />} />
              <Route path="/invoices/payments" element={<InvoicePayments />} />
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
              <Route path="/settings" element={<Settings />} />
              <Route path="/barcode-generator" element={<BarcodeGenerator />} />
              <Route path="/landed-cost" element={<LandedCost />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
