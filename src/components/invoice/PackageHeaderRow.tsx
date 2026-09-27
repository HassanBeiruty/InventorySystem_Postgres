import { Package } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import type { PackageHeaderRow as PackageHeader } from "@/utils/invoicePackageGroups";

/** Package name, qty × price and total, on one line. */
export function PackageHeaderLine({ row }: { row: PackageHeader }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
      <Package className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      <span className="font-bold text-primary-strong">{row.name}</span>
      <span className="tabular-nums text-muted-foreground">
        {row.qty} × ${row.price.toFixed(2)}
      </span>
      <span className="ms-auto font-bold tabular-nums">${row.total.toFixed(2)}</span>
    </span>
  );
}

/** Header row placed above a package's lines in the invoice item tables. */
export function PackageHeaderRow({ row, colSpan }: { row: PackageHeader; colSpan: number }) {
  return (
    <TableRow className="bg-primary-light hover:bg-primary-light">
      <TableCell colSpan={colSpan} className="py-1.5">
        <PackageHeaderLine row={row} />
      </TableCell>
    </TableRow>
  );
}
