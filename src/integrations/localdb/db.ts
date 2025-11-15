import Dexie, { Table } from "dexie";
import { getTodayLebanon } from "@/utils/dateUtils";

export interface UserEntity {
  id: number;
  email: string;
  passwordHash: string; // simple hash for demo only
  created_at: string;
}

export interface ProductEntity {
  id: number;
  name: string;
  barcode: string | null;
  category_id: number | null;
  description: string | null;
  sku: string | null;
  shelf: string | null;
  created_at: string;
  category_name?: string; // From JOIN with categories
}

export interface CustomerEntity {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  credit_limit: number;
  created_at: string;
}

export interface SupplierEntity {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface InvoiceEntity {
  id: number;
  invoice_type: "buy" | "sell";
  customer_id: number | null;
  supplier_id: number | null;
  total_amount: number;
  is_paid: boolean;
  invoice_date: string; // ISO
  due_date: string | null;
  amount_paid?: number;
  payment_status?: "pending" | "partial" | "paid";
  created_at: string;
}

export interface InvoiceItemEntity {
  id: number;
  invoice_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  price_type: "retail" | "wholesale";
  is_private_price: boolean;
  private_price_amount: number | null;
  private_price_note: string | null;
}

export interface DailyStockEntity {
  id: number;
  product_id: number;
  available_qty: number;
  avg_cost: number;
  date: string; // snapshot date (yyyy-mm-dd)
  created_at: string;
  updated_at: string;
}

export interface StockMovementEntity {
  id: number;
  product_id: number;
  invoice_id: number;
  invoice_date: string;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  created_at: string;
}

export class LocalDB extends Dexie {
  users!: Table<UserEntity, number>;
  products!: Table<ProductEntity, number>;
  customers!: Table<CustomerEntity, number>;
  suppliers!: Table<SupplierEntity, number>;
  invoices!: Table<InvoiceEntity, number>;
  invoice_items!: Table<InvoiceItemEntity, number>;
  daily_stock!: Table<DailyStockEntity, number>;
  stock_movements!: Table<StockMovementEntity, number>;

  constructor() {
    super("invoice_system_local");
    this.version(1).stores({
      users: "id, email",
      products: "id, name, barcode",
      customers: "id, name",
      suppliers: "id, name",
      invoices: "id, invoice_type, customer_id, supplier_id, invoice_date",
      invoice_items: "id, invoice_id, product_id",
      daily_stock: "id, product_id, date, avg_cost",
      stock_movements: "id, product_id, invoice_id, invoice_date",
    });

    // Add missing indexes used by queries (upgrade path for existing browsers)
    this.version(2).stores({
      users: "id, email, created_at",
      products: "id, name, barcode, created_at",
      customers: "id, name, created_at",
      suppliers: "id, name, created_at",
      invoices: "id, invoice_type, customer_id, supplier_id, invoice_date, created_at",
      invoice_items: "id, invoice_id, product_id",
      daily_stock: "id, product_id, date, available_qty",
      stock_movements: "id, product_id, invoice_id, invoice_date",
    }).upgrade(async (tx) => {
      // nothing to migrate for data; indexes will be created automatically
    });

    // Force-refresh indexes for users experiencing missing index errors
    this.version(3).stores({
      users: "id, email, created_at",
      products: "id, name, barcode, created_at",
      customers: "id, name, created_at",
      suppliers: "id, name, created_at",
      invoices: "id, invoice_type, customer_id, supplier_id, invoice_date, created_at",
      invoice_items: "id, invoice_id, product_id",
      daily_stock: "id, product_id, date, available_qty",
      stock_movements: "id, product_id, invoice_id, invoice_date",
    });
  }
}

export const db = new LocalDB();

export function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// These functions use Lebanon timezone (Asia/Beirut) for consistency with the main application
export function nowIso(): string {
  // Return Lebanon timezone ISO string for local storage consistency
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
  
  // Return as ISO string (without Z, as it's local Lebanon time)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000`;
}

export function todayDate(): string {
  // Return today's date in Lebanon timezone
  return getTodayLebanon();
}


