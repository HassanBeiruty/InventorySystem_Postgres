import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Right side of the header strip, e.g. "5 lines" or a search box. */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** A card with a header strip (title, description, right-aligned meta) and a padded body. */
export function SectionCard({ title, description, icon: Icon, meta, children, className, bodyClassName }: SectionCardProps) {
  return (
    <section className={cn("rounded-xl border-2 border-border bg-card", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-t-[10px] border-b border-border bg-gradient-to-r from-muted/80 to-transparent px-3 py-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold">
            {Icon && <Icon className="h-4 w-4 text-primary" aria-hidden="true" />}
            {title}
          </h2>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
        {meta && <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums text-muted-foreground">{meta}</div>}
      </header>
      <div className={cn("space-y-2 p-3", bodyClassName)}>{children}</div>
    </section>
  );
}
