import { DuckDBService } from "./DuckDBService";

const STORAGE_KEY = "brian_aliases";

export class AliasManager {
  private aliases: Map<string, string> = new Map(); // tableName → alias
  private duckDBService: DuckDBService;

  constructor(duckDBService: DuckDBService) {
    this.duckDBService = duckDBService;
    this.load();
  }

  public async setAlias(tableName: string, alias: string): Promise<void> {
    const sanitized = alias.replace(/[^a-zA-Z0-9_]/g, "_");
    if (!sanitized) throw new Error("Invalid alias");

    // Check for duplicates
    for (const [existingTable, existingAlias] of this.aliases) {
      if (existingAlias === sanitized && existingTable !== tableName) {
        throw new Error(`Alias "${sanitized}" is already used by table "${existingTable}"`);
      }
    }

    // Rename in DuckDB
    await this.duckDBService.executeQuery(`ALTER TABLE "${tableName}" RENAME TO "${sanitized}"`);

    // Update local state
    this.aliases.set(sanitized, sanitized);
    // Remove old mapping if it existed
    if (tableName !== sanitized) {
      this.aliases.delete(tableName);
    }

    this.save();
  }

  public getAlias(tableName: string): string | null {
    return this.aliases.get(tableName) ?? null;
  }

  public getTableNameByAlias(alias: string): string | null {
    for (const [table, a] of this.aliases) {
      if (a === alias) return table;
    }
    return null;
  }

  public removeAlias(tableName: string): void {
    this.aliases.delete(tableName);
    this.save();
  }

  public getAllAliases(): Map<string, string> {
    return new Map(this.aliases);
  }

  private load(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const obj = JSON.parse(raw) as Record<string, string>;
      this.aliases = new Map(Object.entries(obj));
    } catch {
      // Ignore corrupt storage
    }
  }

  private save(): void {
    const obj = Object.fromEntries(this.aliases);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }
}
