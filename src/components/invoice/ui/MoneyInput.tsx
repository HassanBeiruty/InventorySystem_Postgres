import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { parseMoney } from "@/utils/money";

interface MoneyInputProps {
  id?: string;
  /** The applied amount. Shown with 2 decimals whenever the field is not being edited. */
  value: number;
  /** Called with every valid amount the user types (> 0, or >= 0 when allowZero). */
  onChange: (value: number) => void;
  /** Called with the raw typed amount (NaN when not a number), for inline hints. */
  onTyping?: (value: number) => void;
  allowZero?: boolean;
  disabled?: boolean;
  size?: "sm" | "lg";
  className?: string;
  "aria-describedby"?: string;
}

/** Dollar amount text box with a "$" prefix. Invalid input is flagged and never applied. */
export function MoneyInput({ id, value, onChange, onTyping, allowZero, disabled, size = "sm", className, ...rest }: MoneyInputProps) {
  const [text, setText] = useState(value.toFixed(2));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value.toFixed(2));
  }, [value, editing]);

  const typed = parseMoney(text);
  const invalid = Number.isNaN(typed) || (allowZero ? typed < 0 : typed <= 0);
  const height = size === "lg" ? "h-9" : "h-8";

  return (
    <div className={cn("flex items-stretch", height, className)}>
      <span
        className={cn(
          "grid place-items-center rounded-s-lg border border-e-0 border-input bg-muted px-2.5 font-semibold text-muted-foreground",
          invalid && "border-destructive",
        )}
        aria-hidden="true"
      >
        $
      </span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={rest["aria-describedby"]}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          const next = e.target.value.replace(",", ".");
          setText(next);
          const amount = parseMoney(next);
          onTyping?.(amount);
          if (!Number.isNaN(amount) && (allowZero ? amount >= 0 : amount > 0)) onChange(amount);
        }}
        onBlur={() => {
          setEditing(false);
          setText(value.toFixed(2));
          onTyping?.(value);
        }}
        className={cn(
          "w-full min-w-0 rounded-e-lg border border-input bg-background px-2.5 tabular-nums text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 dark:bg-card/50",
          size === "lg" ? "text-[15px] font-bold" : "text-[13px]",
          invalid && "border-destructive focus-visible:ring-destructive/40",
        )}
      />
    </div>
  );
}
