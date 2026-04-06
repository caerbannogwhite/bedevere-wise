import { DataProvider } from "@/data/types";
import { SpreadsheetOptions } from "./types";
import { DEFAULT_CACHE_CHUNK_SIZE, DEFAULT_CACHE_TIME_TO_LIVE, DEFAULT_INITIAL_CACHE_SIZE, DEFAULT_MAX_CACHE_SIZE } from "./defaults";

export type CacheRange = { start: number; end: number };

/**
 * A single cached chunk of rows. Holds the raw data plus its last-accessed
 * timestamp used by the central cleanup sweep in {@link SpreadsheetCache}.
 * Chunks no longer own their own timers (we used to spawn a recursive
 * setTimeout per entry, which created lots of timer callbacks).
 */
interface CacheEntry {
  range: CacheRange;
  rows: any[][];
  lastAccessed: number;
}

export class SpreadsheetCache {
  /**
   * Cached chunks, kept sorted by {@link CacheEntry.range.start}. This
   * replaces the previous `Map<CacheRange, CacheEntry>` which used reference
   * equality on its object keys — a silent foot-gun since a direct `.get()`
   * by value could never hit. Keeping the list sorted also lets us skip the
   * per-call `sort()` that the old implementation did inside `getData`.
   */
  private entries: CacheEntry[] = [];
  private isLoading = false;
  private loadQueue: { resolve: () => void }[] = [];

  private datasetTotalRows: number = 0;
  private initialCacheSize: number;
  private cacheChunkSize: number;
  private maxCacheSize: number;
  private cacheTimeToLive: number;
  private dataProvider: DataProvider;

  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dataProvider: DataProvider, options: SpreadsheetOptions) {
    this.dataProvider = dataProvider;

    this.initialCacheSize = options.initialCacheSize ?? DEFAULT_INITIAL_CACHE_SIZE;
    this.cacheChunkSize = options.cacheChunkSize ?? DEFAULT_CACHE_CHUNK_SIZE;
    this.maxCacheSize = options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
    this.cacheTimeToLive = options.cacheTimeToLive ?? DEFAULT_CACHE_TIME_TO_LIVE;

    this.maxCacheSize = Math.max(this.maxCacheSize, this.initialCacheSize + this.cacheChunkSize);

    // A single periodic sweep replaces per-entry recursive setTimeout chains.
    // One timer callback, regardless of how many entries exist.
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cacheTimeToLive);
  }

  public async initialize(totalRows: number): Promise<void> {
    this.datasetTotalRows = totalRows;
    if (totalRows === 0) {
      return; // Don't load anything for empty datasets
    }
    const initialSize = Math.min(this.initialCacheSize, this.datasetTotalRows);
    await this.loadChunk(0, initialSize);
  }

  public async loadChunk(startRow: number, endRow: number): Promise<void> {
    // If already loading, queue this request
    if (this.isLoading) {
      return new Promise<void>((resolve) => {
        this.loadQueue.push({ resolve });
      });
    }

    this.isLoading = true;

    // Check if we already have this data in cache
    const missingRanges = this.getMissingRanges(startRow, endRow);

    for (const range of missingRanges) {
      const data = await this.dataProvider.fetchData(range.start, range.end);
      this.insertEntry({ range, rows: data, lastAccessed: Date.now() });
    }

    this.isLoading = false;

    // Process queued requests
    while (this.loadQueue.length > 0) {
      this.loadQueue.shift()?.resolve();
    }
  }

  public async getValue(row: number, column: number): Promise<any> {
    return (await this.getData(row, row + 1))[0][column];
  }

  public async getData(startRow: number, endRow: number): Promise<any[][]> {
    // Handle boundary conditions
    if (startRow >= this.datasetTotalRows || endRow <= startRow) {
      return [];
    }

    // Clamp endRow to dataset bounds
    endRow = Math.min(endRow, this.datasetTotalRows);

    // Check if we have all the data in cache, if not, fetch it
    await this.loadChunk(startRow, endRow);

    // Collect data from cache. `entries` is already sorted by range.start, so
    // no per-call sort is needed here.
    const result: any[][] = [];
    let currentStartRow = startRow;

    for (const entry of this.entries) {
      const range = entry.range;
      if (currentStartRow >= range.start && currentStartRow < range.end) {
        const rangeStart = currentStartRow - range.start;
        const rangeEnd = Math.min(endRow - range.start, range.end - range.start);

        if (rangeEnd > rangeStart) {
          entry.lastAccessed = Date.now();
          result.push(...entry.rows.slice(rangeStart, rangeEnd));
        }

        currentStartRow = range.end;
        if (currentStartRow >= endRow) break;
      }
    }

    return result;
  }

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
      isLoading: this.isLoading,
    };
  }

  public clear(): void {
    this.entries = [];
    this.isLoading = false;
    this.loadQueue = [];
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  public getCachedRows(): number {
    return this.entries.reduce((acc, e) => acc + (e.range.end - e.range.start), 0);
  }

  public getMissingRanges(startRow: number, endRow: number): CacheRange[] {
    // Intervals are half-open: start is included, end is not [start, end)

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

      // Start is before the current range
      if (startRow < range.start) {
        // End before the current range: include the whole new range
        if (endRow <= range.start) {
          endRow = Math.min(range.start, startRow + chunkSize);
          ranges.push({ start: startRow, end: endRow });
          return ranges;
        }

        // The end is included or after the current range
        // Include from range start to current start
        ranges.push({ start: startRow, end: range.start });

        // The end is included in the current range: stop
        if (endRow <= range.end) return ranges;

        // If the end is not included, set start to the end of the
        // current range and continue
        startRow = range.end;
      }

      // The start is included in the current range
      else if (startRow < range.end) {
        // The end is included in the current range: stop
        if (endRow <= range.end) return ranges;

        startRow = range.end;
        endRow = Math.min(this.datasetTotalRows, Math.max(endRow, range.end + chunkSize));
      }

      // The start is equal to the end of the current range:
      // will be handled by the next range
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

  /**
   * Insert an entry keeping {@link entries} sorted by `range.start`.
   */
  private insertEntry(entry: CacheEntry): void {
    let i = 0;
    while (i < this.entries.length && this.entries[i].range.start < entry.range.start) {
      i++;
    }
    this.entries.splice(i, 0, entry);
  }

  /**
   * Periodic sweep: drop entries that haven't been accessed in
   * {@link cacheTimeToLive} ms. Called by the cleanup timer (not per-entry).
   */
  private cleanup(): void {
    const now = Date.now();
    this.entries = this.entries.filter((e) => now - e.lastAccessed < this.cacheTimeToLive);
  }
}
