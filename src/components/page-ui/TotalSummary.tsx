import type { ReactNode } from "react";

/** The invoice total box: label, large primary figure, optional one-line detail. */
export function TotalSummary({ label, amount, detail }: { label: ReactNode; amount: number; detail?: ReactNode }) {
  return (
    <div className="ms-auto rounded-xl border-2 border-border bg-gradient-to-br from-primary-light to-card px-4 py-2 text-end">
      <div className="text-[12px] font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums tracking-tight text-primary-strong">${amount.toFixed(2)}</div>
      {detail && <div className="text-[11px] tabular-nums text-muted-foreground">{detail}</div>}
    </div>
  );
}
