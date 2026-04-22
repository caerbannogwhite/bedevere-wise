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
export function truncateWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || text.length === 0) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;

  const ellipsisWidth = ctx.measureText(ELLIPSIS).width;
  if (ellipsisWidth > maxWidth) return "";

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
  return lo === 0 ? ELLIPSIS : text.slice(0, lo) + ELLIPSIS;
}
