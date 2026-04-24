import { DuckDBService } from "./DuckDBService";

export class DuckDBExtensionLoader {
  private loaded: Set<string> = new Set();
  private duckDBService: DuckDBService;
  private customRepository?: string;

  constructor(duckDBService: DuckDBService, customRepository?: string) {
    this.duckDBService = duckDBService;
    this.customRepository = customRepository;
  }

  /**
   * Try to install and load a DuckDB extension.
   * Returns true if the extension loaded successfully, false otherwise.
   * Failures are silent — the extension is simply marked as unavailable.
   */
  /**
   * Try to install and load a DuckDB extension.
   * @param probeQueries Optional SQL queries to verify functions work (catches WASM runtime errors)
   */
  public async tryLoad(name: string, source?: string, probeQueries?: string[]): Promise<boolean> {
    try {
      // If a custom repository is configured, set it before installing
      if (this.customRepository && !source) {
        await this.duckDBService.executeQuery(
          `SET custom_extension_repository = '${this.customRepository}'`
        );
      }

      const installCmd = source
        ? `INSTALL ${name} FROM '${source}'`
        : `INSTALL ${name}`;
      await this.duckDBService.executeQuery(installCmd);
      await this.duckDBService.executeQuery(`LOAD ${name}`);
      this.loaded.add(name);

      // Probe available functions from this extension (dev only — noisy in prod)
      if (import.meta.env.DEV) {
        try {
          const funcs = await this.duckDBService.executeQuery(
            `SELECT function_name FROM duckdb_functions() WHERE function_name LIKE '%xlsx%' OR function_name LIKE '%excel%' OR function_name LIKE '%sas%' OR function_name LIKE '%stata%' OR function_name LIKE '%sav%'`
          );
          const funcNames = funcs.map((r: any) => r.function_name);
          if (funcNames.length > 0) {
            console.log(`DuckDB extension "${name}" loaded — functions: ${[...new Set(funcNames)].join(", ")}`);
          } else {
            console.log(`DuckDB extension "${name}" loaded successfully`);
          }
        } catch {
          console.log(`DuckDB extension "${name}" loaded successfully`);
        }
      }

      // Run smoke tests for known-problematic functions.
      // SQL-level errors (file not found, etc.) are expected and fine.
      // WASM runtime errors (signature mismatch, memory OOB) mean the
      // function is compiled incorrectly and the extension is unusable.
      if (probeQueries) {
        for (const probe of probeQueries) {
          try {
            await this.duckDBService.executeQuery(probe);
          } catch (probeError) {
            const msg = probeError instanceof Error ? probeError.message : String(probeError);
            const isWasmCrash =
              msg.includes("signature mismatch") ||
              msg.includes("memory access out of bounds") ||
              msg.includes("RuntimeError") ||
              msg.includes("unreachable");
            if (isWasmCrash) {
              console.warn(`DuckDB extension "${name}" loaded but functions crash in WASM — disabling`);
              this.loaded.delete(name);
              return false;
            }
            // SQL-level error (e.g. "file not found") is expected — probe passes
          }
        }
      }

      return true;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.log(`DuckDB extension "${name}" not available in WASM environment`);
      }
      return false;
    }
  }

  public isLoaded(name: string): boolean {
    return this.loaded.has(name);
  }

  public getLoadedExtensions(): string[] {
    return Array.from(this.loaded);
  }
}
