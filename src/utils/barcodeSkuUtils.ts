/**
 * Normalizes barcode or SKU by removing all spaces and converting to uppercase
 * This ensures consistent comparison regardless of how values are entered
 * Matches the server-side normalization logic in server/routes/api.js
 * 
 * @param value - The barcode or SKU value to normalize
 * @returns Normalized value (uppercase, no spaces) or null if input is falsy
 * 
 * @example
 * normalizeBarcodeOrSku("12 34 56") // Returns "123456"
 * normalizeBarcodeOrSku("abc 123") // Returns "ABC123"
 * normalizeBarcodeOrSku("  ABC-123  ") // Returns "ABC-123"
 * normalizeBarcodeOrSku(null) // Returns null
 * normalizeBarcodeOrSku("") // Returns null
 */
export function normalizeBarcodeOrSku(value: string | null | undefined): string | null {
  if (!value) return null;
  // Remove all spaces from the string (not just trim) and convert to uppercase for case-insensitive matching
  const normalized = String(value).replace(/\s+/g, '').toUpperCase();
  return normalized || null;
}

/**
 * Normalizes a barcode or SKU value for search/filtering purposes
 * For search, we want case-insensitive matching, so we normalize both the search term and the stored values
 * 
 * @param value - The barcode or SKU value to normalize for search
 * @returns Normalized value (uppercase, no spaces) or empty string if input is falsy (for search compatibility)
 */
export function normalizeBarcodeOrSkuForSearch(value: string | null | undefined): string {
  return normalizeBarcodeOrSku(value) || '';
}

