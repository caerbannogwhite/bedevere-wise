import { DataProvider } from "@/data/types";
import { SpreadsheetOptions } from "./types";
import { DEFAULT_CACHE_CHUNK_SIZE, DEFAULT_CACHE_TIME_TO_LIVE, DEFAULT_INITIAL_CACHE_SIZE, DEFAULT_MAX_CACHE_SIZE } from "./defaults";

type CacheRange = { start: number; end: number };

class CacheEntry {
  rows: any[][];
  lastAccessed: number;
  isExpired: boolean;
  timeToLive: number;

  constructor(rows: any[][], timeToLive: number) {
    this.rows = rows;
    this.lastAccessed = Date.now();
    this.timeToLive = timeToLive;
    this.isExpired = false;

    this.resetTimer();
  }

  private resetTimer(): void {
    setTimeout(() => {
      if (this.lastAccessed + this.timeToLive < Date.now()) {
        this.rows = [];
        this.isExpired = true;
      } else {
        this.resetTimer();
      }
    }, this.timeToLive);
  }
}

export class SpreadsheetCache {
  private dataCache: Map<CacheRange, CacheEntry> = new Map();
  private isLoading = false;
  private loadQueue: { resolve: () => void }[] = [];

  private datasetTotalRows: number = 0;
  private initialCacheSize: number;
  private cacheChunkSize: number;
  private maxCacheSize: number;
  private cacheTimeToLive: number;
  private dataProvider: DataProvider;

  constructor(dataProvider: DataProvider, options: SpreadsheetOptions) {
    this.dataProvider = dataProvider;

    this.initialCacheSize = options.initialCacheSize ?? DEFAULT_INITIAL_CACHE_SIZE;
    this.cacheChunkSize = options.cacheChunkSize ?? DEFAULT_CACHE_CHUNK_SIZE;
    this.maxCacheSize = options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
    this.cacheTimeToLive = options.cacheTimeToLive ?? DEFAULT_CACHE_TIME_TO_LIVE;

    this.maxCacheSize = Math.max(this.maxCacheSize, this.initialCacheSize + this.cacheChunkSize);
  }

  // Cache management methods
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
      const loadPromise = new Promise<void>((resolve) => {
        this.loadQueue.push({ resolve });
      });
      return loadPromise;
    }

    this.isLoading = true;

    // Clean up old cache entries
    await this.cleanup();

    // Check if we already have this data in cache
    const missingRanges = this.getMissingRanges(startRow, endRow);

    for (const range of missingRanges) {
      const data = await this.dataProvider.fetchData(range.start, range.end);
      this.dataCache.set(range, new CacheEntry(data, this.cacheTimeToLive));
    }

    this.isLoading = false;

    // Process queued requests
    while (this.loadQueue.length > 0) {
      const queuedItem = this.loadQueue.shift();
      if (queuedItem) {
        queuedItem.resolve();
      }
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

    // Collect data from cache
    const result: any[][] = [];
    const cachedRanges = this.getCachedRanges();

    // Find the range that contains our start row
    let currentStartRow = startRow;

    for (const range of cachedRanges) {
      if (currentStartRow >= range.start && currentStartRow < range.end) {
        // Start row is within this range
        const rangeStart = currentStartRow - range.start;
        const rangeEnd = Math.min(endRow - range.start, range.end - range.start);

        if (rangeEnd > rangeStart) {
          const rangeData = this.dataCache.get(range)!;
          rangeData.lastAccessed = Date.now();
          result.push(...rangeData.rows.slice(rangeStart, rangeEnd));
        }

        // Update currentStartRow for next iteration
        currentStartRow = range.end;

        // If we've covered all requested rows, break
        if (currentStartRow > endRow) {
          break;
        }
      }
    }

    return result;
  }

  // Cache statistics for debugging and monitoring
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
      cacheSize: this.dataCache.size,
      ranges: this.getCachedRanges(),
      totalRows: this.datasetTotalRows,
      initialCacheSize: this.initialCacheSize,
      cacheChunkSize: this.cacheChunkSize,
      maxCacheSize: this.maxCacheSize,
      cachedRows: this.getCachedRows(),
      isLoading: this.isLoading,
    };
  }

  public clear(): void {
    this.dataCache.clear();
    this.isLoading = false;
    this.loadQueue = [];
  }

  public getCachedRows(): number {
    return Array.from(this.dataCache.entries()).reduce((acc, [range, _]) => acc + (range.end - range.start), 0);
  }

  private getCachedRanges(): CacheRange[] {
    return Array.from(this.dataCache.keys()).sort((a, b) => a.start - b.start);
  }

  public getMissingRanges(startRow: number, endRow: number): CacheRange[] {
    // Intervals are open ended: start is included, end is not [start, end)

    // If the interval is smaller than the cache chunk size, set it to the cache chunk size
    const chunkSize = this.cacheChunkSize;
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
        endRow = Math.min(this.datasetTotalRows, Math.max(endRow, range.end + chunkSize));
      }

      // The start is equal to the end of the current range
      // will be handled by the next range
    }

    if (startRow >= currentRanges[currentRanges.length - 1].end && startRow < this.datasetTotalRows) {
      ranges.push({
        start: startRow,
        end: Math.min(this.datasetTotalRows, Math.max(endRow, startRow + chunkSize)),
      });
    }

    return ranges;
  }

  private async cleanup(): Promise<void> {
    // Remove expired entries
    const expiredEntries = Array.from(this.dataCache.entries()).filter(([_, entry]) => entry.isExpired);
    for (const [range, _] of expiredEntries) {
      this.dataCache.delete(range);
    }
  }
}
