import Dexie, { Table } from "dexie";

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
  created_at: string;
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

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}


