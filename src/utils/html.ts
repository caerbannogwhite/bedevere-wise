/**
 * Escape the three characters that break HTML parsing when a user-supplied
 * string is interpolated into innerHTML. Intentionally narrow: quotes are
 * not escaped because the call sites never inject into attribute values.
 */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
