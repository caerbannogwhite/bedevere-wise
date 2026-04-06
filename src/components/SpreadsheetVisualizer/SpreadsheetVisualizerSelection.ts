import { ICellSelection, SpreadsheetOptions } from "./types";
import { DataProvider, Column } from "../../data/types";
import { ColumnStatsVisualizer } from "../ColumnStatsVisualizer/ColumnStatsVisualizer";
import { getFormattedValueAndStyle } from "./utils/formatting";
import { SpreadsheetVisualizerBase, ToDraw, MouseState } from "./SpreadsheetVisualizerBase";
import {
  DEFAULT_IMAGE_SMOOTHING_ENABLED,
  DEFAULT_IMAGE_SMOOTHING_QUALITY,
  DEFAULT_LETTER_SPACING,
  DEFAULT_TEXT_RENDERING,
} from "./defaults";
import { minMax } from "./utils/drawing";

export class SpreadsheetVisualizerSelection extends SpreadsheetVisualizerBase {
  // State variables for selection and hovering
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

  // Stats panel
  protected statsPanelWidth = 350; // Width of the stats panel
  protected hasStatsPanel = false;
  protected statsVisualizer: ColumnStatsVisualizer;

  // Selection change callback
  private onSelectionChange: ((selection?: ICellSelection) => void)[] = [];

  constructor(
    container: HTMLElement,
    dataProvider: DataProvider,
    options: Partial<SpreadsheetOptions> = {},
    statsVisualizer: ColumnStatsVisualizer,
  ) {
    super(container, dataProvider, options);
    this.statsVisualizer = statsVisualizer;
  }

  protected async updateLayout() {
    // Always use container dimensions for responsive behavior, but respect min/max constraints
    let width = Math.floor(minMax(this.container.clientWidth, this.options.minWidth, this.options.maxWidth));
    let height = Math.floor(minMax(this.container.clientHeight, this.options.minHeight, this.options.maxHeight));

    // Fallback to options dimensions if container has no size (e.g., during initialization)
    if (width <= 0 && this.options.width !== undefined) {
      width = Math.floor(minMax(this.options.width, this.options.minWidth, this.options.maxWidth));
    }
    if (height <= 0 && this.options.height !== undefined) {
      height = Math.floor(minMax(this.options.height, this.options.minHeight, this.options.maxHeight));
    }

    // Ensure we have valid dimensions
    if (width <= 0) width = this.options.minWidth;
    if (height <= 0) height = this.options.minHeight;

    // Stats panel logic is handled by derived classes

    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.selectionCanvas.width = width;
    this.selectionCanvas.height = height;
    this.selectionCanvas.style.width = `${width}px`;
    this.selectionCanvas.style.height = `${height}px`;
    this.selectionCanvas.style.top = `${this.canvas.offsetTop}px`;
    this.selectionCanvas.style.left = `${this.canvas.offsetLeft}px`;

    this.hoverCanvas.width = width;
    this.hoverCanvas.height = height;
    this.hoverCanvas.style.width = `${width}px`;
    this.hoverCanvas.style.height = `${height}px`;
    this.hoverCanvas.style.top = `${this.canvas.offsetTop}px`;
    this.hoverCanvas.style.left = `${this.canvas.offsetLeft}px`;

    // Recalculate column widths and redraw.
    // Setting canvas.width/height above clears all pixel content, so we must
    // force a full cell redraw regardless of the current toDraw state.
    this.calculateColumnWidths();
    this.calculateRowHeight();
    this.updateToDraw(ToDraw.Cells);

    await this.draw();
  }

  public async getSelectedFormattedValues(): Promise<{ headers: string[]; indices: number[]; data: string[][] }> {
    if (!this.selectedCells) return { headers: [], indices: [], data: [] };

    const { startRow, endRow, startCol, endCol } = this.selectedCells;

    // Try to get data from cache first
    const data = await this.cache.getData(startRow - 1, endRow - 1);

    const formattedData = data.map((row) =>
      row.map((cell, col) => getFormattedValueAndStyle(cell, this.columns[col + startCol], this.options).formatted),
    );

    // Get column headers for the selected range
    const headers = [];
    for (let col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col++) {
      headers.push(this.columns[col].name);
    }

    // Get row indices for the selected range
    const rowIndices = [];
    for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row++) {
      rowIndices.push(row);
    }

    return { headers, indices: rowIndices, data: formattedData };
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

    // Cascading draw: higher-priority operations include all lower-priority ones.
    // Cells (5) → Selection (4) → CellHover (1). ColHover is independent.
    if (this.toDraw === ToDraw.ColHover) {
      this.drawColHover();
    } else {
      if (this.toDraw >= ToDraw.Cells) {
        await this.drawCells(visibleStartRow, visibleEndRow);
        this.drawScrollbars();
      }
      if (this.toDraw >= ToDraw.Selection) {
        this.drawSelection(visibleStartRow);
      }
      if (this.toDraw >= ToDraw.CellHover) {
        this.drawCellHover(visibleStartRow);
      }
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

  public async getSelection(): Promise<{ rows: number[]; columns: Column[]; values: any[][]; formatted: string[][] } | null> {
    if (this.selectedCols.length > 0) {
      return {
        rows: [],
        columns: this.selectedCols.map((col) => this.columns[col] as Column),
        values: [],
        formatted: [],
      };
    } else if (this.selectedCells) {
      try {
        const firstVisibleColumnIndex = this.getFirstVisibleColumnIndex();
        const lastVisibleColumnIndex = this.getLastVisibleColumnIndex();

        const data = (await this.cache.getData(this.selectedCells.startRow, this.selectedCells.endRow)).map((row) =>
          row.slice(this.selectedCells?.startCol ?? firstVisibleColumnIndex, this.selectedCells?.endCol ?? lastVisibleColumnIndex + 1),
        );

        const formatted = data.map((row) =>
          row.map((cell, index) => {
            const column = this.columns[index + this.selectedCells!.startCol];
            if (!column) return "";
            return getFormattedValueAndStyle(cell, column, this.options).formatted;
          }),
        );

        const rows = Array.from(
          { length: this.selectedCells.endRow - this.selectedCells.startRow + 1 },
          (_, i) => this.selectedCells!.startRow + i,
        );
        const columns = this.columns.filter(
          (_, index) => this.selectedCells!.startCol <= index && index <= this.selectedCells!.endCol,
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

  // Public methods for external access to selection state
  public getHoveredCell(): { row: number; col: number } | null {
    return this.hoveredCell;
  }

  public getSelectedCells(): { startRow: number; endRow: number; startCol: number; endCol: number } | null {
    return this.selectedCells;
  }

  public getMouseState(): MouseState {
    return this.mouseState;
  }

  public getSelectedRows(): number[] {
    return this.selectedRows;
  }

  public getSelectedCols(): number[] {
    return this.selectedCols;
  }

  public setHoveredCell(cell: { row: number; col: number } | null): void {
    this.hoveredCell = cell;
  }

  public setSelectedCells(cells: { startRow: number; endRow: number; startCol: number; endCol: number } | null): void {
    this.selectedCells = cells;
  }

  public setMouseState(state: MouseState): void {
    this.mouseState = state;
  }

  public setSelectedRows(rows: number[]): void {
    this.selectedRows = rows;
  }

  public setSelectedCols(cols: number[]): void {
    this.selectedCols = cols;
  }

  public addOnSelectionChangeSubscription(callback: (selection?: ICellSelection) => void): void {
    this.onSelectionChange.push(callback);
  }

  public removeOnSelectionChangeSubscription(callback: (selection?: ICellSelection) => void): void {
    this.onSelectionChange = this.onSelectionChange.filter((cb) => cb !== callback);
  }

  public getSelectedColumns(): Column[] {
    return this.selectedCols.map((colIndex) => this.columns[colIndex] as Column).filter((col) => col !== undefined);
  }
}
