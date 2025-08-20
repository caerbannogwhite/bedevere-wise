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
  getDefaultHeaderBackgroundColor,
  getDefaultHeaderTextColor,
  getDefaultCellBackgroundColor,
  getDefaultCellTextColor,
  getDefaultBorderColor,
  getDefaultSelectionColor,
  getDefaultSelectionBorderColor,
  getDefaultHoverColor,
  getDefaultHoverBorderColor,
  getDefaultScrollbarColor,
  getDefaultScrollbarThumbColor,
  getDefaultScrollbarHoverColor,
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
import { listenForThemeChanges } from "./utils/theme";
import { ICellSelection, SpreadsheetOptions } from "./types";
import { DataProvider, DatasetMetadata, Column } from "../../data/types";
import { ColumnInternal } from "./internals";
import { minMax } from "./utils/drawing";
import { ColumnStatsVisualizer } from "../ColumnStatsVisualizer/ColumnStatsVisualizer";
import { getFormattedValueAndStyle } from "./utils/formatting";
import { SpreadsheetCache } from "./SpreadsheetCache";
import { SpreadsheetVisualizerBase } from "./SpreadsheetVisualizerBase";

type RequiredSpreadsheetOptions = Omit<Required<SpreadsheetOptions>, "height" | "width"> & {
  height: number;
  width: number;
};

export enum MouseState {
  Idle,
  Dragging,
  Hovering,
  HoveringVerticalScrollbar,
  HoveringHorizontalScrollbar,
  DraggingVerticalScrollbar,
  DraggingHorizontalScrollbar,
}

export enum ToDraw {
  None = 0,
  CellHover = 1,
  RowHover = 2,
  ColHover = 3,
  Selection = 4,
  Cells = 5,
}

export class SpreadsheetVisualizerSelection extends SpreadsheetVisualizerBase {
  protected selectionCanvas: HTMLCanvasElement;
  protected hoverCanvas: HTMLCanvasElement;
  protected selectionCtx: CanvasRenderingContext2D;
  protected hoverCtx: CanvasRenderingContext2D;

  // State variables

  protected hoveredCell: { row: number; col: number } | null = null;
  protected selectedCells: { startRow: number; endRow: number; startCol: number; endCol: number } | null = null;
  protected mouseState = MouseState.Idle;
  protected toDraw = ToDraw.Cells;
  protected dragStartX = 0;
  protected dragStartY = 0;
  protected lastScrollX = 0;
  protected lastScrollY = 0;
  protected singleColSelectionMode: boolean = true;
  protected selectedRows: number[] = [];
  protected selectedCols: number[] = [];
  protected cache: SpreadsheetCache;

  // Selection change callback
  private onSelectionChange: ((selection?: ICellSelection) => void)[] = [];

  constructor(
    container: HTMLElement,
    dataProvider: DataProvider,
    options: Partial<SpreadsheetOptions> = {},
    statsVisualizer?: ColumnStatsVisualizer
  ) {
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
  }

  public async getSelectedFormattedValues(): Promise<{ headers: string[]; indeces: number[]; data: string[][] }> {
    if (!this.selectedCells) return { headers: [], indeces: [], data: [] };

    const { startRow, endRow, startCol, endCol } = this.selectedCells;

    // Try to get data from cache first
    const data = await this.cache.getData(startRow - 1, endRow - 1);

    const formattedData = data.map((row) =>
      row.map((cell, col) => getFormattedValueAndStyle(cell, this.columns[col + startCol], this.options).formatted)
    );

    // Get column headers for the selected range
    const headers = [];
    for (let col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col++) {
      headers.push(this.columns[col].name);
    }

    // Get row indeces for the selected range
    const rowIndeces = [];
    for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row++) {
      rowIndeces.push(row);
    }

    return { headers, indeces: rowIndeces, data: formattedData };
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

    // TODO: check if this is needed
    // // If we have extra space, distribute it proportionally
    // if (this.totalWidth < availableWidth) {
    //   const extraWidth = availableWidth - this.totalWidth;
    //   this.colWidths = this.colWidths.map((width) => width + (width / this.totalWidth) * extraWidth);
    //   this.totalWidth = availableWidth;
    // }

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
        (hasScrollbar ? this.options.scrollbarWidth : 0)
    );
  }

  protected updateToDraw(newToDraw: ToDraw) {
    this.toDraw = Math.max(this.toDraw, newToDraw);
  }

  protected async draw() {
    const { canvas } = this;
    const { height } = canvas;

    // Calculate visible area
    const visibleStartRow = Math.floor(this.scrollY / this.options.cellHeight);
    const visibleEndRow = Math.min(visibleStartRow + Math.ceil(height / this.options.cellHeight), this.totalRows);

    this.ctx.textRendering = this.options.textRendering ?? DEFAULT_TEXT_RENDERING;
    this.ctx.letterSpacing = this.options.letterSpacing ?? DEFAULT_LETTER_SPACING;
    this.ctx.imageSmoothingEnabled = this.options.imageSmoothingEnabled ?? DEFAULT_IMAGE_SMOOTHING_ENABLED;
    this.ctx.imageSmoothingQuality = this.options.imageSmoothingQuality ?? DEFAULT_IMAGE_SMOOTHING_QUALITY;

    switch (this.toDraw) {
      //@ts-ignore: if cells is selected, fall through to selection
      case ToDraw.Cells:
        await this.drawCells(visibleStartRow, visibleEndRow);
        this.drawScrollbars();

      //@ts-ignore: if cells is selected, fall through to hover
      case ToDraw.Selection:
        this.drawSelection(visibleStartRow);

      case ToDraw.CellHover:
        this.drawCellHover(visibleStartRow);
        break;

      // case ToDraw.RowHover:
      //   this.drawRowHover(visibleStartRow, visibleEndRow);
      //   break;

      case ToDraw.ColHover:
        this.drawColHover();
        break;

      default:
        break;
    }

    this.toDraw = ToDraw.None;
  }

  protected async selectColumn(col: number) {
    let hasStatusPanelChanged = false;
    if (this.selectedCols.includes(col)) {
      this.selectedCols = this.selectedCols.filter((i) => i !== col);
      this.statsVisualizer?.hide();
      this.hasStatsPanel = false;
      hasStatusPanelChanged = true;
    } else {
      hasStatusPanelChanged = !this.hasStatsPanel;
      if (this.singleColSelectionMode) {
        this.selectedCols = [col]; // Only allow one column selection at a time
        this.selectedRows = [];
        this.selectedCells = null;
      } else {
        this.selectedCols.push(col);
      }

      if (this.statsVisualizer) {
        await this.statsVisualizer.showStats(this.columns[col]);
        this.hasStatsPanel = true;
      }
    }

    this.updateToDraw(ToDraw.Selection);
    this.notifySelectionChange();

    if (hasStatusPanelChanged) {
      this.updateLayout();
    }
  }

  private drawCellHover(visibleStartRow: number) {
    // Clear the hover canvas
    this.hoverCtx.clearRect(0, 0, this.hoverCanvas.width, this.hoverCanvas.height);

    this.hoverCtx.fillStyle = this.options.hoverColor;
    this.hoverCtx.strokeStyle = this.options.hoverBorderColor || this.options.borderColor;
    this.hoverCtx.lineWidth = 2;

    if (this.hoveredCell) {
      const { row, col } = this.hoveredCell;

      const y = (row - visibleStartRow) * this.options.cellHeight;
      const height = this.options.cellHeight;

      let x = this.colOffsets[col] - this.scrollX;
      let width = this.colWidths[col];

      if (x < this.options.rowHeaderWidth) {
        x = this.options.rowHeaderWidth;
        width = this.colOffsets[col + 1] - this.scrollX - this.options.rowHeaderWidth;
      }

      // Draw hover background
      this.hoverCtx.fillRect(x, y, width, height);

      // Draw enhanced border
      this.hoverCtx.strokeRect(x, y, width, height);

      // Add inner glow effect
      this.hoverCtx.strokeStyle = this.options.hoverBorderColor || this.options.borderColor;
      this.hoverCtx.lineWidth = 1;
      this.hoverCtx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    }
  }

  private drawColHover() {
    // Clear the hover canvas
    this.hoverCtx.clearRect(0, 0, this.hoverCanvas.width, this.hoverCanvas.height);

    this.hoverCtx.fillStyle = this.options.hoverColor;
    this.hoverCtx.strokeStyle = this.options.hoverBorderColor || this.options.borderColor;
    this.hoverCtx.lineWidth = 2;

    if (this.hoveredCell) {
      const { col } = this.hoveredCell;

      const height = Math.min(this.options.cellHeight + this.totalHeight, this.hoverCanvas.height - this.options.scrollbarWidth);

      let x = this.colOffsets[col] - this.scrollX;
      let width = this.colWidths[col];
      if (x < this.options.rowHeaderWidth) {
        x = this.options.rowHeaderWidth;
        width = this.colOffsets[col + 1] - this.scrollX - this.options.rowHeaderWidth;
      }

      // Draw hover background
      this.hoverCtx.fillRect(x, 0, width, height);

      // Draw enhanced border
      this.hoverCtx.strokeRect(x, 0, width, height);

      // Add inner glow effect
      this.hoverCtx.strokeStyle = this.options.hoverBorderColor || this.options.borderColor;
      this.hoverCtx.lineWidth = 1;
      this.hoverCtx.strokeRect(x + 1, 1, width - 2, height - 2);
    }
  }

  // TODO: Keep or remove?
  // private drawRowHover(startRow: number, endRow: number) {
  //   // Clear the hover canvas
  //   this.hoverCtx.clearRect(0, 0, this.hoverCanvas.width, this.hoverCanvas.height);

  //   this.hoverCtx.fillStyle = this.options.hoverColor;
  //   this.hoverCtx.strokeStyle = this.options.borderColor;

  //   if (this.hoveredCell) {
  //     const { row } = this.hoveredCell;

  //     if (row < startRow || row > endRow) return;

  //     const x = 0;
  //     const y = (row - startRow) * this.options.cellHeight;
  //     const width = this.selectionCanvas.width - this.options.scrollbarWidth;
  //     const height = this.options.cellHeight;

  //     this.hoverCtx.fillRect(x, y, width, height);
  //     this.hoverCtx.strokeRect(x, y, width, height);
  //   }
  // }

  private drawSelection(visibleStartRow: number) {
    // Clear the selection canvas
    this.selectionCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);

    this.drawCellSelection(visibleStartRow);
    this.drawColSelection();
  }

  private drawCellSelection(visibleStartRow: number) {
    // Draw selection
    if (this.selectedCells) {
      const { startRow, endRow, startCol, endCol } = this.selectedCells;
      this.selectionCtx.fillStyle = this.options.selectionColor;

      const minRow = Math.min(startRow, endRow);
      const maxRow = Math.max(startRow, endRow);
      const minCol = Math.min(startCol, endCol);
      const maxCol = Math.max(startCol, endCol);

      const height = this.options.cellHeight;
      let selectionBounds = { x: 0, y: 0, width: 0, height: 0 };

      // Draw selection backgrounds
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const y = (row - visibleStartRow) * this.options.cellHeight;

          let x = this.colOffsets[col] - this.scrollX;
          let width = this.colWidths[col];
          if (x < this.options.rowHeaderWidth) {
            x = this.options.rowHeaderWidth;
            width = this.colOffsets[col + 1] - this.scrollX - this.options.rowHeaderWidth;
          }

          if (x + width > 0 && x < this.canvas.width && y + height > 0 && y < this.canvas.height) {
            this.selectionCtx.fillRect(x, y, width, height);

            // Track the bounds for the selection border and handle
            if (row === minRow && col === minCol) {
              selectionBounds = { x, y, width: 0, height: 0 };
            }
            if (row === maxRow && col === maxCol) {
              selectionBounds.width = x + width - selectionBounds.x;
              selectionBounds.height = y + height - selectionBounds.y;
            }
          }
        }
      }

      // Draw enhanced selection border
      if (selectionBounds.width > 0 && selectionBounds.height > 0) {
        this.selectionCtx.strokeStyle = this.options.selectionBorderColor || this.options.borderColor;
        this.selectionCtx.lineWidth = 2;
        this.selectionCtx.strokeRect(selectionBounds.x, selectionBounds.y, selectionBounds.width, selectionBounds.height);

        // Add inner border for extra emphasis
        this.selectionCtx.lineWidth = 1;
        this.selectionCtx.strokeRect(selectionBounds.x + 1, selectionBounds.y + 1, selectionBounds.width - 2, selectionBounds.height - 2);

        // Draw selection handle (dot) in bottom-right corner
        const handleSize = 8;
        const handleX = selectionBounds.x + selectionBounds.width - handleSize / 8;
        const handleY = selectionBounds.y + selectionBounds.height - handleSize / 8;

        this.selectionCtx.fillStyle = this.options.selectionBorderColor || this.options.borderColor;
        // this.selectionCtx.ellipse(handleX, handleY, handleSize / 2, handleSize / 2, 0, 0, 2 * Math.PI);
        this.selectionCtx.beginPath();
        this.selectionCtx.arc(handleX, handleY, handleSize / 2, 0, 2 * Math.PI);
        this.selectionCtx.fill();

        // Add white outline to the handle for better visibility
        this.selectionCtx.strokeStyle = "#ffffff";
        this.selectionCtx.lineWidth = 1;
        this.selectionCtx.stroke();
      }
    }
  }

  private drawColSelection() {
    this.selectionCtx.fillStyle = this.options.selectionColor;
    this.selectionCtx.strokeStyle = this.options.selectionBorderColor || this.options.borderColor;
    this.selectionCtx.lineWidth = 2;

    const height = Math.min(this.options.cellHeight + this.totalHeight, this.selectionCanvas.height - this.options.scrollbarWidth);
    this.selectedCols.forEach((col) => {
      // Skip if the column is not visible
      if (this.colOffsets[col + 1] - this.scrollX < this.options.rowHeaderWidth) return;

      let x = this.colOffsets[col] - this.scrollX;
      let width = this.colWidths[col];
      if (x < this.options.rowHeaderWidth) {
        x = this.options.rowHeaderWidth;
        width = this.colOffsets[col + 1] - this.scrollX - this.options.rowHeaderWidth;
      }

      // Draw selection background
      this.selectionCtx.fillRect(x, 0, width, height);

      // Draw enhanced border
      this.selectionCtx.strokeRect(x, 0, width, height);

      // Add inner border for extra emphasis
      this.selectionCtx.lineWidth = 1;
      this.selectionCtx.strokeRect(x + 1, 1, width - 2, height - 2);
    });
  }

  // TODO: Keep or remove?
  // private drawRowSelection(startRow: number, endRow: number) {
  //   this.selectionCtx.fillStyle = this.options.selectionColor;
  //   this.selectionCtx.strokeStyle = this.options.borderColor;
  //   this.selectedRows.forEach((row) => {
  //     if (row < startRow || row > endRow) return;

  //     const x = 0;
  //     const y = (row - startRow) * this.options.cellHeight;
  //     const width = this.selectionCanvas.width - this.options.scrollbarWidth;
  //     const height = this.options.cellHeight;

  //     this.selectionCtx.fillRect(x, y, width, height);
  //     this.selectionCtx.strokeRect(x, y, width, height);
  //   });
  // }

  public async getSelection(): Promise<{ rows: number[]; columns: Column[]; values: any[][]; formatted: string[][] } | null> {
    if (!this.onSelectionChange) return null;
    if (this.selectedCols.length > 0) {
      return {
        rows: [],
        columns: this.selectedCols.map((col) => this.columns[col] as Column),
        values: [],
        formatted: [],
      };
    } else if (this.selectedCells) {
      try {
        const firstVisibleCol = this.getFirstVisibleCol();
        const lastVisibleCol = this.getLastVisibleCol();

        const data = (await this.cache.getData(this.selectedCells.startRow, this.selectedCells.endRow)).map((row) =>
          row.slice(this.selectedCells?.startCol ?? firstVisibleCol, this.selectedCells?.endCol ?? lastVisibleCol + 1)
        );

        console.log("selectedCells", this.selectedCells);
        console.log("data", data);

        const formatted = data.map((row) =>
          row.map((cell, index) => {
            const column = this.columns[index + this.selectedCells!.startCol];
            if (!column) return "";
            return getFormattedValueAndStyle(cell, column, this.options).formatted;
          })
        );

        const rows = Array.from(
          { length: this.selectedCells.endRow - this.selectedCells.startRow + 1 },
          (_, i) => this.selectedCells!.startRow + i
        );
        const columns = this.columns.filter(
          (_, index) => this.selectedCells!.startCol <= index && index <= this.selectedCells!.endCol
        ) as Column[];

        return {
          rows,
          columns,
          values: data,
          formatted,
        };
      } catch (error) {
        console.error("Failed to fetch cell data for selection:", error);
        return null;
      }
    } else {
      return null;
    }
  }

  protected async notifySelectionChange(): Promise<void> {
    const selection = await this.getSelection();
    this.onSelectionChange.forEach((callback) => callback(selection as ICellSelection | undefined));
  }
}
