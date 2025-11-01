import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import InvoicesList from "./pages/InvoicesList";
import InvoiceForm from "./pages/InvoiceForm";
import Reports from "./pages/Reports";
import StockMovements from "./pages/StockMovements";
import Inventory from "./pages/Inventory";
import DailyStocks from "./pages/DailyStocks";
import ProductCosts from "./pages/ProductCosts";
import ProductPrices from "./pages/ProductPrices";
import LowStock from "./pages/LowStock";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/products" element={<Products />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/invoices" element={<InvoicesList />} />
          <Route path="/invoices/new/sell" element={<InvoiceForm />} />
          <Route path="/invoices/new/buy" element={<InvoiceForm />} />
          <Route path="/invoices/edit/:id" element={<InvoiceForm />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/stock-movements" element={<StockMovements />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/daily-stocks" element={<DailyStocks />} />
          <Route path="/product-costs" element={<ProductCosts />} />
          <Route path="/product-prices" element={<ProductPrices />} />
          <Route path="/low-stock" element={<LowStock />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
