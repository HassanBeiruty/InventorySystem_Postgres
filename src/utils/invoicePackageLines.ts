/**
 * Pure transforms between a package and the invoice form lines it produces.
 *
 * A package on a sell invoice is a run of ordinary lines that share a package_id. Their quantity
 * and private price are driven by two numbers only, the package qty and the package price;
 * everything downstream (validation, stock, payments, profit) sees ordinary private-price lines.
 */
import type { PackageEntity } from "@/integrations/api/repo";
import type { InvoiceFormItem } from "@/components/invoice/types";
import { distributePackagePrice } from "./packagePricing";

export const packageNote = (packageName: string) => `Package: ${packageName}`;

export const isPackageLine = (item: InvoiceFormItem) => !!item.package_id;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PackageGroup {
  packageId: string;
  name: string;
  qty: number;
  price: number;
  /** Positions of the package's lines in the items array, in order. */
  indexes: number[];
  lines: InvoiceFormItem[];
}

/** Every package on the invoice, keyed by package id, in order of first appearance. */
export function collectPackageGroups(items: InvoiceFormItem[]): Map<string, PackageGroup> {
  const groups = new Map<string, PackageGroup>();
  items.forEach((item, index) => {
    if (!item.package_id) return;
    let group = groups.get(item.package_id);
    if (!group) {
      group = {
        packageId: item.package_id,
        name: item.package_name || "",
        qty: item.package_qty || 1,
        price: item.package_price || 0,
        indexes: [],
        lines: [],
      };
      groups.set(item.package_id, group);
    }
    group.indexes.push(index);
    group.lines.push(item);
  });
  return groups;
}

export interface PackageConflict {
  productId: string;
  /** Name of the package the product already sits in, or null when it is its own line. */
  inPackage: string | null;
}

/**
 * Products of `pkg` that are already on the invoice, either as their own line or inside another
 * package. A product may appear only once per invoice (enforced by the form and the server).
 */
export function findPackageConflicts(items: InvoiceFormItem[], pkg: PackageEntity, ignoreIndex?: number): PackageConflict[] {
  const conflicts: PackageConflict[] = [];
  for (const packageItem of pkg.items) {
    const productId = String(packageItem.product_id);
    const index = items.findIndex((item, i) => i !== ignoreIndex && String(item.product_id) === productId);
    if (index !== -1) {
      conflicts.push({ productId, inPackage: items[index].package_id ? items[index].package_name || "" : null });
    }
  }
  return conflicts;
}

/**
 * Recompute the lines of one package from its qty and price: line quantity = units per package
 * x package qty, and the package price is split into each line's private price (by retail).
 * Lines of other packages and ordinary lines are returned untouched.
 */
export function applyPackage(
  items: InvoiceFormItem[],
  packageId: string,
  changes: { qty?: number; price?: number } = {},
): InvoiceFormItem[] {
  const group = collectPackageGroups(items).get(packageId);
  if (!group) return items;

  const qty = Math.max(1, Math.round(changes.qty ?? group.qty));
  const price = changes.price ?? group.price;
  const split = distributePackagePrice(
    group.lines.map((line) => ({ listUnitPrice: line.unit_price, qtyPerPackage: line.package_unit_qty || 1 })),
    price,
  );

  const next = items.slice();
  group.indexes.forEach((itemIndex, k) => {
    const line = items[itemIndex];
    const quantity = (line.package_unit_qty || 1) * qty;
    const unitPrice = split.unitPrices[k];
    next[itemIndex] = {
      ...line,
      quantity,
      is_private_price: true,
      private_price_amount: unitPrice,
      private_price_note: packageNote(line.package_name || group.name),
      total_price: round2(unitPrice * quantity),
      package_qty: qty,
      package_price: split.achievedPrice,
    };
  });
  return next;
}

/**
 * The lines for one package at qty 1 and its default price. `buildRow` is the form's own
 * default-line builder, so list prices come from the same place as a manual selection.
 */
export function createPackageLines(
  pkg: PackageEntity,
  buildRow: (productId: string) => InvoiceFormItem,
): InvoiceFormItem[] {
  const packageId = String(pkg.id);
  const lines = pkg.items.map((packageItem) => ({
    ...buildRow(String(packageItem.product_id)),
    package_id: packageId,
    package_name: pkg.name,
    package_unit_qty: packageItem.quantity,
    package_qty: 1,
    package_price: Number(pkg.default_price),
  }));
  return applyPackage(lines, packageId);
}

export function removePackage(items: InvoiceFormItem[], packageId: string): InvoiceFormItem[] {
  return items.filter((item) => item.package_id !== packageId);
}

/**
 * Products whose quantity would exceed the available stock at the given package qty.
 * `getAvailable(productId, index)` returns what is available for the line at `index`
 * (null when stock is not tracked for the invoice type).
 */
export function findPackageStockShortages(
  items: InvoiceFormItem[],
  packageId: string,
  qty: number,
  getAvailable: (productId: string, index: number) => number | null,
): Array<{ productId: string; requested: number; available: number }> {
  const group = collectPackageGroups(items).get(packageId);
  if (!group) return [];
  const shortages: Array<{ productId: string; requested: number; available: number }> = [];
  group.indexes.forEach((itemIndex) => {
    const line = items[itemIndex];
    const requested = (line.package_unit_qty || 1) * qty;
    const available = getAvailable(String(line.product_id), itemIndex);
    if (available !== null && requested > available) {
      shortages.push({ productId: String(line.product_id), requested, available });
    }
  });
  return shortages;
}

/**
 * Edit mode: rebuild the form-only fields of saved package lines and keep each package's lines
 * together (right after its first line), so the form can render them as one group.
 */
export function regroupLoadedLines(items: InvoiceFormItem[]): InvoiceFormItem[] {
  const normalized = items.map((item) => {
    if (!item.package_id) return item;
    const qty = Math.max(1, Number(item.package_qty) || 1);
    return {
      ...item,
      package_id: String(item.package_id),
      package_qty: qty,
      package_price: Number(item.package_price) || 0,
      package_unit_qty: Math.max(1, Math.round(item.quantity / qty)),
    };
  });

  const ordered: InvoiceFormItem[] = [];
  const placed = new Set<string>();
  for (const item of normalized) {
    if (!item.package_id) {
      ordered.push(item);
    } else if (!placed.has(item.package_id)) {
      placed.add(item.package_id);
      ordered.push(...normalized.filter((line) => line.package_id === item.package_id));
    }
  }
  return ordered;
}
