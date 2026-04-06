import {
  DEFAULT_MAX_WIDTH,
  DEFAULT_MIN_HEIGHT,
  DEFAULT_MAX_HEIGHT,
  DEFAULT_MIN_WIDTH,
  DEFAULT_CELL_HEIGHT,
  DEFAULT_CELL_PADDING,
  DEFAULT_ROW_HEADER_WIDTH,
  DEFAULT_MIN_CELL_WIDTH,
  DEFAULT_FONT_FAMILY,
  DEFAULT_HEADER_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_SCROLLBAR_WIDTH,
  DEFAULT_DATE_FORMAT,
  DEFAULT_DATETIME_FORMAT,
  DEFAULT_NUMBER_FORMAT,
  DEFAULT_MAX_CELL_WIDTH,
  DEFAULT_PERCENT_FORMAT_GUESS_FIT,
  DEFAULT_MAX_FORMAT_GUESS_LENGTH,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_NA_TEXT,
  DEFAULT_TRUE_TEXT,
  DEFAULT_FALSE_TEXT,
  DEFAULT_IMAGE_SMOOTHING_ENABLED,
  DEFAULT_LETTER_SPACING,
  DEFAULT_IMAGE_SMOOTHING_QUALITY,
  DEFAULT_TEXT_RENDERING,
  DEFAULT_DATETIME_LOCALE,
  DEFAULT_INITIAL_CACHE_SIZE,
  DEFAULT_CACHE_CHUNK_SIZE,
  DEFAULT_MAX_CACHE_SIZE,
  DEFAULT_CACHE_TIME_TO_LIVE,
} from "./defaults";
import { getThemeColors } from "./utils/theme";
import { SpreadsheetOptions } from "./types";
import { DataProvider, DatasetMetadata } from "../../data/types";
import { ColumnInternal } from "./internals";
import { minMax } from "./utils/drawing";
import { getFormattedValueAndStyle } from "./utils/formatting";
import { SpreadsheetCache } from "./SpreadsheetCache";

export enum ToDraw {
  None = 0,
  CellHover = 1,
  RowHover = 2,
  ColHover = 3,
  Selection = 4,
  Cells = 5,
}

export enum MouseState {
  Idle,
  Dragging,
  Hovering,
  HoveringVerticalScrollbar,
  HoveringHorizontalScrollbar,
  DraggingVerticalScrollbar,
  DraggingHorizontalScrollbar,
}

type RequiredSpreadsheetOptions = Omit<Required<SpreadsheetOptions>, "height" | "width"> & {
  height: number;
  width: number;
};

export class SpreadsheetVisualizerBase {
  protected container: HTMLElement;
  protected canvas: HTMLCanvasElement;
  protected selectionCanvas: HTMLCanvasElement;
  protected hoverCanvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected selectionCtx: CanvasRenderingContext2D;
  protected hoverCtx: CanvasRenderingContext2D;
  protected dataProvider: DataProvider;
  protected metadata: DatasetMetadata | null = null;
  protected columns: ColumnInternal[];
  protected totalRows: number;
  protected totalCols: number;
  protected options: RequiredSpreadsheetOptions;

  // State variables
  protected scrollX = 0;
  protected scrollY = 0;
  protected cache: SpreadsheetCache;

  // Cache
  protected colWidths: number[] = [];
  protected colOffsets: number[] = [];
  protected totalWidth = 0;
  protected totalHeight = 0;
  protected totalScrollY = 0;
  protected totalScrollX = 0;

  // Theme management
  protected themeCleanup: (() => void) | null = null;

  constructor(container: HTMLElement, dataProvider: DataProvider, options: Partial<SpreadsheetOptions> = {}) {
    this.container = container;

    this.canvas = document.createElement("canvas");
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;

    // Create and setup an overlay canvas for selection
    this.selectionCanvas = document.createElement("canvas");
    this.selectionCanvas.id = "selection-canvas";
    this.selectionCanvas.style.position = "absolute";
    this.selectionCanvas.style.top = `${this.canvas.offsetTop}px`;
    this.selectionCanvas.style.left = `${this.canvas.offsetLeft}px`;
    this.selectionCanvas.style.pointerEvents = "none"; // Allow mouse events to pass through to main canvas
    this.selectionCtx = this.selectionCanvas.getContext("2d", { alpha: true })!;

    // Insert selection canvas after the main canvas
    this.container.insertBefore(this.selectionCanvas, this.canvas.nextSibling);

    // Create and setup an overlay canvas for hover
    this.hoverCanvas = document.createElement("canvas");
    this.hoverCanvas.id = "hover-canvas";
    this.hoverCanvas.style.position = "absolute";
    this.hoverCanvas.style.top = `${this.canvas.offsetTop}px`;
    this.hoverCanvas.style.left = `${this.canvas.offsetLeft}px`;
    this.hoverCanvas.style.pointerEvents = "none"; // Allow mouse events to pass through to main canvas
    this.hoverCtx = this.hoverCanvas.getContext("2d", { alpha: true })!;

    // Insert hover canvas after the main canvas
    this.container.insertBefore(this.hoverCanvas, this.canvas.nextSibling);

    // Initialize data provider
    this.dataProvider = dataProvider;

    this.columns = [];
    this.totalRows = 0;
    this.totalCols = 0;

    // Set default options
    const t = getThemeColors();
    this.options = {
      // Viewport options
      maxHeight: options.maxHeight ?? DEFAULT_MAX_HEIGHT,
      maxWidth: options.maxWidth ?? DEFAULT_MAX_WIDTH,
      minHeight: options.minHeight ?? DEFAULT_MIN_HEIGHT,
      minWidth: options.minWidth ?? DEFAULT_MIN_WIDTH,
      height: options.height ?? this.container.clientHeight,
      width: options.width ?? this.container.clientWidth,

      // Cell options
      cellHeight: options.cellHeight ?? DEFAULT_CELL_HEIGHT,
      minCellWidth: options.minCellWidth ?? DEFAULT_MIN_CELL_WIDTH,
      maxCellWidth: options.maxCellWidth ?? DEFAULT_MAX_CELL_WIDTH,
      cellPadding: options.cellPadding ?? DEFAULT_CELL_PADDING,
      rowHeaderWidth: options.rowHeaderWidth ?? DEFAULT_ROW_HEADER_WIDTH,

      // Rendering options
      textRendering: options.textRendering ?? DEFAULT_TEXT_RENDERING,
      letterSpacing: options.letterSpacing ?? DEFAULT_LETTER_SPACING,
      imageSmoothingEnabled: options.imageSmoothingEnabled ?? DEFAULT_IMAGE_SMOOTHING_ENABLED,
      imageSmoothingQuality: options.imageSmoothingQuality ?? DEFAULT_IMAGE_SMOOTHING_QUALITY,

      // Style options
      borderWidth: options.borderWidth ?? DEFAULT_BORDER_WIDTH,
      fontFamily: options.fontFamily ?? DEFAULT_FONT_FAMILY,
      fontSize: options.fontSize ?? DEFAULT_FONT_SIZE,
      headerFontSize: options.headerFontSize ?? DEFAULT_HEADER_FONT_SIZE,
      headerBackgroundColor: options.headerBackgroundColor ?? t.headerBackgroundColor,
      headerTextColor: options.headerTextColor ?? t.headerTextColor,
      cellBackgroundColor: options.cellBackgroundColor ?? t.cellBackgroundColor,
      cellTextColor: options.cellTextColor ?? t.cellTextColor,
      borderColor: options.borderColor ?? t.borderColor,
      selectionColor: options.selectionColor ?? t.selectionColor,
      selectionBorderColor: options.selectionBorderColor ?? t.selectionBorderColor,
      hoverColor: options.hoverColor ?? t.hoverColor,
      hoverBorderColor: options.hoverBorderColor ?? t.hoverBorderColor,

      // Scrollbar options
      scrollbarWidth: options.scrollbarWidth ?? DEFAULT_SCROLLBAR_WIDTH,
      scrollbarColor: options.scrollbarColor ?? t.scrollbarColor,
      scrollbarThumbColor: options.scrollbarThumbColor ?? t.scrollbarThumbColor,
      scrollbarHoverColor: options.scrollbarHoverColor ?? t.scrollbarHoverColor,

      dateFormat: options.dateFormat ?? DEFAULT_DATE_FORMAT,
      datetimeFormat: options.datetimeFormat ?? DEFAULT_DATETIME_FORMAT,
      datetimeLocale: options.datetimeLocale ?? DEFAULT_DATETIME_LOCALE,
      numberFormat: options.numberFormat ?? DEFAULT_NUMBER_FORMAT,

      naText: options.naText ?? DEFAULT_NA_TEXT,
      trueText: options.trueText ?? DEFAULT_TRUE_TEXT,
      falseText: options.falseText ?? DEFAULT_FALSE_TEXT,
      textAlign: options.textAlign ?? DEFAULT_TEXT_ALIGN,

      maxFormatGuessLength: options.maxFormatGuessLength ?? DEFAULT_MAX_FORMAT_GUESS_LENGTH,
      percentFormatGuessFit: options.percentFormatGuessFit ?? DEFAULT_PERCENT_FORMAT_GUESS_FIT,

      // Cache options
      initialCacheSize: options.initialCacheSize ?? DEFAULT_INITIAL_CACHE_SIZE,
      cacheChunkSize: options.cacheChunkSize ?? DEFAULT_CACHE_CHUNK_SIZE,
      maxCacheSize: options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE,
      cacheTimeToLive: options.cacheTimeToLive ?? DEFAULT_CACHE_TIME_TO_LIVE,
    };

    // Initialize the data cache with initial data
    this.cache = new SpreadsheetCache(this.dataProvider, this.options);

    // Apply constraints
    this.options.height = minMax(this.options.height, this.options.minHeight, this.options.maxHeight);
    this.options.width = minMax(this.options.width, this.options.minWidth, this.options.maxWidth);
  }

  // Accessor methods for wrapper
  public getContainer(): HTMLElement {
    return this.container;
  }

  public getOptions(): SpreadsheetOptions {
    return this.options;
  }

  public getDataProvider(): DataProvider {
    return this.dataProvider;
  }

  private guessColumnWidths(values: any[][], col: ColumnInternal, colIndex: number): number {
    const widths = [this.ctx.measureText(col.name).width + this.options.cellPadding * 2];

    for (const row of values) {
      const { formatted, style } = getFormattedValueAndStyle(row[colIndex], this.columns[colIndex], this.options);
      this.ctx.textAlign = style.textAlign || this.options.textAlign;
      const width = this.ctx.measureText(formatted).width + this.options.cellPadding * 2;
      widths.push(width);
    }

    // sort the widths and get the percentile given by percentFormatGuessFit
    const sortedWidths = widths.sort((a, b) => a - b);
    const percentile = Math.floor(sortedWidths.length * this.options.percentFormatGuessFit);
    const width = sortedWidths[percentile];

    return minMax(width, this.options.minCellWidth, this.options.maxCellWidth);
  }

  protected async calculateColumnWidths() {
    this.ctx.font = `${this.options.fontSize}px ${this.options.fontFamily}`;
    this.ctx.textAlign = "left";
    this.ctx.textRendering = this.options.textRendering ?? DEFAULT_TEXT_RENDERING;
    this.ctx.letterSpacing = this.options.letterSpacing ?? DEFAULT_LETTER_SPACING;
    this.ctx.imageSmoothingEnabled = this.options.imageSmoothingEnabled ?? DEFAULT_IMAGE_SMOOTHING_ENABLED;
    this.ctx.imageSmoothingQuality = this.options.imageSmoothingQuality ?? DEFAULT_IMAGE_SMOOTHING_QUALITY;

    // Try to get rows from cache first, fallback to data provider
    const maxRows = Math.min(this.options.maxFormatGuessLength, this.totalRows);
    const rows = await this.cache.getData(0, maxRows);

    const availableWidth = this.canvas.width - this.options.rowHeaderWidth;

    // Calculate minimum widths based on content
    this.colWidths = this.columns.map((col, colIndex) => {
      col.widthPx = this.guessColumnWidths(rows, col, colIndex);
      return col.widthPx;
    });

    // Calculate column offsets
    this.colOffsets = [this.options.rowHeaderWidth];
    for (let i = 1; i < this.columns.length; i++) {
      this.colOffsets.push(this.colOffsets[i - 1] + this.colWidths[i - 1]);
    }

    // Calculate total width
    this.totalWidth = this.colOffsets[this.colOffsets.length - 1] + this.colWidths[this.colWidths.length - 1];

    const hasScrollbar = this.totalWidth > availableWidth;

    this.totalScrollX = this.totalWidth - this.canvas.width + (hasScrollbar ? this.options.scrollbarWidth : 0);
  }

  protected calculateRowHeight() {
    const availableHeight = this.canvas.height - this.options.scrollbarWidth;
    const minTotalHeight = this.columns.length * this.options.cellHeight;
    const hasScrollbar = minTotalHeight > availableHeight;

    this.totalHeight = this.totalRows * this.options.cellHeight;
    this.totalScrollY = Math.max(
      0,
      this.totalHeight -
        this.canvas.height +
        this.options.cellHeight * 2 + // header
        (hasScrollbar ? this.options.scrollbarWidth : 0),
    );
  }

  protected async preloadDataForScroll(scrollY: number): Promise<void> {
    // Calculate which rows will be visible after scrolling
    const visibleStartRow = Math.floor(scrollY / this.options.cellHeight);
    const visibleEndRow = Math.min(visibleStartRow + Math.ceil(this.canvas.height / this.options.cellHeight), this.totalRows);

    // Preload data for visible rows plus buffer
    const bufferSize = this.options.cacheChunkSize;
    const preloadStart = Math.max(0, visibleStartRow - bufferSize);
    const preloadEnd = Math.min(this.totalRows, visibleEndRow + bufferSize);

    // Load data asynchronously without blocking
    this.cache.loadChunk(preloadStart, preloadEnd).catch(console.error);
  }

  protected isMouseOverVerticalScrollbar(x: number, _: number): boolean {
    return x >= this.canvas.width - this.options.scrollbarWidth;
  }

  protected isMouseOverHorizontalScrollbar(_: number, y: number): boolean {
    return y >= this.canvas.height - this.options.scrollbarWidth;
  }

  protected isMouseOverColumnHeader(x: number, y: number): boolean {
    return x >= this.options.rowHeaderWidth && y < this.options.cellHeight;
  }

  protected isMouseOverRowIndex(x: number, _: number): boolean {
    return x <= this.options.rowHeaderWidth;
  }

  protected getFirstVisibleColumnIndex(): number {
    if (this.colOffsets.length === 0) return 0;

    // Binary search: find the rightmost column whose offset <= scrollX
    let lo = 0;
    let hi = this.colOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.colOffsets[mid] <= this.scrollX) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  protected getLastVisibleColumnIndex(): number {
    if (this.colOffsets.length === 0) return 0;

    const rightEdge = this.scrollX + this.canvas.width;

    // Binary search: find the leftmost column whose offset > rightEdge
    let lo = 0;
    let hi = this.colOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.colOffsets[mid] + this.colWidths[mid] <= rightEdge) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  protected getCellAtPosition(x: number, y: number): { row: number; col: number } | null {
    const adjustedX = x + this.scrollX;
    const adjustedY = y + this.scrollY;

    // Check if we're in the row header area
    if (adjustedX < this.options.rowHeaderWidth) {
      const row = Math.floor(adjustedY / this.options.cellHeight);
      if (row >= 0 && row < this.totalRows) {
        return { row, col: -1 };
      }
      return null;
    }

    // Find the column
    let colOffset = this.options.rowHeaderWidth;
    let col = 0;
    for (; col < this.colWidths.length; col++) {
      if (adjustedX < colOffset + this.colWidths[col]) break;
      colOffset += this.colWidths[col];
    }

    // Find the row
    const row = Math.floor(adjustedY / this.options.cellHeight);

    // Check bounds: this.totalRows is included because the row 0 is the column headers
    if (row >= 0 && row <= this.totalRows && col < this.totalCols) {
      return { row, col };
    }

    return null;
  }

  protected async drawCells(startRow: number, endRow: number) {
    const dataPromise = this.cache.getData(startRow, endRow);

    const { ctx, canvas } = this;
    const { width, height } = canvas;

    const firstVisibleColumnIndex = this.getFirstVisibleColumnIndex();
    const lastVisibleColumnIndex = this.getLastVisibleColumnIndex();

    // Clear the canvas
    ctx.clearRect(0, 0, width, height);

    // Draw headers
    ctx.fillStyle = this.options.headerBackgroundColor;
    ctx.fillRect(0, 0, width, this.options.cellHeight);
    ctx.fillRect(0, 0, this.options.rowHeaderWidth, height);

    // Common settings for text
    ctx.font = `${this.options.headerFontSize}px ${this.options.fontFamily}`;
    ctx.fillStyle = this.options.headerTextColor;
    ctx.textBaseline = "middle";

    // Draw column headers
    ctx.textAlign = "left";
    ctx.strokeStyle = this.options.borderColor;

    let x = this.colOffsets[firstVisibleColumnIndex] - this.scrollX;
    for (let col = firstVisibleColumnIndex; col <= lastVisibleColumnIndex; col++) {
      ctx.strokeRect(x, 0, this.colWidths[col], this.options.cellHeight);

      const textWidth = ctx.measureText(this.columns[col].name).width;
      const availableWidth = this.colWidths[col] - this.options.cellPadding * 2;
      const availableTextLength = Math.floor((availableWidth / textWidth) * this.columns[col].name.length);
      const text = this.columns[col].name.slice(0, availableTextLength);

      const textX = x + this.options.cellPadding;
      const textY = this.options.cellHeight >> 1; // Divide by 2 to center the text

      ctx.strokeText(text, textX, textY, availableWidth);
      ctx.fillText(text, textX, textY, availableWidth);

      x += this.colWidths[col];
    }

    // Draw cells — iterate raw data rows directly instead of slicing per row
    const data = await dataPromise;
    let y = this.options.cellHeight; // Keep the header at the top
    for (let row = 0; row < data.length; row++) {
      x = this.colOffsets[firstVisibleColumnIndex] - this.scrollX;
      for (let col = firstVisibleColumnIndex; col <= lastVisibleColumnIndex; col++) {
        const cellWidth = this.colWidths[col];
        const column = this.columns[col];

        // Draw cell background
        ctx.fillStyle = this.options.cellBackgroundColor;
        ctx.fillRect(x, y, cellWidth, this.options.cellHeight);

        // Draw cell text
        const { formatted, style } = getFormattedValueAndStyle(data[row][col], column, this.options);
        const textY = y + this.options.cellHeight / 2;

        let textX = x + this.options.cellPadding;
        switch (style.textAlign) {
          case "center":
            textX = x + cellWidth / 2;
            break;
          case "right":
            textX = x + cellWidth - this.options.cellPadding;
        }

        ctx.fillStyle = style.textColor || this.options.cellTextColor;
        ctx.textAlign = style.textAlign || this.options.textAlign;
        ctx.fillText(formatted, textX, textY);

        // Draw cell border
        ctx.strokeStyle = this.options.borderColor;
        ctx.strokeRect(x, y, cellWidth, this.options.cellHeight);

        x += cellWidth;
      }
      y += this.options.cellHeight;
    }

    // Draw row indices
    ctx.strokeStyle = this.options.borderColor;

    ctx.textAlign = "right";
    const textX = this.options.rowHeaderWidth - this.options.cellPadding;

    // Top left corner
    ctx.fillStyle = this.options.headerBackgroundColor;
    ctx.fillRect(0, 0, this.options.rowHeaderWidth, this.options.cellHeight);
    ctx.strokeRect(0, 0, this.options.rowHeaderWidth, this.options.cellHeight);

    y = this.options.cellHeight; // Keep the header at the top
    for (let row = startRow; row < endRow; row++) {
      ctx.fillStyle = this.options.headerBackgroundColor;
      ctx.fillRect(0, y, this.options.rowHeaderWidth, this.options.cellHeight);

      ctx.strokeRect(0, y, this.options.rowHeaderWidth, this.options.cellHeight);

      const textY = y + this.options.cellHeight / 2;
      ctx.fillStyle = this.options.headerTextColor;

      ctx.strokeText((row + 1).toString(), textX, textY);
      ctx.fillText((row + 1).toString(), textX, textY);

      y += this.options.cellHeight;
    }
  }

  protected drawScrollbars() {
    const { ctx, canvas } = this;
    const { width, height } = canvas;
    const sw = this.options.scrollbarWidth;

    const hasVerticalScrollbar = this.totalHeight > height;
    const hasHorizontalScrollbar = this.totalWidth > width;

    // The vertical track stops short of the horizontal scrollbar (and vice
    // versa) so the two never overlap — leaving a square gap in the bottom-
    // right corner that is filled with a distinct background.
    const vTrackHeight = height - (hasHorizontalScrollbar ? sw : 0);
    const hTrackWidth = width - (hasVerticalScrollbar ? sw : 0);

    // Draw vertical scrollbar
    if (hasVerticalScrollbar) {
      const thumbHeight = Math.max(sw, (vTrackHeight / this.totalHeight) * vTrackHeight);
      const thumbY = (this.scrollY / this.totalScrollY) * (vTrackHeight - thumbHeight);

      // Track
      ctx.fillStyle = this.options.scrollbarColor;
      ctx.fillRect(width - sw, 0, sw, vTrackHeight);

      // Thumb
      ctx.fillStyle = this.options.scrollbarThumbColor;
      ctx.fillRect(width - sw, thumbY, sw, thumbHeight);
    }

    // Draw horizontal scrollbar
    if (hasHorizontalScrollbar) {
      const thumbWidth = Math.max(sw, (hTrackWidth / this.totalWidth) * hTrackWidth);
      const thumbX = (this.scrollX / this.totalScrollX) * (hTrackWidth - thumbWidth);

      // Track
      ctx.fillStyle = this.options.scrollbarColor;
      ctx.fillRect(0, height - sw, hTrackWidth, sw);

      // Thumb
      ctx.fillStyle = this.options.scrollbarThumbColor;
      ctx.fillRect(thumbX, height - sw, thumbWidth, sw);
    }

    // Corner square where both scrollbars meet
    if (hasVerticalScrollbar && hasHorizontalScrollbar) {
      ctx.fillStyle = this.options.headerBackgroundColor;
      ctx.fillRect(width - sw, height - sw, sw, sw);
    }
  }
}
