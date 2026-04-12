import { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import { DuckDBService } from "../../data/DuckDBService";

const DUCKDB_FUNCTIONS: string[] = [
  // Aggregate functions
  "SUM", "AVG", "COUNT", "MIN", "MAX", "STDDEV", "VARIANCE", "MEDIAN",
  "STRING_AGG", "LIST", "ARRAY_AGG", "GROUP_CONCAT", "FIRST", "LAST",
  "ANY_VALUE", "BIT_AND", "BIT_OR", "BIT_XOR", "BOOL_AND", "BOOL_OR",
  // Scalar functions
  "ABS", "CEIL", "FLOOR", "ROUND", "SQRT", "POWER", "LOG", "LN", "EXP",
  "MOD", "SIGN", "GREATEST", "LEAST", "RANDOM",
  // String functions
  "CONCAT", "LENGTH", "UPPER", "LOWER", "TRIM", "LTRIM", "RTRIM",
  "SUBSTRING", "REPLACE", "REVERSE", "LEFT", "RIGHT", "LPAD", "RPAD",
  "REPEAT", "CONTAINS", "STARTS_WITH", "ENDS_WITH", "REGEXP_MATCHES",
  "SPLIT_PART", "STRING_SPLIT", "STRIP_ACCENTS",
  // Date/time functions
  "CURRENT_DATE", "CURRENT_TIMESTAMP", "NOW", "DATE_PART", "DATE_TRUNC",
  "DATE_DIFF", "DATE_ADD", "DATE_SUB", "EXTRACT", "STRFTIME", "STRPTIME",
  "AGE", "MAKE_DATE", "MAKE_TIMESTAMP",
  // Conversion
  "CAST", "TRY_CAST", "TYPEOF",
  // Conditional
  "CASE", "WHEN", "THEN", "ELSE", "END", "COALESCE", "NULLIF",
  "IF", "IIF", "IFNULL",
  // Window functions
  "ROW_NUMBER", "RANK", "DENSE_RANK", "NTILE", "LAG", "LEAD",
  "FIRST_VALUE", "LAST_VALUE", "NTH_VALUE",
  // Table functions
  "UNNEST", "GENERATE_SERIES", "RANGE",
  "READ_CSV", "READ_PARQUET", "READ_JSON",
];

const SQL_KEYWORDS: string[] = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING",
  "LIMIT", "OFFSET", "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN",
  "FULL JOIN", "CROSS JOIN", "ON", "USING", "AS", "AND", "OR", "NOT",
  "IN", "EXISTS", "BETWEEN", "LIKE", "ILIKE", "IS NULL", "IS NOT NULL",
  "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM",
  "CREATE TABLE", "CREATE VIEW", "CREATE TEMPORARY TABLE",
  "DROP TABLE", "DROP VIEW", "ALTER TABLE", "RENAME TO",
  "UNION", "UNION ALL", "INTERSECT", "EXCEPT",
  "DISTINCT", "ALL", "ASC", "DESC", "NULLS FIRST", "NULLS LAST",
  "WITH", "RECURSIVE", "OVER", "PARTITION BY", "ROWS", "FILTER",
  "DESCRIBE", "SHOW TABLES", "EXPLAIN", "COPY", "EXPORT",
];

interface SchemaInfo {
  tables: Map<string, string[]>; // table name -> column names
  lastRefresh: number;
}

export class SqlAutoComplete {
  private duckDBService: DuckDBService;
  private schema: SchemaInfo = { tables: new Map(), lastRefresh: 0 };
  private refreshInterval = 10000; // 10 seconds

  constructor(duckDBService: DuckDBService) {
    this.duckDBService = duckDBService;
  }

  public async refreshSchema(): Promise<void> {
    try {
      const tables = await this.duckDBService.listTables();
      const newSchema: Map<string, string[]> = new Map();

      for (const table of tables) {
        const columns = await this.duckDBService.getTableInfo(table);
        newSchema.set(table, columns.map((col: any) => col.column_name));
      }

      this.schema = { tables: newSchema, lastRefresh: Date.now() };
    } catch (e) {
      console.error("Failed to refresh SQL schema:", e);
    }
  }

  public getCompletionSource() {
    return (context: CompletionContext): CompletionResult | null => {
      const word = context.matchBefore(/[\w.]+/);
      if (!word && !context.explicit) return null;

      // Refresh schema if stale
      if (Date.now() - this.schema.lastRefresh > this.refreshInterval) {
        this.refreshSchema();
      }

      const from = word ? word.from : context.pos;
      const text = word ? word.text : "";
      const textUpper = text.toUpperCase();

      // Check if we're completing after "tablename."
      const dotIndex = text.lastIndexOf(".");
      if (dotIndex >= 0) {
        const tableName = text.substring(0, dotIndex);
        const columns = this.schema.tables.get(tableName);
        if (columns) {
          const prefix = text.substring(dotIndex + 1).toLowerCase();
          return {
            from: from + dotIndex + 1,
            options: columns
              .filter((col) => col.toLowerCase().startsWith(prefix))
              .map((col): Completion => ({
                label: col,
                type: "property",
                detail: "column",
              })),
          };
        }
      }

      const options: Completion[] = [];

      // Table names
      for (const [table, columns] of this.schema.tables) {
        if (table.toUpperCase().startsWith(textUpper)) {
          options.push({
            label: table,
            type: "class",
            detail: `table (${columns.length} cols)`,
          });
        }
      }

      // Column names from all tables
      for (const [table, columns] of this.schema.tables) {
        for (const col of columns) {
          if (col.toUpperCase().startsWith(textUpper)) {
            options.push({
              label: col,
              type: "property",
              detail: `${table}.${col}`,
            });
          }
        }
      }

      // SQL keywords
      for (const kw of SQL_KEYWORDS) {
        if (kw.startsWith(textUpper)) {
          options.push({
            label: kw,
            type: "keyword",
          });
        }
      }

      // DuckDB functions
      for (const fn of DUCKDB_FUNCTIONS) {
        if (fn.startsWith(textUpper)) {
          options.push({
            label: fn,
            type: "function",
            apply: fn + "()",
          });
        }
      }

      if (options.length === 0) return null;

      return { from, options };
    };
  }
}
