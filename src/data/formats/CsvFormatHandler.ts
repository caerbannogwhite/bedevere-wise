import { DuckDBService } from "../DuckDBService";
import { SupportedFileType } from "../FileTreeTypes";
import { FormatHandler, ImportFileOptions } from "./FormatHandler";

export class CsvFormatHandler implements FormatHandler {
  canHandle(fileType: SupportedFileType): boolean {
    return fileType === "csv" || fileType === "tsv";
  }

  async import(file: File, tableName: string, duckDBService: DuckDBService, options?: ImportFileOptions): Promise<void> {
    const text = await file.text();
    const delimiter = options?.delimiter ?? (file.name.endsWith(".tsv") ? "\t" : ",");
    const hasHeader = options?.hasHeader ?? true;

    await duckDBService.registerFileText(file.name, text);
    const connection = await duckDBService.getConnection();
    try {
      await connection.insertCSVFromPath(file.name, {
        schema: "main",
        name: tableName,
        detect: true,
        header: hasHeader,
        delimiter,
      });
    } finally {
      await connection.close();
    }
  }
}
