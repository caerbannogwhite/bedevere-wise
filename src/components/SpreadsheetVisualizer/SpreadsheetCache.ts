import { DataProvider } from "@/data/types";
import { SpreadsheetOptions } from "./types";
import { DEFAULT_CACHE_CHUNK_SIZE, DEFAULT_INITIAL_CACHE_SIZE, DEFAULT_MAX_CACHE_SIZE } from "./defaults";

type CacheRange = { start: number; end: number };

export class SpreadsheetCache {
  private dataCache: Map<CacheRange, any[][]> = new Map();
  private startRow = 0;
  private endRow = 0;
  private isLoading = false;
  private loadQueue: { resolve: () => void }[] = [];

  private datasetTotalRows: number = 0;
  private dataProvider: DataProvider;
  private options: SpreadsheetOptions;

  constructor(dataProvider: DataProvider, options: SpreadsheetOptions) {
    this.dataProvider = dataProvider;
    this.options = options;
  }

  // Cache management methods
  public async initialize(totalRows: number): Promise<void> {
    this.datasetTotalRows = totalRows;
    const initialSize = Math.min(this.options.initialCacheSize ?? DEFAULT_INITIAL_CACHE_SIZE, this.datasetTotalRows);
    await this.loadChunk(0, initialSize);
  }

  public async loadChunk(startRow: number, endRow: number): Promise<void> {
    // If already loading, queue this request
    if (this.isLoading) {
      const loadPromise = new Promise<void>((resolve) => {
        this.loadQueue.push({ resolve });
      });
      return loadPromise;
    }

    this.isLoading = true;

    try {
      // Check if we already have this data in cache
      const missingRanges = this.getMissingRanges(startRow, endRow);
      console.log("loadChunk", startRow, endRow, missingRanges);

      for (const range of missingRanges) {
        const data = await this.dataProvider.fetchData(range.start, range.end);
        this.dataCache.set(range, data);
      }

      console.log("loadChunk", startRow, endRow, this.dataCache);

      // Update cache bounds
      this.startRow = Math.min(this.startRow, startRow);
      this.endRow = Math.max(this.endRow, endRow);

      // Clean up old cache entries if we exceed max cache size
      await this.cleanup();
    } finally {
      this.isLoading = false;

      // Process queued requests
      while (this.loadQueue.length > 0) {
        const queuedItem = this.loadQueue.shift();
        if (queuedItem) {
          queuedItem.resolve();
        }
      }
    }
  }

  // public async ensureCacheForVisibleRows(visibleStartRow: number, visibleEndRow: number): Promise<void> {
  //   // Check if we need to load more data
  //   const bufferSize = Math.floor((this.options.cacheChunkSize ?? DEFAULT_CACHE_CHUNK_SIZE) / 2);
  //   const loadStart = Math.max(0, visibleStartRow - bufferSize);
  //   const loadEnd = Math.min(this.datasetTotalRows, visibleEndRow + bufferSize);

  //   // Check if we have all the data we need
  //   let needsLoading = false;
  //   for (let row = loadStart; row < loadEnd; row++) {
  //     if (!this.dataCache.has({ start: row, end: row })) {
  //       needsLoading = true;
  //       break;
  //     }
  //   }

  //   if (needsLoading) {
  //     // Load data asynchronously without blocking the current operation
  //     this.loadChunk(loadStart, loadEnd).catch(console.error);
  //   }
  // }

  public async getData(startRow: number, endRow: number): Promise<any[][]> {
    // Check if we have all the data in cache, if not, fetch it
    const missingRanges = this.getMissingRanges(startRow, endRow);
    for (const range of missingRanges) {
      await this.loadChunk(range.start, range.end);
    }

    // Wait for all the data to be loaded
    while (this.isLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Assume all the required data is in cache
    const result: any[][] = [];
    const cachedRanges = this.getCachedRanges();
    for (const range of cachedRanges) {
      if (startRow >= range.start) {
        if (endRow < range.end) {
          result.push(...this.dataCache.get(range)!.slice(startRow - range.start, endRow - range.start + 1));
          break;
        } else {
          result.push(...this.dataCache.get(range)!.slice(startRow - range.start));
          startRow = range.end;
        }
      }
    }

    console.log("getData", startRow, endRow, this.dataCache);
    return result;
  }

  // Cache statistics for debugging and monitoring
  public getCacheStats(): {
    cacheSize: number;
    cacheStartRow: number;
    cacheEndRow: number;
    totalRows: number;
    cacheHitRate: number;
    isLoading: boolean;
  } {
    const totalCachedRows = this.endRow - this.startRow + 1;
    const cacheHitRate = totalCachedRows > 0 ? this.dataCache.size / totalCachedRows : 0;

    return {
      cacheSize: this.dataCache.size,
      cacheStartRow: this.startRow,
      cacheEndRow: this.endRow,
      totalRows: this.datasetTotalRows,
      cacheHitRate,
      isLoading: this.isLoading,
    };
  }

  public clear(): void {
    this.dataCache.clear();
    this.startRow = 0;
    this.endRow = 0;
    this.isLoading = false;
    this.loadQueue = [];
  }

  private getCachedRanges(): CacheRange[] {
    return Array.from(this.dataCache.keys()).sort((a, b) => a.start - b.start);
  }

  private getMissingRanges(startRow: number, endRow: number): CacheRange[] {
    // Intervals are open ended: start is included, end is not [start, end)

    // If the interval is smaller than the cache chunk size, set it to the cache chunk size
    const chunkSize = this.options.cacheChunkSize ?? DEFAULT_CACHE_CHUNK_SIZE;
    if (endRow - startRow < chunkSize) {
      endRow = Math.min(this.datasetTotalRows, startRow + chunkSize);
    }

    if (this.dataCache.size === 0) {
      return [{ start: startRow, end: endRow }];
    }

    const ranges: CacheRange[] = [];
    const currentRanges = this.getCachedRanges();

    for (let range of currentRanges) {
      // Start is before the current range
      if (startRow < range.start) {
        // End before the current range: include the whole new range
        if (endRow <= range.start) {
          endRow = Math.min(range.start, startRow + chunkSize);
          ranges.push({ start: startRow, end: endRow });
          break;
        }

        // The end is included or after the current range
        else {
          // Include from range start to current start
          ranges.push({ start: startRow, end: range.start });

          // The end is included in the current range: stop
          if (endRow <= range.end) break;

          // If the end is not included, set start to the end of the
          // current range and continue
          startRow = range.end;
        }
      }

      // The start is included in the current range
      else if (startRow < range.end) {
        // The end is included in the current range: stop
        if (endRow <= range.end) break;

        startRow = range.end;
        endRow = Math.min(this.datasetTotalRows, range.end + chunkSize);
      }

      // The start is equal to the end of the current range
      // will be handled by the next range
    }

    return ranges;
  }

  private async cleanup(): Promise<void> {
    if (this.dataCache.size <= (this.options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE)) {
      return;
    }

    const entriesToRemove = this.dataCache.size - (this.options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE);
    const sortedEntries = Array.from(this.dataCache.entries()).sort(([a], [b]) => a.start - b.start);

    // Remove oldest entries (keep the most recent)
    for (let i = 0; i < entriesToRemove; i++) {
      this.dataCache.delete(sortedEntries[i][0]);
    }

    // Update cache bounds
    if (this.dataCache.size > 0) {
      const remainingKeys = Array.from(this.dataCache.keys()).sort((a, b) => a.start - b.start);
      this.startRow = remainingKeys[0].start;
      this.endRow = remainingKeys[remainingKeys.length - 1].end;
    }
  }
}
