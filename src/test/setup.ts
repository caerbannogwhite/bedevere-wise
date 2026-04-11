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
global.setTimeout = vi.fn((callback: any, _delay?: number) => {
  if (typeof callback === "function") {
    callback();
  }
  return 1 as unknown as ReturnType<typeof setTimeout>;
}) as unknown as typeof setTimeout;
global.setInterval = vi.fn() as unknown as typeof setInterval;
global.clearTimeout = vi.fn();
global.clearInterval = vi.fn();
