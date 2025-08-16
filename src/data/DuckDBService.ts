import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import { DuckDBDataProvider } from "./DuckDBDataProvider";

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
      const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
        mvp: {
          mainModule: duckdb_wasm,
          mainWorker: mvp_worker,
        },
        eh: {
          mainModule: duckdb_wasm_eh,
          mainWorker: eh_worker,
        },
      };

      // Select a bundle based on browser checks
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

      // Instantiate the asynchronous version of DuckDB-wasm
      this.worker = new Worker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, this.worker);

      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      this.isInitialized = true;

      console.log("DuckDB initialized successfully");
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
      const result = await connection.query(query);
      return result.toArray();
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
    return await this.executeQuery(`DESCRIBE ${tableName}`);
  }

  public async getTableData(tableName: string, limit: number = 100): Promise<any[]> {
    return await this.executeQuery(`SELECT * FROM ${tableName} LIMIT ${limit}`);
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
