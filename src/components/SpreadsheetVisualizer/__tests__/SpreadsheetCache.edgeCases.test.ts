import { describe, it, expect, beforeEach } from "vitest";
import { SpreadsheetCache } from "../SpreadsheetCache";
import { DataProviderMock } from "@/test/mocks/DataProviderMock";
import { createTestData, createCustomOptions } from "@/test/utils/testHelpers";

describe("SpreadsheetCache Edge Cases", () => {
  const simulateAsync = true;
  const totalRows = 1000;

  let cache: SpreadsheetCache;
  let mockDataProvider: DataProviderMock;

  beforeEach(() => {
    const testData = createTestData(totalRows);
    mockDataProvider = new DataProviderMock(testData, undefined, simulateAsync);
    const options = createCustomOptions({
      initialCacheSize: 100,
      cacheChunkSize: 25,
      maxCacheSize: 5,
    });
    cache = new SpreadsheetCache(mockDataProvider, options);
  });

  describe("complex range scenarios", () => {
    beforeEach(async () => {
      await cache.initialize(totalRows);
    });

    it("should handle fragmented cache with gaps", async () => {
      // Load non-contiguous chunks
      await cache.loadChunk(0, 50);
      await cache.loadChunk(100, 150);
      await cache.loadChunk(200, 250);

      // Request data that spans all chunks
      const data = await cache.getData(25, 225);
      expect(data.length).toBe(200);
    });

    it("should handle requests that start in the middle of cached ranges", async () => {
      await cache.loadChunk(0, 100);

      // Request starts in the middle of cached range
      const data = await cache.getData(50, 150);
      expect(data.length).toBe(100);
      expect(data[0][0]).toBe("Row 50");
      expect(data[50][0]).toBe("Row 100");
    });

    it("should handle requests that end in the middle of cached ranges", async () => {
      await cache.loadChunk(100, 200);

      // Request ends in the middle of cached range
      const data = await cache.getData(50, 150);
      expect(data.length).toBe(100);
      expect(data[50][0]).toBe("Row 100");
      expect(data[99][0]).toBe("Row 149");
    });

    it("should handle requests completely contained within a cached range", async () => {
      await cache.loadChunk(100, 200);

      // Request is completely within cached range
      const data = await cache.getData(125, 175);
      expect(data.length).toBe(50);
      expect(data[0][0]).toBe("Row 125");
      expect(data[49][0]).toBe("Row 174");
    });
  });

  describe("cache eviction scenarios", () => {
    it("should maintain cache size limits under heavy load", async () => {
      await cache.initialize(1000);

      // Load many chunks to trigger eviction
      for (let i = 0; i < 10; i++) {
        await cache.loadChunk(i * 100, (i + 1) * 100);
      }

      const stats = cache.getCacheStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(5);
    });

    it("should prioritize recent chunks during eviction", async () => {
      await cache.initialize(1000);

      // Load chunks in sequence
      await cache.loadChunk(0, 100);
      await cache.loadChunk(100, 200);
      await cache.loadChunk(200, 300);
      await cache.loadChunk(300, 400);
      await cache.loadChunk(400, 500);

      // The oldest chunks should be evicted first
      const stats = cache.getCacheStats();
      console.log(stats);
      expect(stats.ranges[0].start).toBeGreaterThan(0);
    });
  });

  describe("concurrent access patterns", () => {
    it("should handle multiple simultaneous getData calls", async () => {
      await cache.initialize(1000);

      // Make multiple concurrent requests
      const promises = [cache.getData(100, 200), cache.getData(150, 250), cache.getData(200, 300), cache.getData(250, 350)];

      const results = await Promise.all(promises);

      expect(results[0].length).toBe(100);
      expect(results[1].length).toBe(100);
      expect(results[2].length).toBe(100);
      expect(results[3].length).toBe(100);
    });

    it("should handle concurrent loadChunk and getData calls", async () => {
      await cache.initialize(1000);

      // Start loading a chunk
      const loadPromise = cache.loadChunk(100, 200);

      // Immediately request data from that range
      const dataPromise = cache.getData(110, 190);

      // Both should complete successfully
      await Promise.all([loadPromise, dataPromise]);

      const data = await dataPromise;
      expect(data.length).toBe(80);
    });
  });

  describe("boundary conditions", () => {
    it("should handle requests at dataset boundaries", async () => {
      await cache.initialize(1000);

      // Request data at the very beginning
      const startData = await cache.getData(0, 10);
      expect(startData.length).toBe(10);
      expect(startData[0][0]).toBe("Row 0");

      // Request data at the very end
      const endData = await cache.getData(990, 999);
      expect(endData.length).toBe(10);
      expect(endData[9][0]).toBe("Row 999");
    });

    it("should handle single row requests", async () => {
      await cache.initialize(1000);

      const singleRow = await cache.getData(500, 500);
      expect(singleRow.length).toBe(1);
      expect(singleRow[0][0]).toBe("Row 500");
    });

    it("should handle empty range requests", async () => {
      await cache.initialize(1000);

      // This should return empty array
      const emptyData = await cache.getData(100, 99);
      expect(emptyData.length).toBe(0);
    });
  });

  describe("memory and performance edge cases", () => {
    it("should handle very large chunk sizes", async () => {
      const largeChunkOptions = createCustomOptions({
        cacheChunkSize: 1000,
        maxCacheSize: 2,
      });
      const largeChunkCache = new SpreadsheetCache(mockDataProvider, largeChunkOptions);

      await largeChunkCache.initialize(1000);
      await largeChunkCache.loadChunk(0, 1000);

      const stats = largeChunkCache.getCacheStats();
      expect(stats.cacheSize).toBe(1);
    });

    it("should handle very small chunk sizes", async () => {
      const smallChunkOptions = createCustomOptions({
        cacheChunkSize: 1,
        maxCacheSize: 100,
      });
      const smallChunkCache = new SpreadsheetCache(mockDataProvider, smallChunkOptions);

      await smallChunkCache.initialize(1000);
      await smallChunkCache.loadChunk(100, 150);

      const stats = smallChunkCache.getCacheStats();
      expect(stats.cacheSize).toBeGreaterThan(1);
    });

    it("should handle rapid successive operations", async () => {
      await cache.initialize(1000);

      // Perform many operations rapidly
      const operations = [];
      for (let i = 0; i < 20; i++) {
        operations.push(cache.loadChunk(i * 50, (i + 1) * 50));
      }

      await Promise.all(operations);

      const stats = cache.getCacheStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(5);
    });
  });

  describe("error recovery scenarios", () => {
    it("should recover from failed data provider calls", async () => {
      // Create a mock that fails occasionally
      const failingProvider = new DataProviderMock(createTestData(1000));
      const originalFetchData = failingProvider.fetchData.bind(failingProvider);

      let failCount = 0;
      failingProvider.fetchData = async (startRow: number, endRow: number) => {
        failCount++;
        if (failCount <= 2) {
          throw new Error("Simulated failure");
        }
        return originalFetchData(startRow, endRow);
      };

      const failingCache = new SpreadsheetCache(failingProvider, createCustomOptions({}));
      await failingCache.initialize(1000);

      // Should eventually succeed
      const data = await failingCache.getData(100, 200);
      expect(data.length).toBe(101);
    });

    it("should handle data provider returning empty data", async () => {
      const emptyProvider = new DataProviderMock([]);
      const emptyCache = new SpreadsheetCache(emptyProvider, createCustomOptions({}));

      await emptyCache.initialize(0);
      const data = await emptyCache.getData(0, 10);
      expect(data.length).toBe(0);
    });
  });
});
