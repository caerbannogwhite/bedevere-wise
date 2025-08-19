import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SpreadsheetCache } from "../SpreadsheetCache";
import { DataProviderMock } from "@/test/mocks/DataProviderMock";
import { SpreadsheetOptions } from "../types";

describe("SpreadsheetCache Basic Functionality", () => {
  const totalRows = 100;
  const simulateAsync = true;

  let cache: SpreadsheetCache;
  let mockDataProvider: DataProviderMock;
  let options: SpreadsheetOptions;

  beforeEach(() => {
    // Create simple test data
    const testData = Array.from({ length: totalRows }, (_, i) => [`Row ${i}`, `Value ${i}`, i]);

    mockDataProvider = new DataProviderMock(testData, undefined, simulateAsync);
    options = {
      initialCacheSize: 20,
      cacheChunkSize: 10,
      maxCacheSize: 50,
    };

    cache = new SpreadsheetCache(mockDataProvider, options);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create a cache instance", () => {
      expect(cache).toBeInstanceOf(SpreadsheetCache);
    });
  });

  describe("initialize", () => {
    it("should initialize cache with total rows", async () => {
      await cache.initialize(totalRows);
      const stats = cache.getCacheStats();
      expect(stats.totalRows).toBe(totalRows);
    });

    it("should load initial chunk", async () => {
      await cache.initialize(totalRows);
      const stats = cache.getCacheStats();
      expect(stats.ranges.length).toBeGreaterThan(0);
    });
  });

  describe("getMissingRanges", () => {
    it("should return missing ranges", async () => {
      await cache.initialize(totalRows);
      let stats = cache.getCacheStats();

      expect(stats.ranges.length).toBe(1);
      expect(stats.ranges[0].start).toBe(0);
      expect(stats.ranges[0].end).toBe(20);

      // Load a detatched chunk
      await cache.loadChunk(40, 60);
      stats = cache.getCacheStats();

      expect(stats.ranges.length).toBe(2);
      expect(stats.ranges[1].start).toBe(40);
      expect(stats.ranges[1].end).toBe(60);

      // Load a chunk that starts between two ranges
      await cache.loadChunk(30, 50);
      stats = cache.getCacheStats();

      expect(stats.ranges.length).toBe(3);
      expect(stats.ranges[1].start).toBe(30);
      expect(stats.ranges[1].end).toBe(40);

      // Load a chunk that starts inside the first range
      // and ends inside the third range
      await cache.loadChunk(10, 50);
      stats = cache.getCacheStats();

      expect(stats.ranges.length).toBe(3);
      expect(stats.ranges[1].start).toBe(30);
      expect(stats.ranges[1].end).toBe(40);

      // Load a chunk that goes beyond the dataset
      await cache.loadChunk(95, 110);
      stats = cache.getCacheStats();

      expect(stats.ranges.length).toBe(4);
      expect(stats.ranges[3].start).toBe(95);
      expect(stats.ranges[3].end).toBe(100);
    });
  });

  describe("loadChunk", () => {
    beforeEach(async () => {
      await cache.initialize(totalRows);
    });

    it("should load data for a range", async () => {
      await cache.loadChunk(25, 50);
      const stats = cache.getCacheStats();
      expect(stats.ranges[stats.ranges.length - 1].end).toBe(50);
    });

    it("should handle overlapping ranges", async () => {
      await cache.loadChunk(0, 30);
      await cache.loadChunk(20, 50);

      const stats = cache.getCacheStats();
      expect(stats.ranges[stats.ranges.length - 1].end).toBe(50);
    });
  });

  describe("getData", () => {
    beforeEach(async () => {
      await cache.initialize(totalRows);
    });

    it("should return cached data when available", async () => {
      await cache.loadChunk(0, 50);
      const data = await cache.getData(10, 20);
      expect(data.length).toBe(10);
      expect(data[0][0]).toBe("Row 10");
    });

    it("should fetch missing data automatically", async () => {
      const data = await cache.getData(0, 25);
      expect(data.length).toBe(25);
      expect(data[0][0]).toBe("Row 0");
      expect(data[24][0]).toBe("Row 24");
    });
  });

  describe("getCacheStats", () => {
    beforeEach(async () => {
      await cache.initialize(totalRows);
    });

    it("should return cache statistics", () => {
      const stats = cache.getCacheStats();

      expect(stats).toHaveProperty("cacheSize");
      expect(stats).toHaveProperty("ranges");
      expect(stats).toHaveProperty("totalRows");
      expect(stats).toHaveProperty("cachedRows");
      expect(stats).toHaveProperty("initialCacheSize");
      expect(stats).toHaveProperty("cacheChunkSize");
      expect(stats).toHaveProperty("maxCacheSize");
      expect(stats).toHaveProperty("isLoading");

      expect(stats.totalRows).toBe(totalRows);
      expect(stats.isLoading).toBe(false);
    });

    it("should reflect loading state", async () => {
      const loadPromise = cache.loadChunk(50, 75);
      expect(cache.getCacheStats().isLoading).toBe(true);

      await loadPromise;
      expect(cache.getCacheStats().isLoading).toBe(false);
    });
  });

  describe("clear", () => {
    beforeEach(async () => {
      await cache.initialize(totalRows);
      await cache.loadChunk(0, 50);
    });

    it("should clear all cached data", () => {
      const statsBefore = cache.getCacheStats();
      expect(statsBefore.cacheSize).toBeGreaterThan(0);

      cache.clear();

      const statsAfter = cache.getCacheStats();
      expect(statsAfter.cacheSize).toBe(0);
      expect(statsAfter.ranges.length).toBe(0);
      expect(statsAfter.isLoading).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle empty dataset", async () => {
      const emptyProvider = new DataProviderMock([]);
      const emptyCache = new SpreadsheetCache(emptyProvider, options);

      await emptyCache.initialize(0);
      const stats = emptyCache.getCacheStats();
      expect(stats.totalRows).toBe(0);
      expect(stats.cacheSize).toBe(0);
    });

    it("should handle single row dataset", async () => {
      const singleRowProvider = new DataProviderMock([["Single Row"]]);
      const singleRowCache = new SpreadsheetCache(singleRowProvider, options);

      await singleRowCache.initialize(1);

      const data = await singleRowCache.getData(0, 1);
      expect(data.length).toBe(1);
      expect(data[0][0]).toBe("Single Row");
    });

    it("should handle requests beyond dataset bounds", async () => {
      await cache.initialize(totalRows);

      // Request data beyond the dataset
      const data = await cache.getData(90, 110);
      expect(data.length).toBe(10);
    });
  });

  describe("cache management", () => {
    it("should respect max cache size", async () => {
      const smallCacheOptions = { ...options, maxCacheSize: 2 };
      const smallCache = new SpreadsheetCache(mockDataProvider, smallCacheOptions);

      await smallCache.initialize(totalRows);

      // Load multiple chunks to exceed max cache size
      await smallCache.loadChunk(0, 25);
      await smallCache.loadChunk(25, 50);
      await smallCache.loadChunk(50, 75);

      const stats = smallCache.getCacheStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(2);
    });
  });
});
