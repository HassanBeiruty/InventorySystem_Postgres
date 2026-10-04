import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QtyStepperProps {
  id?: string;
  value: number;
  /** Called with every whole number >= min the user enters. The parent may reject it (e.g. stock). */
  onChange: (value: number) => void;
  min?: number;
  /** Disables the + button at this value. Typed values are left to the parent to validate. */
  max?: number;
  disabled?: boolean;
  size?: "sm" | "lg";
  className?: string;
  "aria-label"?: string;
}

/** Whole-number input with − / + buttons. Typing is free; the last valid value returns on blur. */
export function QtyStepper({ id, value, onChange, min = 1, max, disabled, size = "sm", className, ...rest }: QtyStepperProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const height = size === "lg" ? "h-9" : "h-8";
  const button = cn(
    "grid w-8 shrink-0 place-items-center border border-input bg-muted text-foreground transition-colors hover:bg-muted/60",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40",
  );

  return (
    <div className={cn("flex items-stretch", height, className)}>
      <button
        type="button"
        className={cn(button, "rounded-s-lg")}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label="Decrease"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={text}
        disabled={disabled}
        aria-label={rest["aria-label"]}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          setText(digits);
          const next = parseInt(digits, 10);
          if (Number.isInteger(next) && next >= min && next !== value) onChange(next);
        }}
        onBlur={() => setText(String(value))}
        className={cn(
          "w-full min-w-0 border-y border-input bg-background text-center tabular-nums text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 dark:bg-card/50",
          size === "lg" ? "text-[15px] font-bold" : "text-[13px]",
        )}
      />
      <button
        type="button"
        className={cn(button, "rounded-e-lg")}
        onClick={() => onChange(value + 1)}
        disabled={disabled || (max !== undefined && value >= max)}
        aria-label="Increase"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
