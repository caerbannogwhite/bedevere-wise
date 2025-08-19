import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SpreadsheetCache } from "../SpreadsheetCache";
import { DataProviderMock } from "@/test/mocks/DataProviderMock";
import { SpreadsheetOptions } from "../types";

describe("SpreadsheetCache", () => {
  let cache: SpreadsheetCache;
  let mockDataProvider: DataProviderMock;
  let options: SpreadsheetOptions;

  beforeEach(() => {
    // Create test data
    const testData = Array.from({ length: 1000 }, (_, i) => [`Row ${i}`, `Value ${i}`, i, i % 2 === 0, new Date(2024, 0, i + 1)]);

    mockDataProvider = new DataProviderMock(testData);
    options = {
      initialCacheSize: 200,
      cacheChunkSize: 50,
      maxCacheSize: 1000,
    };

    cache = new SpreadsheetCache(mockDataProvider, options);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create a cache with default state", () => {
      expect(cache).toBeInstanceOf(SpreadsheetCache);
    });
  });

  describe("initialize", () => {
    it("should initialize cache with correct total rows", async () => {
      await cache.initialize(1000);
      const stats = cache.getCacheStats();
      expect(stats.totalRows).toBe(1000);
    });

    it("should load initial chunk based on options", async () => {
      await cache.initialize(1000);
      const stats = cache.getCacheStats();
      expect(stats.ranges[0].end).toBeGreaterThanOrEqual(200);
    });

    it("should respect initialCacheSize option", async () => {
      const customOptions = { ...options, initialCacheSize: 100 };
      const customCache = new SpreadsheetCache(mockDataProvider, customOptions);
      await customCache.initialize(1000);
      const stats = customCache.getCacheStats();
      expect(stats.ranges[0].end).toBeGreaterThanOrEqual(100);
    });

    it("should not exceed total rows when initializing", async () => {
      await cache.initialize(50);
      const stats = cache.getCacheStats();
      expect(stats.ranges[0].end).toBeLessThanOrEqual(50);
    });
  });

  describe("loadChunk", () => {
    beforeEach(async () => {
      await cache.initialize(1000);
    });

    it("should load data for specified range", async () => {
      await cache.loadChunk(100, 200);
      const stats = cache.getCacheStats();
      expect(stats.ranges[0].end).toBeGreaterThanOrEqual(200);
    });

    it("should handle overlapping ranges correctly", async () => {
      await cache.loadChunk(100, 200);
      await cache.loadChunk(150, 250);
      const stats = cache.getCacheStats();
      expect(stats.ranges[1].start).toBe(200);
    });

    it("should respect cacheChunkSize option", async () => {
      const customOptions = { ...options, cacheChunkSize: 25 };
      const customCache = new SpreadsheetCache(mockDataProvider, customOptions);
      await customCache.initialize(1000);

      // Load a small range that should be expanded to chunk size
      await customCache.loadChunk(100, 110);
      const stats = customCache.getCacheStats();
      expect(stats.ranges[0].end).toBeGreaterThanOrEqual(125); // 100 + 25
    });

    it("should queue requests when already loading", async () => {
      // Start a load operation
      const loadPromise1 = cache.loadChunk(100, 200);

      // Try to load another chunk while first is loading
      const loadPromise2 = cache.loadChunk(300, 400);

      // Both should resolve
      await Promise.all([loadPromise1, loadPromise2]);

      const stats = cache.getCacheStats();
      expect(stats.ranges[1].start).toBe(400);
    });
  });

  describe("getData", () => {
    beforeEach(async () => {
      await cache.initialize(1000);
    });

    it("should return cached data when available", async () => {
      await cache.loadChunk(100, 200);
      const data = await cache.getData(110, 190);
      expect(data.length).toBe(80); // 190 - 110 + 1
      expect(data[0][0]).toBe("Row 110");
    });

    it("should fetch missing data automatically", async () => {
      const data = await cache.getData(100, 200);
      expect(data.length).toBe(101); // 200 - 100 + 1
      expect(data[0][0]).toBe("Row 100");
      expect(data[100][0]).toBe("Row 200");
    });

    it("should handle requests spanning multiple chunks", async () => {
      const data = await cache.getData(0, 300);
      expect(data.length).toBe(301);
      expect(data[0][0]).toBe("Row 0");
      expect(data[300][0]).toBe("Row 300");
    });

    it("should wait for loading to complete", async () => {
      // Start loading a chunk
      const loadPromise = cache.loadChunk(100, 200);

      // Request data while loading
      const dataPromise = cache.getData(110, 190);

      // Both should complete successfully
      await Promise.all([loadPromise, dataPromise]);

      const data = await dataPromise;
      expect(data.length).toBe(80);
    });
  });

  describe("getCacheStats", () => {
    beforeEach(async () => {
      await cache.initialize(1000);
    });

    it("should return correct cache statistics", () => {
      const stats = cache.getCacheStats();

      expect(stats).toHaveProperty("cacheSize");
      expect(stats).toHaveProperty("ranges");
      expect(stats).toHaveProperty("totalRows");
      expect(stats).toHaveProperty("isLoading");

      expect(stats.totalRows).toBe(1000);
      expect(stats.isLoading).toBe(false);
    });

    it("should reflect loading state", async () => {
      const loadPromise = cache.loadChunk(100, 200);
      expect(cache.getCacheStats().isLoading).toBe(true);

      await loadPromise;
      expect(cache.getCacheStats().isLoading).toBe(false);
    });
  });

  describe("clear", () => {
    beforeEach(async () => {
      await cache.initialize(1000);
      await cache.loadChunk(100, 200);
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

  describe("getMissingRanges", () => {
    beforeEach(async () => {
      await cache.initialize(1000);
    });

    it("should identify missing ranges correctly", async () => {
      // Load chunks at 0-50 and 100-150
      await cache.loadChunk(0, 50);
      await cache.loadChunk(100, 150);

      // Request data that spans gaps
      const data = await cache.getData(25, 125);
      expect(data.length).toBe(101);
    });

    it("should handle edge cases at boundaries", async () => {
      await cache.loadChunk(0, 50);
      await cache.loadChunk(100, 150);

      // Request data that starts in the middle of a cached range
      const data = await cache.getData(25, 75);
      expect(data.length).toBe(51);
    });
  });

  describe("cleanup", () => {
    it("should remove old entries when exceeding max cache size", async () => {
      const customOptions = { ...options, maxCacheSize: 2 };
      const customCache = new SpreadsheetCache(mockDataProvider, customOptions);

      await customCache.initialize(1000);

      // Load multiple chunks to exceed max cache size
      await customCache.loadChunk(0, 100);
      await customCache.loadChunk(100, 200);
      await customCache.loadChunk(200, 300);

      const stats = customCache.getCacheStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(2);
    });

    it("should update cache bounds after cleanup", async () => {
      const customOptions = { ...options, maxCacheSize: 1 };
      const customCache = new SpreadsheetCache(mockDataProvider, customOptions);

      await customCache.initialize(1000);
      await customCache.loadChunk(0, 100);
      await customCache.loadChunk(100, 200);

      const stats = customCache.getCacheStats();
      // Should keep the most recent chunk
      expect(stats.ranges[0].start).toBe(100);
      expect(stats.ranges[0].end).toBe(200);
    });
  });

  describe("edge cases and error handling", () => {
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
      const data = await singleRowCache.getData(0, 0);
      expect(data.length).toBe(1);
      expect(data[0][0]).toBe("Single Row");
    });

    it("should handle requests beyond dataset bounds", async () => {
      await cache.initialize(1000);

      // Request data beyond the dataset
      const data = await cache.getData(950, 1100);
      expect(data.length).toBe(50); // Only 950-999 should be returned
    });

    it("should handle concurrent initialization calls", async () => {
      const init1 = cache.initialize(1000);
      const init2 = cache.initialize(1000);

      await Promise.all([init1, init2]);

      const stats = cache.getCacheStats();
      expect(stats.totalRows).toBe(1000);
    });
  });

  describe("performance and memory", () => {
    it("should not create memory leaks with repeated operations", async () => {
      await cache.initialize(1000);

      // Perform many operations
      for (let i = 0; i < 10; i++) {
        await cache.loadChunk(i * 100, (i + 1) * 100);
        await cache.getData(i * 100, (i + 1) * 100);
      }

      const stats = cache.getCacheStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(options.maxCacheSize!);
    });

    it("should handle large datasets efficiently", async () => {
      const largeData = Array.from({ length: 10000 }, (_, i) => [`Row ${i}`]);
      const largeProvider = new DataProviderMock(largeData);
      const largeCache = new SpreadsheetCache(largeProvider, options);

      await largeCache.initialize(10000);

      const startTime = Date.now();
      await largeCache.getData(5000, 5100);
      const endTime = Date.now();

      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
