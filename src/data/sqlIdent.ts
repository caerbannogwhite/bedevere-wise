/**
 * Quote a SQL identifier (table name, view name, etc.) so it survives
 * characters like dashes, dots, reserved words, and whitespace. DuckDB
 * uses double quotes for identifiers; embedded double quotes are escaped
 * by doubling.
 */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
