import { useCallback, useEffect, useState, type KeyboardEvent } from "react";

/** How long typing must pause before a list search runs, so a whole word can be typed first. */
export const SEARCH_DELAY_MS = 700;

/**
 * The text a list is filtered by, following what is typed in its search box. It catches up
 * once typing pauses for SEARCH_DELAY_MS, at once on Enter (pass `searchOnEnter` to the
 * input's onKeyDown), and at once when the box is cleared.
 *
 * Used by every list search box so they all behave the same. Pickers that suggest matches
 * while typing (the invoice product search, product/invoice comboboxes) stay instant.
 */
export function useSearchText(text: string) {
  const [applied, setApplied] = useState(text);

  useEffect(() => {
    if (text === applied) return;
    if (!text.trim()) {
      setApplied(text);
      return;
    }
    const timer = setTimeout(() => setApplied(text), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, applied]);

  const searchOnEnter = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setApplied(text);
      }
    },
    [text],
  );

  return { applied, searchOnEnter };
}
