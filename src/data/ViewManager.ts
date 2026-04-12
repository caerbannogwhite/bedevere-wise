import { DuckDBService } from "./DuckDBService";
import { DuckDBDataProvider } from "./DuckDBDataProvider";
import { PersistenceService, ViewDefinition } from "./PersistenceService";

export class ViewManager {
  private duckDBService: DuckDBService;
  private persistenceService: PersistenceService;
  private views: ViewDefinition[] = [];
  private onChangeCallbacks: Array<() => void> = [];

  constructor(duckDBService: DuckDBService, persistenceService: PersistenceService) {
    this.duckDBService = duckDBService;
    this.persistenceService = persistenceService;
  }

  public async initialize(): Promise<void> {
    this.views = this.persistenceService.loadViewDefinitions();

    // Re-create all views in DuckDB
    for (const view of this.views) {
      try {
        await this.duckDBService.executeQuery(
          `CREATE OR REPLACE VIEW "${view.name}" AS (${view.sql})`
        );
      } catch (error) {
        console.error(`Failed to restore view "${view.name}":`, error);
      }
    }
  }

  public async createView(name: string, sqlStr: string): Promise<void> {
    // Create the view in DuckDB
    await this.duckDBService.executeQuery(
      `CREATE OR REPLACE VIEW "${name}" AS (${sqlStr})`
    );

    // Persist the definition
    this.persistenceService.saveViewDefinition(name, sqlStr);
    this.views = this.persistenceService.loadViewDefinitions();
    this.notifyChange();
  }

  public async dropView(name: string): Promise<void> {
    try {
      await this.duckDBService.executeQuery(`DROP VIEW IF EXISTS "${name}"`);
    } catch (error) {
      console.error(`Failed to drop view "${name}":`, error);
    }

    this.persistenceService.deleteViewDefinition(name);
    this.views = this.persistenceService.loadViewDefinitions();
    this.notifyChange();
  }

  public listViews(): ViewDefinition[] {
    return [...this.views];
  }

  public getViewSql(name: string): string | null {
    const view = this.views.find((v) => v.name === name);
    return view ? view.sql : null;
  }

  public getViewAsDataProvider(name: string): DuckDBDataProvider {
    return new DuckDBDataProvider(this.duckDBService, name, "");
  }

  public onChange(callback: () => void): void {
    this.onChangeCallbacks.push(callback);
  }

  public removeOnChange(callback: () => void): void {
    this.onChangeCallbacks = this.onChangeCallbacks.filter((cb) => cb !== callback);
  }

  private notifyChange(): void {
    for (const cb of this.onChangeCallbacks) {
      cb();
    }
  }
}
