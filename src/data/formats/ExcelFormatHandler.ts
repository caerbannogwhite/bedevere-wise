import { DuckDBService } from "../DuckDBService";
import { DuckDBExtensionLoader } from "../DuckDBExtensionLoader";
import { SupportedFileType } from "../FileTreeTypes";
import { FormatHandler, ImportFileOptions } from "./FormatHandler";

export class ExcelFormatHandler implements FormatHandler {
  private extensionLoader: DuckDBExtensionLoader;

  constructor(extensionLoader: DuckDBExtensionLoader) {
    this.extensionLoader = extensionLoader;
  }

  canHandle(fileType: SupportedFileType): boolean {
    return (fileType === "xlsx" || fileType === "xls") && this.extensionLoader.isLoaded("excel");
  }

  async import(file: File, tableName: string, duckDBService: DuckDBService, options?: ImportFileOptions): Promise<void> {
    const buffer = new Uint8Array(await file.arrayBuffer());
    await duckDBService.registerFileBuffer(file.name, buffer);

    const sheet = options?.sheetName ? `, sheet = '${options.sheetName}'` : "";

    // Try read_xlsx first (DuckDB >= 1.2), fall back to st_read / read_excel
    const queries = [
      `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_xlsx('${file.name}'${sheet})`,
      `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM st_read('${file.name}'${sheet})`,
    ];

    for (const query of queries) {
      try {
        await duckDBService.executeQuery(query);
        return;
      } catch {
        // Try next approach
      }
    }

    throw new Error("Failed to read Excel file — no compatible read function available");
  }

  async getSheetNames(file: File, duckDBService: DuckDBService): Promise<string[]> {
    const buffer = new Uint8Array(await file.arrayBuffer());
    await duckDBService.registerFileBuffer(file.name, buffer);

    // Try multiple approaches to get sheet names
    const queries = [
      `SELECT name FROM read_xlsx_names('${file.name}')`,
      `SELECT DISTINCT sheet_name as name FROM read_xlsx('${file.name}', all_varchar=true, sheet='*') LIMIT 0`,
    ];

    for (const query of queries) {
      try {
        const result = await duckDBService.executeQuery(query);
        const names = result.map((row: any) => row.name).filter(Boolean);
        if (names.length > 0) return names;
      } catch {
        // Try next approach
      }
    }

    return ["Sheet1"];
  }
}
