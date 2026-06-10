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

interface ProductOption {
  id: number | string;
  name?: string | null;
  barcode?: string | null;
  sku?: string | null;
}

interface ProductComboboxProps {
  products: ProductOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  allLabel?: string;
  includeAllOption?: boolean;
  className?: string;
  disabled?: boolean;
}

const getProductLabel = (product: ProductOption) => {
  const code = product.barcode || product.sku;
  return `#${product.id} - ${product.name || "N/A"}${code ? ` - ${code}` : ""}`;
};

export default function ProductCombobox({
  products,
  value,
  onValueChange,
  placeholder = "Select a product",
  allLabel = "All Products",
  includeAllOption = false,
  className,
  disabled,
}: ProductComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    if (includeAllOption && value === "all") return allLabel;
    const product = products.find((p) => String(p.id) === value);
    return product ? getProductLabel(product) : "";
  }, [products, value, includeAllOption, allLabel]);

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
          <CommandInput placeholder="Search product..." className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
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
              {products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={`${getProductLabel(product)} ${product.id}`}
                  onSelect={() => {
                    onValueChange(String(product.id));
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === String(product.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {getProductLabel(product)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
