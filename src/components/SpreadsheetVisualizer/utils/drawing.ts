export function minMax(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Effective device pixel ratio. Returned as a finite >= 1 number so callers
 * can multiply CSS-pixel dimensions to get the canvas backing-store size
 * without guarding for SSR or pathological values.
 */
export function getDpr(): number {
  if (typeof window === "undefined") return 1;
  const dpr = window.devicePixelRatio;
  return Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

const ELLIPSIS = "\u2026";

/**
 * Return `text` shortened so that `ctx.fillText(result, ...)` renders within
 * `maxWidth` pixels. If the full string already fits, it is returned as-is.
 * Otherwise a prefix is found by binary search and the ellipsis character is
 * appended. Returns an empty string when `maxWidth` is smaller than the
 * ellipsis itself.
 *
 * The caller must have already set `ctx.font` and `ctx.letterSpacing` so
 * `measureText` reflects the final render.
 */
// Memoisation cache for truncated cell strings. Keyed on
// `font|letterSpacing|maxWidth|text` so font-or-zoom changes auto-invalidate
// (callers reset the font signature via `setMeasureSignature`). On a steady
// scroll across tabular data, the same column header / numeric value
// repeats across many rows — this drops the per-frame `measureText` call
// count from ~200 to ~10 in typical viewports.
//
// LRU-ish: a Map preserves insertion order; once we exceed MAX_ENTRIES we
// drop the oldest 25% in one sweep. The cap is generous (cells × ~10
// distinct widths is plenty for any spreadsheet that fits on screen).
const MAX_TRUNCATION_ENTRIES = 4096;
let truncationCache: Map<string, string> = new Map();
let measureSignature = "";

/**
 * Tell the truncation cache about the current font signature. The Base
 * draw loop calls this once per pass after setting `ctx.font` /
 * `ctx.letterSpacing` so the cache key sees the active font without
 * having to read the context every lookup.
 */
export function setMeasureSignature(font: string, letterSpacing: string): void {
  const next = `${font}|${letterSpacing}`;
  if (next === measureSignature) return;
  measureSignature = next;
  truncationCache.clear();
}

/** Public for the perf harness; not used in the hot path. */
export function getTruncationCacheSize(): number {
  return truncationCache.size;
}

export function truncateWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || text.length === 0) return "";

  // Cache hit short-circuits the binary search AND the initial measureText.
  const key = `${measureSignature}|${maxWidth}|${text}`;
  const hit = truncationCache.get(key);
  if (hit !== undefined) {
    // Refresh recency by re-inserting (cheap on a Map of this size).
    truncationCache.delete(key);
    truncationCache.set(key, hit);
    return hit;
  }

  let result: string;
  if (ctx.measureText(text).width <= maxWidth) {
    result = text;
  } else {
    const ellipsisWidth = ctx.measureText(ELLIPSIS).width;
    if (ellipsisWidth > maxWidth) {
      result = "";
    } else {
      const budget = maxWidth - ellipsisWidth;
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(text.slice(0, mid)).width <= budget) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      result = lo === 0 ? ELLIPSIS : text.slice(0, lo) + ELLIPSIS;
    }
  }

  if (truncationCache.size >= MAX_TRUNCATION_ENTRIES) {
    // Drop the oldest 25% in one sweep so we amortise the cost over many
    // future inserts instead of evicting on every put.
    const dropCount = MAX_TRUNCATION_ENTRIES >> 2;
    const it = truncationCache.keys();
    for (let i = 0; i < dropCount; i++) {
      const k = it.next().value;
      if (k === undefined) break;
      truncationCache.delete(k);
    }
  }
  truncationCache.set(key, result);
  return result;
}
