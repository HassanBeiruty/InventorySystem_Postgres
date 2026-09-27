/**
 * Group saved invoice lines for display: each package gets a header row followed by its lines;
 * ordinary lines pass through unchanged. Used by the invoice views, print and PDF.
 */

export interface SavedInvoiceLine {
  total_price?: number | string | null;
  package_id?: number | string | null;
  package_name?: string | null;
  package_qty?: number | string | null;
  package_price?: number | string | null;
}

export interface PackageHeaderRow {
  kind: "package";
  key: string;
  name: string;
  qty: number;
  /** Price of one package. */
  price: number;
  /** What the package's lines add up to (price x qty). */
  total: number;
  lineCount: number;
}

export interface ItemRow<T> {
  kind: "item";
  item: T;
  inPackage: boolean;
}

export type InvoiceDisplayRow<T> = PackageHeaderRow | ItemRow<T>;

const hasPackage = (line: SavedInvoiceLine) => line.package_id !== null && line.package_id !== undefined && line.package_id !== "";

export function groupInvoiceItems<T extends SavedInvoiceLine>(items: T[]): InvoiceDisplayRow<T>[] {
  const rows: InvoiceDisplayRow<T>[] = [];
  const placed = new Set<string>();

  for (const item of items) {
    if (!hasPackage(item)) {
      rows.push({ kind: "item", item, inPackage: false });
      continue;
    }
    const key = String(item.package_id);
    if (placed.has(key)) continue;
    placed.add(key);

    const lines = items.filter((line) => hasPackage(line) && String(line.package_id) === key);
    const total = lines.reduce((sum, line) => sum + Number(line.total_price || 0), 0);
    rows.push({
      kind: "package",
      key,
      name: item.package_name || "Package",
      qty: Number(item.package_qty) || 1,
      price: Number(item.package_price) || 0,
      total: Math.round(total * 100) / 100,
      lineCount: lines.length,
    });
    for (const line of lines) rows.push({ kind: "item", item: line, inPackage: true });
  }
  return rows;
}

/** Short summary for previews: each package counts as one entry, ordinary lines as themselves. */
export function summarizeInvoiceItems<T extends SavedInvoiceLine>(items: T[]): Array<PackageHeaderRow | ItemRow<T>> {
  return groupInvoiceItems(items).filter((row) => row.kind === "package" || !row.inPackage);
}

/** One-line label for a package header, e.g. "Package: Security Camera Kit × 2 · $320.00". */
export function packageHeaderLabel(row: PackageHeaderRow): string {
  return `Package: ${row.name} × ${row.qty} · $${row.total.toFixed(2)}`;
}

/** Package header as a table row for the printable invoice HTML. */
export function packageHeaderHtml(row: PackageHeaderRow, colSpan: number): string {
  return `<tr class="package-row"><td colspan="${colSpan}" style="background:#f5efff;font-weight:700;color:#6b21a8;">${packageHeaderLabel(row)}</td></tr>`;
}

/** Package header as a jspdf-autotable body row spanning the whole table. */
export function packageHeaderPdfRow(row: PackageHeaderRow, colSpan: number) {
  return [{
    content: packageHeaderLabel(row),
    colSpan,
    styles: { fontStyle: "bold" as const, fillColor: [245, 239, 255] as [number, number, number], textColor: [107, 33, 168] as [number, number, number] },
  }];
}
