import { DataProvider } from "@/data/types";
import { SpreadsheetOptions } from "./types";
import { DEFAULT_CACHE_CHUNK_SIZE, DEFAULT_INITIAL_CACHE_SIZE, DEFAULT_MAX_CACHE_SIZE } from "./defaults";

export type CacheRange = { start: number; end: number };

/**
 * A single cached chunk of rows. `lastAccessed` drives the LRU eviction
 * sweep that fires synchronously after each insert (no timer).
 */
interface CacheEntry {
  range: CacheRange;
  rows: any[][];
  lastAccessed: number;
}

export type LoadedListener = (range: CacheRange) => void;

/**
 * Result returned by the synchronous read path. `rows` has exactly
 * `endRow - startRow` entries; missing rows are `null`. `hasMissing`
 * is set when at least one row was missing — the caller should call
 * `requestRange` to trigger a background load and re-paint when
 * `onLoaded` fires.
 */
export interface CacheReadSync {
  rows: (any[] | null)[];
  hasMissing: boolean;
}

export class SpreadsheetCache {
  /**
   * Cached chunks, kept sorted by `range.start`. Sorted-list lookup is
   * O(n) but n is small (≤ maxCacheSize / cacheChunkSize entries) and the
   * read path uses linear walk anyway.
   */
  private entries: CacheEntry[] = [];

  /**
   * Ranges currently being fetched. Prevents duplicate requests when
   * multiple frames in a row ask for the same missing data while the
   * first request is still in flight.
   */
  private inFlight: Map<string, Promise<void>> = new Map();

  private datasetTotalRows: number = 0;
  private initialCacheSize: number;
  private cacheChunkSize: number;
  private maxCacheSize: number;
  private dataProvider: DataProvider;

  private listeners: LoadedListener[] = [];

  // Monotonic counter — used as `lastAccessed` instead of Date.now() to
  // avoid clock-skew weirdness and to give every access a unique sort key.
  private accessTick = 0;

  constructor(dataProvider: DataProvider, options: SpreadsheetOptions) {
    this.dataProvider = dataProvider;
    this.initialCacheSize = options.initialCacheSize ?? DEFAULT_INITIAL_CACHE_SIZE;
    this.cacheChunkSize = options.cacheChunkSize ?? DEFAULT_CACHE_CHUNK_SIZE;
    this.maxCacheSize = options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
    // The cap must comfortably hold the working set or LRU will thrash.
    this.maxCacheSize = Math.max(this.maxCacheSize, this.initialCacheSize + this.cacheChunkSize);
  }

  public async initialize(totalRows: number): Promise<void> {
    this.datasetTotalRows = totalRows;
    if (totalRows === 0) return;
    const initialSize = Math.min(this.initialCacheSize, this.datasetTotalRows);
    await this.loadChunk(0, initialSize);
  }

  // ---- Read APIs ----------------------------------------------------------

  /**
   * Synchronous read. Returns immediately with whatever is already cached;
   * missing rows are `null`. Use in the render loop so a cache miss
   * doesn't block the frame — render placeholders for the null rows and
   * call {@link requestRange} to trigger a background load.
   */
  public getDataSync(startRow: number, endRow: number): CacheReadSync {
    const result: CacheReadSync = { rows: [], hasMissing: false };
    if (startRow >= this.datasetTotalRows || endRow <= startRow) return result;
    endRow = Math.min(endRow, this.datasetTotalRows);

    const tick = ++this.accessTick;
    const len = endRow - startRow;
    result.rows = new Array(len);
    for (let i = 0; i < len; i++) result.rows[i] = null;

    for (const entry of this.entries) {
      const r = entry.range;
      if (r.end <= startRow) continue;
      if (r.start >= endRow) break;
      const overlapStart = Math.max(r.start, startRow);
      const overlapEnd = Math.min(r.end, endRow);
      for (let row = overlapStart; row < overlapEnd; row++) {
        result.rows[row - startRow] = entry.rows[row - r.start];
      }
      entry.lastAccessed = tick;
    }

    for (let i = 0; i < len; i++) {
      if (result.rows[i] === null) {
        result.hasMissing = true;
        break;
      }
    }
    return result;
  }

  /**
   * Async read. Awaits any missing chunks before resolving. Use for
   * cold-path callers that genuinely need the resolved data (selection
   * export, column-width measurement).
   */
  public async getData(startRow: number, endRow: number): Promise<any[][]> {
    if (startRow >= this.datasetTotalRows || endRow <= startRow) return [];
    endRow = Math.min(endRow, this.datasetTotalRows);
    await this.loadChunk(startRow, endRow);

    const sync = this.getDataSync(startRow, endRow);
    // After loadChunk resolves, sync should never have nulls in the
    // requested range; defensively filter just in case.
    return sync.rows.filter((r): r is any[] => r !== null);
  }

  public async getValue(row: number, column: number): Promise<any> {
    const data = await this.getData(row, row + 1);
    return data[0]?.[column];
  }

  /**
   * Schedule a background load for the given range. Returns immediately;
   * `onLoaded` fires when the data lands. Multiple concurrent requests
   * for the same missing range coalesce.
   */
  public requestRange(startRow: number, endRow: number): void {
    if (startRow >= this.datasetTotalRows || endRow <= startRow) return;
    endRow = Math.min(endRow, this.datasetTotalRows);

    const missing = this.getMissingRanges(startRow, endRow);
    for (const range of missing) {
      const key = `${range.start}-${range.end}`;
      if (this.inFlight.has(key)) continue;
      const p = this.dataProvider
        .fetchData(range.start, range.end)
        .then((rows) => {
          this.insertEntry({ range, rows, lastAccessed: ++this.accessTick });
          this.evictIfOverCap();
          this.inFlight.delete(key);
          for (const cb of this.listeners) cb(range);
        })
        .catch((err) => {
          this.inFlight.delete(key);
          console.error(`Cache fetch failed for rows ${range.start}-${range.end}:`, err);
        });
      this.inFlight.set(key, p);
    }
  }

  /** Subscribe to "chunk landed in cache" events. Returns an unsubscribe. */
  public onLoaded(callback: LoadedListener): () => void {
    this.listeners.push(callback);
    return () => {
      const i = this.listeners.indexOf(callback);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  // ---- Internal load + eviction ------------------------------------------

  /**
   * Awaitable load for cold-path callers. Re-uses the in-flight map so
   * the sync `requestRange` and async `loadChunk` can race without
   * duplicating fetches.
   */
  public async loadChunk(startRow: number, endRow: number): Promise<void> {
    const missing = this.getMissingRanges(startRow, endRow);
    if (missing.length === 0) return;
    await Promise.all(
      missing.map((range) => {
        const key = `${range.start}-${range.end}`;
        const existing = this.inFlight.get(key);
        if (existing) return existing;
        const p = this.dataProvider
          .fetchData(range.start, range.end)
          .then((rows) => {
            this.insertEntry({ range, rows, lastAccessed: ++this.accessTick });
            this.evictIfOverCap();
            this.inFlight.delete(key);
            for (const cb of this.listeners) cb(range);
          })
          .catch((err) => {
            this.inFlight.delete(key);
            throw err;
          });
        this.inFlight.set(key, p);
        return p;
      }),
    );
  }

  /**
   * After every insert, drop entries by ascending `lastAccessed` until
   * the cached row count fits under `maxCacheSize`. Cheap because
   * `entries` is small (typically < 50).
   */
  private evictIfOverCap(): void {
    let cached = this.getCachedRows();
    if (cached <= this.maxCacheSize) return;

    // Sort a shallow copy by recency; keep the most recent.
    const ordered = this.entries.slice().sort((a, b) => a.lastAccessed - b.lastAccessed);
    for (const victim of ordered) {
      if (cached <= this.maxCacheSize) break;
      const i = this.entries.indexOf(victim);
      if (i >= 0) this.entries.splice(i, 1);
      cached -= victim.range.end - victim.range.start;
    }
  }

  // ---- Stats / lifecycle -------------------------------------------------

  public getCacheStats(): {
    cacheSize: number;
    ranges: CacheRange[];
    totalRows: number;
    initialCacheSize: number;
    cacheChunkSize: number;
    maxCacheSize: number;
    cachedRows: number;
    isLoading: boolean;
  } {
    return {
      cacheSize: this.entries.length,
      ranges: this.entries.map((e) => e.range),
      totalRows: this.datasetTotalRows,
      initialCacheSize: this.initialCacheSize,
      cacheChunkSize: this.cacheChunkSize,
      maxCacheSize: this.maxCacheSize,
      cachedRows: this.getCachedRows(),
      isLoading: this.inFlight.size > 0,
    };
  }

  public clear(): void {
    this.entries = [];
    this.inFlight.clear();
    this.listeners = [];
  }

  public getCachedRows(): number {
    let n = 0;
    for (const e of this.entries) n += e.range.end - e.range.start;
    return n;
  }

  public getMissingRanges(startRow: number, endRow: number): CacheRange[] {
    // Intervals are half-open: [start, end)

    // If the interval is smaller than the cache chunk size, grow it.
    const chunkSize = this.cacheChunkSize;
    if (endRow - startRow < chunkSize) {
      endRow = Math.min(this.datasetTotalRows, startRow + chunkSize);
    }

    if (this.entries.length === 0) {
      return [{ start: startRow, end: endRow }];
    }

    const ranges: CacheRange[] = [];

    for (const entry of this.entries) {
      const range = entry.range;

      if (startRow < range.start) {
        if (endRow <= range.start) {
          endRow = Math.min(range.start, startRow + chunkSize);
          ranges.push({ start: startRow, end: endRow });
          return ranges;
        }
        ranges.push({ start: startRow, end: range.start });
        if (endRow <= range.end) return ranges;
        startRow = range.end;
      } else if (startRow < range.end) {
        if (endRow <= range.end) return ranges;
        startRow = range.end;
        endRow = Math.min(this.datasetTotalRows, Math.max(endRow, range.end + chunkSize));
      }
    }

    const last = this.entries[this.entries.length - 1].range;
    if (startRow >= last.end && startRow < this.datasetTotalRows) {
      ranges.push({
        start: startRow,
        end: Math.min(this.datasetTotalRows, Math.max(endRow, startRow + chunkSize)),
      });
    }

    return ranges;
  }

  /** Insert keeping {@link entries} sorted by `range.start`. */
  private insertEntry(entry: CacheEntry): void {
    let i = 0;
    while (i < this.entries.length && this.entries[i].range.start < entry.range.start) {
      i++;
    }
    this.entries.splice(i, 0, entry);
  }
}
