import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface InvoicePageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
}

/** Page title row shared by the invoice pages: icon, title, one-line description, actions. */
export function InvoicePageHeader({ title, description, icon: Icon, actions }: InvoicePageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-light text-primary">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight [text-wrap:balance]">{title}</h1>
          {description && <p className="text-[12px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
