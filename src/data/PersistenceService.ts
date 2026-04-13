export interface ViewDefinition {
  name: string;
  sql: string;
  createdAt: number;
}

export interface QueryBookmark {
  name: string;
  sql: string;
  createdAt: number;
}

export interface AppSettings {
  theme?: "light" | "dark" | "auto";
  panelMinimized?: boolean;
  panelWidth?: number;
  hasSeenOnboarding?: boolean;
}

const STORAGE_KEYS = {
  views: "bedevere_views",
  queries: "bedevere_queries",
  settings: "bedevere_settings",
} as const;

const DB_NAME = "bedevere_db";
const DB_VERSION = 1;
const TABLE_STORE = "table_snapshots";

export class PersistenceService {
  // --- View Definitions (localStorage) ---

  public saveViewDefinition(name: string, sqlStr: string): void {
    const views = this.loadViewDefinitions();
    const existing = views.findIndex((v) => v.name === name);
    const def: ViewDefinition = { name, sql: sqlStr, createdAt: Date.now() };

    if (existing >= 0) {
      views[existing] = def;
    } else {
      views.push(def);
    }

    localStorage.setItem(STORAGE_KEYS.views, JSON.stringify(views));
  }

  public loadViewDefinitions(): ViewDefinition[] {
    const raw = localStorage.getItem(STORAGE_KEYS.views);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public deleteViewDefinition(name: string): void {
    const views = this.loadViewDefinitions().filter((v) => v.name !== name);
    localStorage.setItem(STORAGE_KEYS.views, JSON.stringify(views));
  }

  // --- Query Bookmarks (localStorage) ---

  public saveQueryBookmark(name: string, sqlStr: string): void {
    const queries = this.loadQueryBookmarks();
    const existing = queries.findIndex((q) => q.name === name);
    const bookmark: QueryBookmark = { name, sql: sqlStr, createdAt: Date.now() };

    if (existing >= 0) {
      queries[existing] = bookmark;
    } else {
      queries.push(bookmark);
    }

    localStorage.setItem(STORAGE_KEYS.queries, JSON.stringify(queries));
  }

  public loadQueryBookmarks(): QueryBookmark[] {
    const raw = localStorage.getItem(STORAGE_KEYS.queries);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public deleteQueryBookmark(name: string): void {
    const queries = this.loadQueryBookmarks().filter((q) => q.name !== name);
    localStorage.setItem(STORAGE_KEYS.queries, JSON.stringify(queries));
  }

  // --- App Settings (localStorage) ---

  public saveAppSettings(settings: AppSettings): void {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }

  public loadAppSettings(): AppSettings {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  // --- Table Snapshots (IndexedDB) ---

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TABLE_STORE)) {
          db.createObjectStore(TABLE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  public async saveTableSnapshot(name: string, buffer: ArrayBuffer): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TABLE_STORE, "readwrite");
      tx.objectStore(TABLE_STORE).put(buffer, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async loadTableSnapshot(name: string): Promise<ArrayBuffer | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TABLE_STORE, "readonly");
      const request = tx.objectStore(TABLE_STORE).get(name);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  public async deleteTableSnapshot(name: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TABLE_STORE, "readwrite");
      tx.objectStore(TABLE_STORE).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async listTableSnapshots(): Promise<string[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TABLE_STORE, "readonly");
      const request = tx.objectStore(TABLE_STORE).getAllKeys();
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }
}

export const persistenceService = new PersistenceService();
