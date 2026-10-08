import { QueryClient } from "@tanstack/react-query";
import {
  categoriesRepo,
  customersRepo,
  inventoryRepo,
  invoicesRepo,
  packagesRepo,
  productPricesRepo,
  productsRepo,
  suppliersRepo,
} from "./repo";

/**
 * Cache keys for server data. The first segment is the area that mutations invalidate
 * ("invoices", "inventory", "dashboard", "products", ...), so invalidating ["invoices"]
 * refreshes every invoice list and detail at once.
 */
export const queryKeys = {
  dashboardStats: ["dashboard", "stats"] as const,
  dashboardRecent: (limit: number) => ["dashboard", "recent", limit] as const,
  invoiceList: (startDate: string, endDate: string) => ["invoices", "list", startDate, endDate] as const,
  invoiceDetail: (id: string) => ["invoices", "detail", id] as const,
  productPage: (limit: number, offset: number, search: string) => ["products", "page", limit, offset, search] as const,
  productsAll: ["products", "all"] as const,
  categories: ["categories"] as const,
  customers: ["customers"] as const,
  suppliers: ["suppliers"] as const,
  packages: ["packages"] as const,
  latestPrices: ["product-prices", "latest"] as const,
  stockToday: ["inventory", "today"] as const,
};

/**
 * Pages show what is cached at once and refresh it in the background, so moving between pages
 * no longer waits on the network. staleTime 0 keeps the data as fresh as before: every visit
 * still re-checks the server, it just doesn't blank the page while it does.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

/** Everything that changes when an invoice or payment is saved or deleted. */
export function invalidateInvoiceData(queryClient: QueryClient) {
  return Promise.all(
    ["invoices", "inventory", "daily-stock", "stock-movements", "dashboard"].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

/**
 * After a price or product change. Prices are dropped from the cache (not just marked stale),
 * so the invoice form can never fill a line from a price that was changed in this browser.
 */
export function invalidateProductData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.resetQueries({ queryKey: ["product-prices"] }),
    queryClient.invalidateQueries({ queryKey: ["products"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory"] }),
  ]);
}

export const invoiceDetailQuery = (id: string) => ({
  queryKey: queryKeys.invoiceDetail(id),
  queryFn: () => invoicesRepo.getInvoiceDetails(id),
});

// Reference lists used by the invoice form (and shared with other pages through the cache)
export const productsAllQuery = {
  queryKey: queryKeys.productsAll,
  queryFn: async () => {
    const response = await productsRepo.list({ limit: 1000 });
    return Array.isArray(response) ? response : response.data;
  },
};
export const customersQuery = { queryKey: queryKeys.customers, queryFn: () => customersRepo.list() };
export const suppliersQuery = { queryKey: queryKeys.suppliers, queryFn: () => suppliersRepo.list() };
export const categoriesQuery = { queryKey: queryKeys.categories, queryFn: () => categoriesRepo.list() };
export const packagesQuery = { queryKey: queryKeys.packages, queryFn: () => packagesRepo.list() };
export const latestPricesQuery = { queryKey: queryKeys.latestPrices, queryFn: () => productPricesRepo.latestAll() };
export const stockTodayQuery = { queryKey: queryKeys.stockToday, queryFn: () => inventoryRepo.today() };
