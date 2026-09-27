import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillTone = "paid" | "partial" | "pending" | "overdue" | "sell" | "buy" | "neutral";

const toneClass: Record<PillTone, string> = {
  paid: "bg-success-light text-success-strong",
  partial: "bg-warning-light text-warning-strong",
  pending: "bg-pending-light text-pending-strong",
  overdue: "bg-destructive/10 text-destructive-strong",
  sell: "bg-primary-light text-primary-strong",
  buy: "bg-success-light text-success-strong",
  neutral: "bg-muted text-muted-foreground",
};

/** Soft pill for a state (payment status, invoice type). The dot repeats the colour for scanning. */
export function StatusPill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", toneClass[tone], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Pill for an invoice payment status string ("paid" | "partial" | "overdue" | anything else = pending). */
export function PaymentStatusPill({ status, children, className }: { status: string | null | undefined; children: ReactNode; className?: string }) {
  const tone: PillTone = status === "paid" ? "paid" : status === "partial" ? "partial" : status === "overdue" ? "overdue" : "pending";
  return <StatusPill tone={tone} className={className}>{children}</StatusPill>;
}
