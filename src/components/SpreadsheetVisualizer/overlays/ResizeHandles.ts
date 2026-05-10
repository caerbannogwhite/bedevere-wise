/**
 * Column-resize handles — Phase C item 1.
 *
 * A pool of 4px-wide DOM strips positioned on every column's right edge.
 * Mounted inside the canvas group (which is `position:sticky`), so the
 * strips share the canvas's sticky-to-viewport coordinate system: x
 * positions are computed as `colOffsets[i] + colWidths[i] - scrollX`,
 * matching what the canvas itself paints.
 *
 * Pointer-down on a strip starts a drag; pointer-move updates the host's
 * column width directly and asks for a redraw; pointer-up stops the drag.
 * The host owns colWidths/colOffsets — we only call back through the
 * `ResizeHandlesHost` interface.
 */

export interface ResizeHandlesHost {
  /** Column widths array. Read-only via this API; resize mutations go
   *  through `applyColumnResize` so the host can recompute offsets. */
  getColWidths(): readonly number[];
  /** Column left-edge offsets. `colOffsets[i] + colWidths[i]` is the right
   *  edge of column `i`, which is where handle `i` lives. */
  getColOffsets(): readonly number[];
  /** Header row height (px). The handle starts below the header. */
  getHeaderHeight(): number;
  /** Visible viewport height (px). The handle ends here. */
  getViewportHeight(): number;
  /** Current horizontal scroll offset (px). */
  getScrollX(): number;
  /** Floor on column width — handle drags clamp here. */
  getMinCellWidth(): number;
  /** Width of the row-index gutter on the left. Handles whose right edge
   *  falls inside the gutter are hidden (they'd be unreachable anyway). */
  getRowHeaderWidth(): number;
  /** Apply a width change; the host updates colWidths + recomputes
   *  offsets + triggers a redraw. */
  applyColumnResize(col: number, newWidth: number): void;
}

export class ResizeHandles {
  private container: HTMLElement;
  private host: ResizeHandlesHost;
  private handles: HTMLElement[] = [];

  private dragging: { col: number; startClientX: number; startWidth: number } | null = null;
  private moveListener: ((e: PointerEvent) => void) | null = null;
  private upListener: ((e: PointerEvent) => void) | null = null;

  constructor(parent: HTMLElement, host: ResizeHandlesHost) {
    this.host = host;
    this.container = document.createElement("div");
    this.container.className = "spreadsheet-resize-handles";
    // Zero-size container; children position absolutely inside.
    this.container.style.cssText =
      "position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;";
    parent.appendChild(this.container);
  }

  /** Reposition every handle from the host's current layout state. */
  public relayout(): void {
    const colWidths = this.host.getColWidths();
    const colOffsets = this.host.getColOffsets();
    const scrollX = this.host.getScrollX();
    const headerHeight = this.host.getHeaderHeight();
    const viewportHeight = this.host.getViewportHeight();
    const gutter = this.host.getRowHeaderWidth();

    this.ensurePoolSize(colWidths.length);

    const bodyHeight = Math.max(0, viewportHeight - headerHeight);
    for (let i = 0; i < colWidths.length; i++) {
      const handle = this.handles[i];
      const rightEdgeContent = colOffsets[i] + colWidths[i];
      const x = rightEdgeContent - scrollX - 2; // 4px-wide handle, centred on the boundary
      // Hide handles whose boundary has scrolled under the gutter or off
      // to the right of the viewport — they're unreachable.
      const visible = rightEdgeContent - scrollX >= gutter;
      handle.style.display = visible ? "block" : "none";
      handle.style.left = `${x}px`;
      handle.style.top = `${headerHeight}px`;
      handle.style.height = `${bodyHeight}px`;
    }
  }

  /** Tear down listeners + remove from DOM. */
  public destroy(): void {
    this.endDrag();
    for (const h of this.handles) h.remove();
    this.handles.length = 0;
    this.container.remove();
  }

  private ensurePoolSize(n: number): void {
    while (this.handles.length < n) {
      const h = this.makeHandle(this.handles.length);
      this.handles.push(h);
      this.container.appendChild(h);
    }
    while (this.handles.length > n) {
      const h = this.handles.pop()!;
      h.remove();
    }
  }

  private makeHandle(col: number): HTMLElement {
    const h = document.createElement("div");
    h.className = "spreadsheet-resize-handle";
    h.style.cssText =
      "position:absolute;width:4px;cursor:col-resize;pointer-events:auto;";
    h.dataset.col = String(col);
    h.addEventListener("pointerdown", (e) => this.startDrag(e, col));
    return h;
  }

  private startDrag(e: PointerEvent, col: number): void {
    // Suppress the event so the canvas's column-header click handler
    // doesn't see this as a "header was clicked" (which would sort).
    e.preventDefault();
    e.stopPropagation();

    const widths = this.host.getColWidths();
    if (col < 0 || col >= widths.length) return;

    this.dragging = { col, startClientX: e.clientX, startWidth: widths[col] };
    this.handles[col].classList.add("is-dragging");

    this.moveListener = (ev) => this.onMove(ev);
    this.upListener = (ev) => this.onUp(ev);
    document.addEventListener("pointermove", this.moveListener);
    document.addEventListener("pointerup", this.upListener);

    // Keep the col-resize cursor across the page during the drag, even
    // if the pointer wanders off the strip.
    document.body.style.cursor = "col-resize";
    // Prevent text selection on header text while dragging.
    document.body.style.userSelect = "none";
  }

  private onMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const delta = e.clientX - this.dragging.startClientX;
    const min = this.host.getMinCellWidth();
    const newWidth = Math.max(min, this.dragging.startWidth + delta);
    this.host.applyColumnResize(this.dragging.col, newWidth);
    // applyColumnResize triggers a redraw; we still need to reposition
    // the handles since the offset of every column to the right shifted.
    this.relayout();
  }

  private onUp(_e: PointerEvent): void {
    this.endDrag();
  }

  private endDrag(): void {
    if (this.moveListener) {
      document.removeEventListener("pointermove", this.moveListener);
      this.moveListener = null;
    }
    if (this.upListener) {
      document.removeEventListener("pointerup", this.upListener);
      this.upListener = null;
    }
    if (this.dragging) {
      const h = this.handles[this.dragging.col];
      if (h) h.classList.remove("is-dragging");
    }
    this.dragging = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
}
