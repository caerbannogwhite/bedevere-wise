import { DuckDBService } from "../DuckDBService";
import { SupportedFileType } from "../FileTreeTypes";
import { FormatHandler, ImportFileOptions } from "./FormatHandler";

export class JsonFormatHandler implements FormatHandler {
  canHandle(fileType: SupportedFileType): boolean {
    return fileType === "json";
  }

  async import(file: File, tableName: string, duckDBService: DuckDBService, _options?: ImportFileOptions): Promise<void> {
    const text = await file.text();
    await duckDBService.registerFileText(file.name, text);
    const connection = await duckDBService.getConnection();
    try {
      await connection.insertJSONFromPath(file.name, {
        schema: "main",
        name: tableName,
      });
    } finally {
      await connection.close();
    }
  }
}
