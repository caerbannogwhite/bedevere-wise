import { DuckDBService } from "../DuckDBService";
import { DuckDBExtensionLoader } from "../DuckDBExtensionLoader";
import { SupportedFileType } from "../FileTreeTypes";
import { FormatHandler, ImportFileOptions } from "./FormatHandler";

export class StatFormatHandler implements FormatHandler {
  private extensionLoader: DuckDBExtensionLoader;

  constructor(extensionLoader: DuckDBExtensionLoader) {
    this.extensionLoader = extensionLoader;
  }

  canHandle(fileType: SupportedFileType): boolean {
    const statTypes: SupportedFileType[] = ["sas7bdat", "xpt", "sav", "dta"];
    return statTypes.includes(fileType) && this.extensionLoader.isLoaded("stats_duck");
  }

  async import(file: File, tableName: string, duckDBService: DuckDBService, _options?: ImportFileOptions): Promise<void> {
    const buffer = new Uint8Array(await file.arrayBuffer());
    await duckDBService.registerFileBuffer(file.name, buffer);

    await duckDBService.executeQuery(
      `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_stat('${file.name}')`
    );
  }
}
