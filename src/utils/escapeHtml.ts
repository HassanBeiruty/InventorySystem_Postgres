/**
 * Escape a value for insertion into an HTML string (print windows built with document.write).
 * React escapes everything it renders on its own; this is only for hand-built HTML.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
