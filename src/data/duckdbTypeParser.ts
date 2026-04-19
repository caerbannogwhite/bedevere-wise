/**
 * A tiny parser for DuckDB's `column_type` strings (as returned by
 * `DESCRIBE`). Produces a structured tree that lets `unwrapArrowValue`
 * apply DECIMAL scales and recurse into STRUCT fields / LIST items with
 * confident type info, independent of whatever the apache-arrow runtime
 * exposes on its Vector type objects.
 *
 * Understands the shapes we actually encounter:
 *   - INTEGER, VARCHAR, VARCHAR(255), DATE, TIMESTAMP, ...
 *   - DECIMAL(precision, scale) / NUMERIC(precision, scale)
 *   - STRUCT(a INTEGER, b DECIMAL(2,1))
 *   - LIST(INTEGER) and TYPE[] / TYPE[N] suffix forms (including nesting)
 *   - MAP(KEY_TYPE, VALUE_TYPE)
 *
 * Anything not recognised collapses to { kind: "scalar", name }.
 */

export type TypeNode =
  | { kind: "scalar"; name: string }
  | { kind: "decimal"; precision?: number; scale?: number }
  | { kind: "list"; element: TypeNode }
  | { kind: "struct"; fields: Array<{ name: string; type: TypeNode }> }
  | { kind: "map"; key: TypeNode; value: TypeNode };

export function parseDuckDBType(raw: string | null | undefined): TypeNode | undefined {
  if (!raw) return undefined;
  try {
    const p = new Parser(raw);
    const node = p.parseType();
    return node;
  } catch {
    return undefined;
  }
}

class Parser {
  private s: string;
  private i: number = 0;

  constructor(s: string) {
    this.s = s;
  }

  parseType(): TypeNode {
    this.skipWs();
    const identStart = this.i;
    const ident = this.readIdent();
    const upper = ident.toUpperCase();

    let node: TypeNode;

    if (upper === "STRUCT" && this.peekNonWs() === "(") {
      this.expect("(");
      const fields: Array<{ name: string; type: TypeNode }> = [];
      this.skipWs();
      while (this.peek() !== ")") {
        const name = this.readIdent();
        const ftype = this.parseType();
        fields.push({ name, type: ftype });
        this.skipWs();
        if (this.peek() === ",") {
          this.i++;
          this.skipWs();
          continue;
        }
        break;
      }
      this.expect(")");
      node = { kind: "struct", fields };
    } else if (upper === "LIST" && this.peekNonWs() === "(") {
      this.expect("(");
      const elem = this.parseType();
      this.skipWs();
      this.expect(")");
      node = { kind: "list", element: elem };
    } else if (upper === "MAP" && this.peekNonWs() === "(") {
      this.expect("(");
      const key = this.parseType();
      this.skipWs();
      this.expect(",");
      const value = this.parseType();
      this.skipWs();
      this.expect(")");
      node = { kind: "map", key, value };
    } else if (upper === "DECIMAL" || upper === "NUMERIC" || upper === "DEC") {
      let precision: number | undefined;
      let scale: number | undefined;
      if (this.peekNonWs() === "(") {
        this.expect("(");
        this.skipWs();
        const a = this.readIdent();
        if (a.length > 0) precision = Number(a);
        this.skipWs();
        if (this.peek() === ",") {
          this.i++;
          this.skipWs();
          const b = this.readIdent();
          if (b.length > 0) scale = Number(b);
          this.skipWs();
        }
        this.expect(")");
      }
      node = { kind: "decimal", precision, scale };
    } else {
      // Scalar with optional parens (e.g. VARCHAR(255), TIMESTAMP(6)).
      // Consume and discard the parenthesised group.
      if (this.peekNonWs() === "(") {
        this.expect("(");
        let depth = 1;
        while (this.i < this.s.length && depth > 0) {
          const ch = this.s[this.i++];
          if (ch === "(") depth++;
          else if (ch === ")") depth--;
        }
      }
      node = { kind: "scalar", name: this.s.slice(identStart, this.i).trim() };
    }

    // Array suffix: TYPE[], TYPE[N], or stacked TYPE[][N]...
    this.skipWs();
    while (this.peek() === "[") {
      this.i++;
      // Optional size digits
      while (this.i < this.s.length && /\d/.test(this.s[this.i])) this.i++;
      this.skipWs();
      this.expect("]");
      node = { kind: "list", element: node };
      this.skipWs();
    }

    return node;
  }

  private peek(): string {
    return this.s[this.i] ?? "";
  }

  private peekNonWs(): string {
    let j = this.i;
    while (j < this.s.length && /\s/.test(this.s[j])) j++;
    return this.s[j] ?? "";
  }

  private skipWs(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }

  private expect(ch: string): void {
    this.skipWs();
    if (this.s[this.i] !== ch) {
      throw new Error(`expected '${ch}' at ${this.i}`);
    }
    this.i++;
  }

  private readIdent(): string {
    this.skipWs();
    const start = this.i;
    while (this.i < this.s.length && /[A-Za-z0-9_]/.test(this.s[this.i])) this.i++;
    return this.s.slice(start, this.i);
  }
}
