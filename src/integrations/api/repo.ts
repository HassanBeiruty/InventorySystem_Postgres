import type {
  CustomerEntity,
  SupplierEntity,
  ProductEntity,
  InvoiceEntity,
  StockMovementEntity,
  DailyStockEntity,
} from "../localdb/db";

type Json = Record<string, any>;

const TOKEN_KEY = "auth_token";
type Session = { userId: string; email: string; token: string } | null;

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

function getSession(): Session {
  try {
    const token = getToken();
    if (!token) return null;
    
    // Decode JWT to get user info (without verification - verification happens on backend)
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    
    // Check if token is expired (basic check)
    if (payload.exp && payload.exp < now) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    
    return {
      userId: payload.userId?.toString() || payload.id?.toString() || '',
      email: payload.email || '',
      token: token
    };
  } catch {
    return null;
  }
}

function setSession(session: Session) {
  if (!session || !session.token) {
    setToken(null);
  } else {
    setToken(session.token);
  }
}

type AuthCallback = (event: "SIGNED_IN" | "SIGNED_OUT", session: Session) => void;
const listeners = new Set<AuthCallback>();

// Get API base URL from environment variable or use relative path for development
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = { 
    "Content-Type": "application/json",
    ...(options?.headers || {})
  };
  
  // Add Authorization header if token exists
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  // Use API_BASE_URL if set, otherwise use relative path (for Vercel proxy)
  const url = API_BASE_URL ? `${API_BASE_URL}${path}` : path;
  
  const res = await fetch(url, {
    headers,
    credentials: "include",
    ...options,
  });
  
  if (!res.ok) {
    // If unauthorized, clear token and session
    if (res.status === 401) {
      setToken(null);
      listeners.forEach((cb) => cb("SIGNED_OUT", null));
    }
    
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const auth = {
  async signUp(email: string, password: string) {
    const result = await fetchJson<{ id: string; email: string; token: string }>(`/api/auth/signup`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setSession({ userId: result.id, email: result.email, token: result.token });
    listeners.forEach((cb) => cb("SIGNED_IN", getSession()));
  },
  async signIn(email: string, password: string) {
    const result = await fetchJson<{ id: string; email: string; token: string }>(`/api/auth/signin`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setSession({ userId: result.id, email: result.email, token: result.token });
    listeners.forEach((cb) => cb("SIGNED_IN", getSession()));
  },
  async signOut() {
    try {
      // Call logout endpoint to clear server-side session
      await fetchJson(`/api/auth/logout`, {
        method: "POST",
      });
    } catch (err) {
      // Continue even if logout endpoint fails
      console.error('Logout error:', err);
    }
    setSession(null);
    listeners.forEach((cb) => cb("SIGNED_OUT", null));
  },
  onAuthStateChange(callback: AuthCallback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
  async getSession() {
    return getSession();
  },
};

export const customersRepo = {
  async list(): Promise<CustomerEntity[]> {
    return fetchJson<CustomerEntity[]>(`/api/customers`);
  },
  async add(input: { name: string; phone: string | null; address: string | null; credit_limit: number }) {
    await fetchJson<{ id: string }>(`/api/customers`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async update(id: string, input: Partial<{ name: string; phone: string | null; address: string | null; credit_limit: number }>) {
    await fetchJson<{ id: string }>(`/api/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
};

export const suppliersRepo = {
  async list(): Promise<SupplierEntity[]> {
    return fetchJson<SupplierEntity[]>(`/api/suppliers`);
  },
  async add(input: { name: string; phone: string | null; address: string | null }) {
    await fetchJson<{ id: string }>(`/api/suppliers`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async update(id: string, input: Partial<{ name: string; phone: string | null; address: string | null }>) {
    await fetchJson<{ id: string }>(`/api/suppliers/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
};

export const categoriesRepo = {
  async list(): Promise<Array<{ id: number; name: string; description: string | null; created_at: string }>> {
    return fetchJson(`/api/categories`);
  },
  async add(input: { name: string; description: string | null }) {
    await fetchJson<{ id: string }>(`/api/categories`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async update(id: string, input: Partial<{ name: string; description: string | null }>) {
    await fetchJson<{ id: string }>(`/api/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  async delete(id: string) {
    await fetchJson<{ success: boolean }>(`/api/categories/${id}`, {
      method: "DELETE",
    });
  },
};

export const productsRepo = {
  async list(): Promise<ProductEntity[]> {
    return fetchJson<ProductEntity[]>(`/api/products`);
  },
  async add(input: { name: string; barcode: string | null; category_id: number | null; description: string | null; sku: string | null; shelf: string | null }) {
    await fetchJson<{ id: string }>(`/api/products`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async update(id: string, input: Partial<{ name: string; barcode: string | null; category_id: number | null; description: string | null; sku: string | null; shelf: string | null }>) {
    await fetchJson<{ id: string }>(`/api/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  async delete(id: string) {
    return fetchJson<{ success: boolean; id: string }>(`/api/products/${id}`, {
      method: "DELETE",
    });
  },
};

export type InvoiceCreateItem = {
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  price_type: "retail" | "wholesale";
  is_private_price: boolean;
  private_price_amount: number | null;
  private_price_note: string | null;
};

export const invoicesRepo = {
  async listWithRelations(): Promise<(InvoiceEntity & { customers?: CustomerEntity; suppliers?: SupplierEntity })[]> {
    return fetchJson(`/api/invoices`);
  },
  async listRecent(limit: number) {
    return fetchJson(`/api/invoices/recent/${limit}`);
  },
  async stats() {
    return fetchJson<{ invoicesCount: number; productsCount: number; customersCount: number; suppliersCount: number; revenue: number }>(`/api/invoices/stats`);
  },
  async createInvoice(input: {
    invoice_type: "buy" | "sell";
    customer_id: string | null;
    supplier_id: string | null;
    total_amount: number;
    is_paid: boolean;
    due_date?: string | null;
    items: InvoiceCreateItem[];
  }) {
    return fetchJson<{ id: string; invoice_date: string }>(`/api/invoices`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async getInvoiceDetails(invoiceId: string) {
    return fetchJson<any>(`/api/invoices/${invoiceId}`);
  },
  async recordPayment(invoiceId: string, payment: { payment_amount: number; payment_method?: string; notes?: string }) {
    return fetchJson<{ id: number; invoice_id: number; amount_paid: number; remaining_balance: number; payment_status: string }>(`/api/invoices/${invoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify(payment),
    });
  },
  async getInvoicePayments(invoiceId: string) {
    return fetchJson<any[]>(`/api/invoices/${invoiceId}/payments`);
  },
  async updateInvoice(invoiceId: string, input: {
    invoice_type: "buy" | "sell";
    customer_id: string | null;
    supplier_id: string | null;
    total_amount: number;
    is_paid: boolean;
    due_date?: string | null;
    items: InvoiceCreateItem[];
  }) {
    return fetchJson<{ id: string; invoice_date: string }>(`/api/invoices/${invoiceId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  async deleteInvoice(invoiceId: string) {
    return fetchJson<{ success: boolean; id: string }>(`/api/invoices/${invoiceId}`, {
      method: "DELETE",
    });
  },
  async getOverdueInvoices() {
    return fetchJson<(InvoiceEntity & { customers?: CustomerEntity; suppliers?: SupplierEntity })[]>(`/api/invoices/overdue`);
  },
};

export const inventoryRepo = {
  async lowStock(threshold: number): Promise<(DailyStockEntity & { products?: ProductEntity })[]> {
    return fetchJson(`/api/inventory/low-stock/${threshold}`);
  },
  async dailyWithProducts(): Promise<(DailyStockEntity & { products?: ProductEntity })[]> {
    return fetchJson(`/api/inventory/daily`);
  },
  async today(): Promise<(DailyStockEntity & { products?: ProductEntity })[]> {
    return fetchJson(`/api/inventory/today`);
  },
  async dailyHistory(): Promise<(DailyStockEntity & { products?: ProductEntity })[]> {
    return fetchJson(`/api/inventory/daily-history`);
  },
  async todayAvgCost(): Promise<Array<{ product_id: string; available_qty: number; avg_cost: number }>> {
    return fetchJson(`/api/daily-stock/today/avg-cost`);
  },
};

export const stockRepo = {
  async recent(limit: number): Promise<(StockMovementEntity & { products?: ProductEntity })[]> {
    return fetchJson(`/api/stock-movements/recent/${limit}`);
  },
};

export const productCostsRepo = {
  async getAllAverageCosts(): Promise<Record<string, number>> {
    return fetchJson<Record<string, number>>("/api/daily-stock/avg-costs/all");
  },
  async getProductCosts(productId: string): Promise<any[]> {
    // Deprecated: product_costs table removed. Use daily_stock snapshots instead.
    return fetchJson(`/api/daily-stock/avg-costs?product_id=${encodeURIComponent(productId)}`);
  },
  async getAverageCost(productId: string): Promise<{ average_cost: number; total_quantity: number; total_cost: number }> {
    // Compute average based on latest snapshot; for now return latest day's avg_cost * qty summary
    const rows = await fetchJson<Array<{ avg_cost: number; available_qty: number }>>(`/api/daily-stock/avg-costs?product_id=${encodeURIComponent(productId)}`);
    const latest = rows[0];
    return {
      average_cost: latest ? latest.avg_cost : 0,
      total_quantity: latest ? latest.available_qty : 0,
      total_cost: latest ? latest.avg_cost * latest.available_qty : 0,
    };
  },
  async listAll(filters?: { product_id?: string; supplier_id?: string; start_date?: string; end_date?: string }): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters?.product_id) params.append('product_id', filters.product_id);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    const queryString = params.toString();
    return fetchJson(`/api/daily-stock/avg-costs${queryString ? '?' + queryString : ''}`);
  },
  async create(data: { product_id: string; supplier_id?: string; invoice_id?: string; cost: number; quantity: number; purchase_date?: string }): Promise<{ id: string }> {
    throw new Error('Creating product costs is no longer supported. Costs are tracked via daily_stock snapshots.');
  },
  async delete(id: string): Promise<{ success: boolean }> {
    throw new Error('Deleting product costs is no longer supported.');
  },
};

export const productPricesRepo = {
  async listAll(filters?: { product_id?: string; start_date?: string; end_date?: string }): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters?.product_id) params.append('product_id', filters.product_id);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    const queryString = params.toString();
    return fetchJson(`/api/product-prices${queryString ? '?' + queryString : ''}`);
  },
  async list(productId: string): Promise<Array<{ id: string; product_id: string; wholesale_price: number; retail_price: number; effective_date: string }>> {
    return fetchJson(`/api/products/${productId}/prices`);
  },
  async latestAll(): Promise<Array<{ product_id: string; name: string; barcode: string | null; wholesale_price: number | null; retail_price: number | null; effective_date: string | null }>> {
    return fetchJson(`/api/product-prices/latest`);
  },
  async latestForProduct(productId: string): Promise<{ id: string; product_id: string; wholesale_price: number; retail_price: number; effective_date: string } | null> {
    return fetchJson(`/api/products/${productId}/price-latest`);
  },
  async create(input: { product_id: string; wholesale_price: number; retail_price: number; effective_date?: string }): Promise<{ id: string }> {
    return fetchJson(`/api/product-prices`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async update(id: string, input: Partial<{ wholesale_price: number; retail_price: number; effective_date: string }>): Promise<{ id: string }> {
    return fetchJson(`/api/product-prices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  async delete(id: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/product-prices/${id}`, {
      method: 'DELETE',
    });
  },
};


