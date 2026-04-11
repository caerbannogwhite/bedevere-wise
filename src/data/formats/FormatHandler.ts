import { DuckDBService } from "../DuckDBService";
import { SupportedFileType } from "../FileTreeTypes";

export interface ImportFileOptions {
  hasHeader?: boolean;
  delimiter?: string;
  sheetName?: string;
}

export interface FormatHandler {
  /** Which file types this handler supports */
  canHandle(fileType: SupportedFileType): boolean;

  /** Import a file into DuckDB as a table */
  import(
    file: File,
    tableName: string,
    duckDBService: DuckDBService,
    options?: ImportFileOptions
  ): Promise<void>;

  /** For multi-sheet formats (Excel): return sheet names */
  getSheetNames?(file: File, duckDBService: DuckDBService): Promise<string[]>;
}
