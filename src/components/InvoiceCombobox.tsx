import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface InvoiceOption {
  id: number | string;
  customers?: { name?: string | null } | null;
  suppliers?: { name?: string | null } | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
}

interface InvoiceComboboxProps {
  invoices: InvoiceOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  allLabel?: string;
  includeAllOption?: boolean;
  className?: string;
  disabled?: boolean;
}

const getInvoiceLabel = (invoice: InvoiceOption, withBalance = false) => {
  const entityName = invoice.customers?.name || invoice.suppliers?.name || "N/A";
  if (!withBalance) {
    return `#${invoice.id} - ${entityName}`;
  }
  const total = Number(invoice.total_amount || 0);
  const paid = Number(invoice.amount_paid || 0);
  const remaining = total - paid;
  return `#${invoice.id} - ${entityName} - $${total.toFixed(2)} (Remaining: $${remaining.toFixed(2)})`;
};

export default function InvoiceCombobox({
  invoices,
  value,
  onValueChange,
  placeholder = "Select an invoice",
  allLabel = "All Invoices",
  includeAllOption = false,
  className,
  disabled,
}: InvoiceComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    if (includeAllOption && value === "all") return allLabel;
    const invoice = invoices.find((inv) => String(inv.id) === value);
    return invoice ? getInvoiceLabel(invoice, includeAllOption ? false : true) : "";
  }, [invoices, value, includeAllOption, allLabel]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between h-9 font-normal text-sm",
            !selectedLabel && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const item = itemValue.toLowerCase();
            return item.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search invoice..." className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>No invoice found.</CommandEmpty>
            <CommandGroup>
              {includeAllOption && (
                <CommandItem
                  key="all"
                  value={`all ${allLabel}`}
                  onSelect={() => {
                    onValueChange("all");
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", value === "all" ? "opacity-100" : "opacity-0")} />
                  {allLabel}
                </CommandItem>
              )}
              {invoices.map((invoice) => (
                <CommandItem
                  key={invoice.id}
                  value={`${getInvoiceLabel(invoice, true)} ${invoice.id}`}
                  onSelect={() => {
                    onValueChange(String(invoice.id));
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === String(invoice.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {getInvoiceLabel(invoice, true)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
