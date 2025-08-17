// Test setup file for Vitest
import { vi } from "vitest";

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock setTimeout and setInterval for better test control
global.setTimeout = vi.fn((callback: any, delay: number) => {
  if (typeof callback === "function") {
    // For tests, execute immediately
    callback();
  }
  return 1; // Return a mock timer ID
});
global.setInterval = vi.fn();
global.clearTimeout = vi.fn();
global.clearInterval = vi.fn();
