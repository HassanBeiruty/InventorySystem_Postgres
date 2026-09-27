import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldLabelProps {
  htmlFor?: string;
  icon?: LucideIcon;
  /** Muted text after the label, e.g. "(optional)". */
  hint?: ReactNode;
  /** Right-aligned content on the same line, e.g. a stock indicator. */
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Form field label: 11px medium, optional leading icon, hint and trailing slot. */
export function FieldLabel({ htmlFor, icon: Icon, hint, trailing, children, className }: FieldLabelProps) {
  return (
    <div className={cn("flex min-h-[18px] items-center justify-between gap-2", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
        {children}
        {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
      </label>
      {trailing}
    </div>
  );
}
