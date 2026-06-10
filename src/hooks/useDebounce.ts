import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms
 * have passed without `value` changing. Useful for search inputs to avoid
 * filtering/fetching on every keystroke.
 */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debouncedValue;
}
