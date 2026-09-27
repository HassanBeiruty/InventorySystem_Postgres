import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "default" | "primary" | "success" | "warning" | "pending" | "destructive" | "muted";

const toneText: Record<Tone, string> = {
  default: "text-foreground",
  primary: "text-primary-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
  pending: "text-pending-strong",
  destructive: "text-destructive-strong",
  muted: "text-muted-foreground",
};

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
}

/** Small summary figure: label with icon, then the value in tabular numbers. */
export function StatTile({ label, value, icon: Icon, tone = "default" }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", toneText[tone])} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-0.5 truncate text-base font-bold tabular-nums", toneText[tone])}>{value}</div>
    </div>
  );
}
