import * as duckdb from "@duckdb/duckdb-wasm";
import { DuckDBDataProvider } from "./DuckDBDataProvider";
import { quoteIdent } from "./sqlIdent";

export interface ImportOptions {
  fileType: "csv" | "json" | "parquet";
  hasHeader?: boolean;
  delimiter?: string;
  schema?: string;
}

export class DuckDBService {
  private db: duckdb.AsyncDuckDB | null = null;
  private worker: Worker | null = null;
  private isInitialized = false;

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // jsDelivr bundles instead of `?url` imports — the DuckDB-WASM
      // artefacts are 35–41 MB each, which exceeds Cloudflare Workers'
      // 25 MiB per-asset cap, so we can't ship them in our own bundle.
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());

      // Workers can't be loaded cross-origin directly; wrap the jsDelivr
      // URL in a same-origin Blob shim that importScripts() the real code.
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker!}");`], { type: "text/javascript" })
      );

      this.worker = new Worker(workerUrl);
      const logger = new duckdb.VoidLogger();
      this.db = new duckdb.AsyncDuckDB(logger, this.worker);

      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl);
      await this.db.open({ allowUnsignedExtensions: true });
      this.isInitialized = true;

      if (import.meta.env.DEV) {
        console.log("DuckDB initialized successfully");
      }
    } catch (error) {
      console.error("Failed to initialize DuckDB:", error);
      throw error;
    }
  }

  public async getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
    if (!this.db || !this.isInitialized) {
      throw new Error("DuckDB not initialized. Call initialize() first.");
    }
    return await this.db.connect();
  }

  async executeQuery(query: string): Promise<any[]> {
    const connection = await this.getConnection();
    try {
      return (await connection.query(query)).toArray();
    } finally {
      await connection.close();
    }
  }

  /**
   * Run a query and return rows alongside per-column DECIMAL scales lifted
   * from the Arrow schema. DuckDB infers `DECIMAL(p,s)` for plain literals
   * like `1.0` and Arrow exports those as the raw integer (10 for `1.0`,
   * 100 for `2.5`, …); callers that hand the rows to a downstream consumer
   * (Vega-Lite, etc.) need the scale to recover the original value. For
   * non-decimal columns no entry is emitted in `decimalScales`.
   */
  async executeQueryWithSchema(query: string): Promise<{
    rows: any[];
    decimalScales: Record<string, number>;
  }> {
    const connection = await this.getConnection();
    try {
      const table: any = await connection.query(query);
      const decimalScales: Record<string, number> = {};
      const fields: any[] = table?.schema?.fields ?? [];
      for (const field of fields) {
        const scale = (field?.type as { scale?: unknown } | undefined)?.scale;
        if (typeof scale === "number" && scale > 0) {
          decimalScales[String(field.name)] = scale;
        }
      }
      return { rows: table.toArray(), decimalScales };
    } finally {
      await connection.close();
    }
  }

  public async importFile(file: File, tableName: string, importOptions: ImportOptions): Promise<DuckDBDataProvider> {
    const text = await file.text();

    switch (importOptions.fileType) {
      case "csv":
        await this.loadCSVFromText(text, file.name, tableName, importOptions.hasHeader, importOptions.delimiter);
        break;
      // case "json":
      //   await this.loadJSONFromText(text, file.name, tableName, importOptions.schema);
      //   break;

      default:
        throw new Error(`Unsupported file type: ${importOptions.fileType}`);
    }

    return new DuckDBDataProvider(this, tableName, file.name);
  }

  public getSupportedFileTypes(): string[] {
    return ["text/csv", "text/tab-separated-values", "text/plain", "application/csv", ".csv", ".tsv", ".txt"];
  }

  public isSupportedFileType(file: File): boolean {
    const supportedTypes = this.getSupportedFileTypes();
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();

    return supportedTypes.some((type) => fileType.includes(type.replace(".", "")) || fileName.endsWith(type));
  }

  private async loadCSVFromText(
    csvContent: string,
    fileName: string,
    tableName: string,
    hasHeader: boolean = true,
    delimiter: string = ","
  ): Promise<void> {
    const connection = await this.getConnection();
    try {
      await this.db!.registerFileText(`${fileName}`, csvContent);
      await connection.insertCSVFromPath(`${fileName}`, {
        schema: "main",
        name: tableName,
        detect: true,
        header: hasHeader,
        delimiter: delimiter,
      });
    } finally {
      await connection.close();
    }
  }

  public async listTables(): Promise<string[]> {
    return (await this.executeQuery("SHOW TABLES")).map((row: any) => row.name);
  }

  public async getTableInfo(tableName: string): Promise<any[]> {
    return await this.executeQuery(`DESCRIBE ${quoteIdent(tableName)}`);
  }

  public async getColumnInfo(tableName: string, columnName: string): Promise<any> {
    const columns = await this.executeQuery(`DESCRIBE ${quoteIdent(tableName)}`);
    return columns.find((column: any) => column.column_name === columnName);
  }

  public async executeQueryAsDataProvider(query: string, resultName?: string): Promise<DuckDBDataProvider> {
    const tempName = resultName || `query_result_${Date.now()}`;
    // Strip a single trailing semicolon — wrapping it inside `( … ;)` is a
    // syntax error.
    const inner = query.replace(/;\s*$/, "");
    const connection = await this.getConnection();
    try {
      await connection.query(`CREATE OR REPLACE TABLE "${tempName}" AS (${inner})`);
    } finally {
      await connection.close();
    }
    return new DuckDBDataProvider(this, tempName, "");
  }

  public async registerFileText(name: string, text: string): Promise<void> {
    if (!this.db) throw new Error("DuckDB not initialized");
    await this.db.registerFileText(name, text);
  }

  public async registerFileBuffer(name: string, buffer: Uint8Array): Promise<void> {
    if (!this.db) throw new Error("DuckDB not initialized");
    await this.db.registerFileBuffer(name, buffer);
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  public async cleanup(): Promise<void> {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.db = null;
    this.isInitialized = false;
  }
}

// Export a singleton instance
export const duckDBService = new DuckDBService();
