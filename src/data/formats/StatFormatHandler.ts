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
    return statTypes.includes(fileType) && (this.extensionLoader.isLoaded("stats_duck") || this.extensionLoader.isLoaded("read_stat"));
  }

  async import(file: File, tableName: string, duckDBService: DuckDBService, _options?: ImportFileOptions): Promise<void> {
    const buffer = new Uint8Array(await file.arrayBuffer());
    await duckDBService.registerFileBuffer(file.name, buffer);

    const readFunc = this.getReadFunction(file.name);
    await duckDBService.executeQuery(
      `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM ${readFunc}('${file.name}')`
    );
  }

  private getReadFunction(fileName: string): string {
    // stats_duck extension uses a single read_stat() for all formats
    if (this.extensionLoader.isLoaded("stats_duck")) {
      return "read_stat";
    }

    // read_stat community extension uses separate functions per format
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "sas7bdat":
      case "xpt":
        return "read_sas";
      case "sav":
        return "read_sav";
      case "dta":
        return "read_stata";
      default:
        return "read_sas";
    }
  }
}
