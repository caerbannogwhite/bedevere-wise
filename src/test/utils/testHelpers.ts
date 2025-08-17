import { SpreadsheetOptions } from "@/components/SpreadsheetVisualizer/types";
import { DEFAULT_INITIAL_CACHE_SIZE, DEFAULT_CACHE_CHUNK_SIZE, DEFAULT_MAX_CACHE_SIZE } from "@/components/SpreadsheetVisualizer/defaults";
import { vi } from "vitest";

export function createTestData(rows: number, columns: number = 5): any[][] {
  return Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: columns }, (_, colIndex) => {
      switch (colIndex) {
        case 0:
          return `Row ${rowIndex}`;
        case 1:
          return `Value ${rowIndex}`;
        case 2:
          return rowIndex;
        case 3:
          return rowIndex % 2 === 0;
        case 4:
          return new Date(2024, 0, rowIndex + 1);
        default:
          return `Col${colIndex}_${rowIndex}`;
      }
    })
  );
}

export function createDefaultOptions(): SpreadsheetOptions {
  return {
    initialCacheSize: DEFAULT_INITIAL_CACHE_SIZE,
    cacheChunkSize: DEFAULT_CACHE_CHUNK_SIZE,
    maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
  };
}

export function createCustomOptions(overrides: Partial<SpreadsheetOptions>): SpreadsheetOptions {
  return {
    ...createDefaultOptions(),
    ...overrides,
  };
}

export function createRange(start: number, end: number): { start: number; end: number } {
  return { start, end };
}

export function createRanges(...ranges: [number, number][]): { start: number; end: number }[] {
  return ranges.map(([start, end]) => ({ start, end }));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mockConsoleLog(): any {
  return vi.fn();
}
