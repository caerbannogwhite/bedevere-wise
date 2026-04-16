import { DuckDBService } from "./DuckDBService";
import { DuckDBDataProvider } from "./DuckDBDataProvider";
import { detectFileType, getAllSupportedExtensions, SupportedFileType } from "./FileTreeTypes";
import { FormatHandler, ImportFileOptions } from "./formats/FormatHandler";
import { CsvFormatHandler } from "./formats/CsvFormatHandler";
import { JsonFormatHandler } from "./formats/JsonFormatHandler";
import { ParquetFormatHandler } from "./formats/ParquetFormatHandler";

export class FileImportService {
  private handlers: FormatHandler[] = [];
  private duckDBService: DuckDBService;

  constructor(duckDBService: DuckDBService) {
    this.duckDBService = duckDBService;

    // Register built-in handlers
    this.register(new CsvFormatHandler());
    this.register(new JsonFormatHandler());
    this.register(new ParquetFormatHandler());
  }

  public register(handler: FormatHandler): void {
    this.handlers.push(handler);
  }

  public canImport(fileName: string): boolean {
    const fileType = detectFileType(fileName);
    return fileType !== null && this.handlers.some((h) => h.canHandle(fileType));
  }

  public getHandler(fileType: SupportedFileType): FormatHandler | null {
    return this.handlers.find((h) => h.canHandle(fileType)) ?? null;
  }

  public async importFile(file: File, tableName?: string, options?: ImportFileOptions): Promise<DuckDBDataProvider> {
    const fileType = detectFileType(file.name);
    if (!fileType) {
      throw new Error(`Unsupported file type: ${file.name}`);
    }

    const handler = this.getHandler(fileType);
    if (!handler) {
      throw new Error(`No handler registered for file type: ${fileType}`);
    }

    const name = tableName ?? file.name.replace(/\.[^/.]+$/, "");

    await handler.import(file, name, this.duckDBService, options);
    return new DuckDBDataProvider(this.duckDBService, name, file.name);
  }

  public async getSheetNames(file: File): Promise<string[]> {
    const fileType = detectFileType(file.name);
    if (!fileType) return [];

    const handler = this.getHandler(fileType);
    if (!handler?.getSheetNames) return [];

    return handler.getSheetNames(file, this.duckDBService);
  }

  public getSupportedExtensions(): string[] {
    // Surface every extension the app knows about, even if the backing
    // extension (e.g. Excel, stats_duck) hasn't finished loading yet. The
    // file picker needs a stable list at open time; if a chosen format
    // isn't actually usable, the import step surfaces a clear error rather
    // than silently greying out files in the OS dialog.
    return getAllSupportedExtensions();
  }
}
