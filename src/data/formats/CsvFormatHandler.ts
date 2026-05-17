import { DuckDBService } from "../DuckDBService";
import { SupportedFileType } from "../FileTreeTypes";
import { quoteIdent } from "../sqlIdent";
import { FormatHandler, ImportFileOptions } from "./FormatHandler";

/**
 * Quote a string literal for safe interpolation into a SQL statement.
 * Single quotes are doubled per the SQL standard; we control the inputs
 * (registered filename + caller-chosen delimiter) but defensive quoting
 * keeps the code resilient to filenames with apostrophes etc.
 */
function quoteLit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export class CsvFormatHandler implements FormatHandler {
  canHandle(fileType: SupportedFileType): boolean {
    return fileType === "csv" || fileType === "tsv";
  }

  async import(file: File, tableName: string, duckDBService: DuckDBService, options?: ImportFileOptions): Promise<void> {
    const text = await file.text();
    const delimiter = options?.delimiter ?? (file.name.endsWith(".tsv") ? "\t" : ",");
    const hasHeader = options?.hasHeader ?? true;

    await duckDBService.registerFileText(file.name, text);

    // We bypass `connection.insertCSVFromPath` here. Its options surface
    // only exposes header / delimiter / quote / dateFormat — not
    // `sample_size`, `all_varchar`, or `ignore_errors`. Those are exactly
    // the levers needed when DuckDB's default 20480-row type-detection
    // sample picks too-narrow a type for a column whose oddball values
    // appear later in the file (e.g. CDBRFS90.csv's WINDDOWN column,
    // inferred as BIGINT from the first 20k rows, then blowing up on a
    // stray "]" at row 41587).
    //
    // Strategy: first attempt with `sample_size=-1` so DuckDB scans the
    // whole file before settling on column types. That alone fixes the
    // common case — the WINDDOWN column above gets widened to VARCHAR.
    // If the import still throws (e.g. malformed rows that no column
    // type can absorb), retry once with `ignore_errors=true` so the
    // user gets *something* in the workspace rather than nothing, and
    // surface a console warning so the lost rows aren't silent.

    const baseOptions: Record<string, string> = {
      header: hasHeader ? "true" : "false",
      delim: quoteLit(delimiter),
      // -1 = scan the entire file before inferring types. Slower than
      // the default 20480-row sample on huge files but the correctness
      // win is worth it; we already loaded the full text into memory
      // above, so the file is hot in WASM memory anyway.
      sample_size: "-1",
    };

    const buildSql = (opts: Record<string, string>): string => {
      const optsSql = Object.entries(opts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return (
        `CREATE TABLE ${quoteIdent(tableName)} AS ` +
        `SELECT * FROM read_csv_auto(${quoteLit(file.name)}, ${optsSql})`
      );
    };

    try {
      await duckDBService.executeQuery(buildSql(baseOptions));
    } catch (firstError) {
      // Some files have rows that no column type can absorb (e.g. a row
      // with the wrong number of fields, or binary garbage from a bad
      // export). `ignore_errors=true` skips those rows rather than
      // aborting the import — better than failing the whole file. We
      // log so the user can see this happened.
      console.warn(
        `CSV import for ${file.name} failed with strict mode; retrying with ignore_errors=true. ` +
          `Some rows may be skipped.`,
        firstError,
      );
      await duckDBService.executeQuery(
        buildSql({ ...baseOptions, ignore_errors: "true" }),
      );
    }
  }
}
