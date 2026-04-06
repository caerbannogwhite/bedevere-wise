import { DataProvider, SpreadsheetOptions } from "@/index";
import { FocusableComponent } from "../BrianApp/types";
import { minMax } from "./utils/drawing";
import { MouseState, ToDraw } from "./SpreadsheetVisualizerBase";
import { ColumnStatsVisualizer } from "../ColumnStatsVisualizer/ColumnStatsVisualizer";
import { SpreadsheetVisualizerSelection } from "./SpreadsheetVisualizerSelection";

export class SpreadsheetVisualizerFocusable extends SpreadsheetVisualizerSelection implements FocusableComponent {
  private _isFocused: boolean = false;

  public readonly componentId: string;
  public readonly canReceiveFocus: boolean = true;
  public readonly focusableElement: HTMLElement;

  constructor(
    parent: HTMLElement,
    dataProvider: DataProvider,
    options: SpreadsheetOptions = {},
    columnStatsVisualizer: ColumnStatsVisualizer,
    componentId?: string,
  ) {
    super(parent, dataProvider, options, columnStatsVisualizer);
    this.componentId = componentId ?? "spreadsheet-visualizer";
    this.focusableElement = this.getContainer();
  }

  // FocusableComponent interface methods
  public focus(): void {
    this._isFocused = true;
    this.focusableElement.focus();
  }

  public blur(): void {
    this._isFocused = false;
    this.focusableElement.blur();
  }

  public isFocused(): boolean {
    return this._isFocused;
  }

  // Event handler methods that delegate to SpreadsheetVisualizer
  public async handleMouseDown(event: MouseEvent): Promise<boolean> {
    if (!this._isFocused) return false;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Vertical Scrolling
    if (this.isMouseOverVerticalScrollbar(x, y)) {
      this.mouseState = MouseState.DraggingVerticalScrollbar;
      this.dragStartY = y;
      this.lastScrollY = this.scrollY;

      return true;
    }

    // Horizontal Scrolling
    else if (this.isMouseOverHorizontalScrollbar(x, y)) {
      this.mouseState = MouseState.DraggingHorizontalScrollbar;
      this.dragStartX = x;
      this.lastScrollX = this.scrollX;

      return true;
    }

    // Column Header
    if (this.isMouseOverColumnHeader(x, y)) {
      const cell = this.getCellAtPosition(x, y);
      if (!cell) return false;
      const { col } = cell;

      await this.selectColumn(col);
    }

    // Handle cell selection
    else {
      // Right click is handled by the context menu
      if (event.button === 2) {
        return false;
      }

      const cell = this.getCellAtPosition(x, y);
      if (cell) {
        if (this.selectedCols.length > 0) {
          this.selectedCols = [];
          this.selectedRows = [];
          this.selectedCells = null;

          if (this.statsVisualizer) {
            this.statsVisualizer.hide();
            this.hasStatsPanel = false;
          }
        }

        this.mouseState = MouseState.Dragging;

        this.selectedCols = [];
        this.selectedRows = [];
        this.selectedCells = {
          startRow: cell.row,
          endRow: cell.row,
          startCol: cell.col,
          endCol: cell.col,
        };

        this.updateToDraw(ToDraw.Selection);
        this.notifySelectionChange();
      }
    }

    await this.draw();
    return true;
  }

  public async handleMouseMove(event: MouseEvent): Promise<boolean> {
    if (!this._isFocused) return false;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let newHoverCell: { row: number; col: number } | null = null;

    switch (this.mouseState) {
      case MouseState.DraggingVerticalScrollbar:
        const deltaY = y - this.dragStartY;
        const scrollRatioY = deltaY / (this.canvas.height - this.options.scrollbarWidth);
        this.scrollY = minMax(this.lastScrollY + scrollRatioY * this.totalScrollY, 0, this.totalScrollY);
        this.updateToDraw(ToDraw.Cells);
        break;

      case MouseState.DraggingHorizontalScrollbar:
        const deltaX = x - this.dragStartX;
        const scrollRatioX = deltaX / (this.canvas.width - this.options.scrollbarWidth);
        this.scrollX = minMax(this.lastScrollX + scrollRatioX * this.totalScrollX, 0, this.totalScrollX);
        this.updateToDraw(ToDraw.Cells);
        break;

      case MouseState.Dragging:
        newHoverCell = this.getCellAtPosition(x, y);

        // Update selection if dragging
        if (newHoverCell && this.selectedCells) {
          const selectionChanged = newHoverCell.row !== this.selectedCells.endRow || newHoverCell.col !== this.selectedCells.endCol;

          if (selectionChanged) {
            this.selectedCells.endRow = newHoverCell.row;
            this.selectedCells.endCol = newHoverCell.col;

            this.updateToDraw(ToDraw.Selection);
            this.notifySelectionChange();
          }
        }
        break;

      // Hovering
      default:
        newHoverCell = this.getCellAtPosition(x, y);
        const hoverChanged = newHoverCell?.row !== this.hoveredCell?.row || newHoverCell?.col !== this.hoveredCell?.col;
        if (hoverChanged) {
          this.hoveredCell = newHoverCell;
          if (this.isMouseOverColumnHeader(x, y)) {
            this.updateToDraw(ToDraw.ColHover);
          } else if (this.isMouseOverRowIndex(x, y)) {
            this.updateToDraw(ToDraw.RowHover);
          } else {
            this.updateToDraw(ToDraw.CellHover);
          }
        }
        break;
    }

    await this.draw();
    return true;
  }

  public async handleMouseUp(_: MouseEvent): Promise<boolean> {
    if (!this._isFocused) return false;

    this.mouseState = MouseState.Idle;
    return true;
  }

  public async handleMouseLeave(_: MouseEvent): Promise<boolean> {
    if (!this._isFocused) return false;

    this.hoveredCell = null;
    this.mouseState = MouseState.Idle;
    this.updateToDraw(ToDraw.CellHover);

    this.draw();
    return true;
  }

  public async handleWheel(event: WheelEvent): Promise<boolean> {
    if (!this._isFocused) return false;

    event.preventDefault();

    // Zoom
    if (event.ctrlKey) {
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;

      this.options.fontSize = Math.max(14, Math.min(24, this.options.fontSize * zoomFactor));
      this.options.cellHeight = Math.max(14, Math.min(24, this.options.cellHeight * zoomFactor));
      this.options.headerFontSize = Math.max(14, Math.min(24, this.options.headerFontSize * zoomFactor));
      this.options.cellPadding = Math.max(1, Math.min(10, this.options.cellPadding * zoomFactor));

      this.calculateColumnWidths();
      this.updateToDraw(ToDraw.Cells);
    }

    // Scroll
    else {
      const prevScrollY = this.scrollY;
      this.scrollY = minMax(this.scrollY + event.deltaY, 0, this.totalScrollY);

      if (prevScrollY !== this.scrollY) {
        // Preload data for the new scroll position
        this.preloadDataForScroll(this.scrollY);

        this.updateToDraw(ToDraw.Cells);
      }
    }

    await this.draw();
    return true;
  }

  public async handleKeyDown(event: KeyboardEvent): Promise<boolean> {
    if (!this._isFocused) return false;

    let handled = true;
    let col: number;

    switch (event.key) {
      case "ArrowUp":
        if (this.selectedCells) {
          const { startRow, endRow, startCol, endCol } = this.selectedCells;
          const row = event.shiftKey ? endRow : startRow;
          const col = event.shiftKey ? endCol : startCol;

          const prevScrollY = this.scrollY;

          this.selectedCells = {
            startRow: event.shiftKey ? startRow : row - 1,
            endRow: event.shiftKey ? row - 1 : row - 1,
            startCol: event.shiftKey ? startCol : col,
            endCol: event.shiftKey ? endCol : col,
          };

          const firstRow = this.selectedCells.startRow == 0;
          this.selectedCells.startRow = Math.max(1, this.selectedCells.startRow);
          this.selectedCells.endRow = Math.max(1, this.selectedCells.endRow);

          const selectionWidth = Math.abs(this.selectedCells.endCol - this.selectedCells.startCol) + 1;
          const selectionHeight = Math.abs(this.selectedCells.endRow - this.selectedCells.startRow) + 1;

          if (selectionWidth == 1 && selectionHeight == 1 && firstRow) {
            this.selectColumn(this.selectedCells.startCol);
          } else {
            this.scrollY = minMax((row - 1) * this.options.cellHeight - this.canvas.height / 2, 0, this.totalScrollY);
            if (prevScrollY !== this.scrollY) {
              this.updateToDraw(ToDraw.Cells);
              this.notifySelectionChange();
            } else {
              this.updateToDraw(ToDraw.Selection);
              this.notifySelectionChange();
            }
          }
        }
        break;

      case "ArrowDown":
        if (this.selectedCols.length > 0) {
          const col = this.selectedCols[0];

          this.selectedCols = [];
          this.selectedRows = [];
          this.selectedCells = {
            startRow: 1,
            endRow: 1,
            startCol: col,
            endCol: col,
          };

          if (this.statsVisualizer) {
            this.statsVisualizer.hide();
            this.hasStatsPanel = false;
          }

          this.updateToDraw(ToDraw.Selection);
          this.notifySelectionChange();
          this.updateLayout();
          break;
        }

        if (this.selectedCells) {
          const { startRow, endRow, startCol, endCol } = this.selectedCells;
          const row = event.shiftKey ? endRow : startRow;
          const col = event.shiftKey ? endCol : startCol;

          const prevScrollY = this.scrollY;

          this.selectedCells = {
            startRow: event.shiftKey ? startRow : row + 1,
            endRow: event.shiftKey ? row + 1 : row + 1,
            startCol: event.shiftKey ? startCol : col,
            endCol: event.shiftKey ? endCol : col,
          };

          this.selectedCells.startRow = Math.min(this.totalRows, this.selectedCells.startRow);
          this.selectedCells.endRow = Math.min(this.totalRows, this.selectedCells.endRow);

          this.scrollY = minMax((row + 1) * this.options.cellHeight - this.canvas.height / 2, 0, this.totalScrollY);
          if (prevScrollY !== this.scrollY) {
            this.preloadDataForScroll(this.scrollY);
            this.updateToDraw(ToDraw.Cells);
            this.notifySelectionChange();
          } else {
            this.updateToDraw(ToDraw.Selection);
            this.notifySelectionChange();
          }
        }
        break;

      case "ArrowLeft":
        col = -1;
        if (this.selectedCols.length > 0) {
          col = Math.max(0, this.selectedCols[0] - 1);
          this.selectedCols = [col];
          this.selectedRows = [];
          this.selectedCells = null;

          if (this.statsVisualizer) {
            await this.statsVisualizer.showStats(this.columns[col]);
            this.hasStatsPanel = true;
          }
        }

        if (this.selectedCells) {
          const { startRow, endRow, startCol, endCol } = this.selectedCells;
          const row = event.shiftKey ? endRow : startRow;
          col = event.shiftKey ? endCol : startCol;

          this.selectedCells = {
            startRow: event.shiftKey ? startRow : row,
            endRow: event.shiftKey ? endRow : row,
            startCol: event.shiftKey ? startCol : col - 1,
            endCol: event.shiftKey ? col - 1 : col - 1,
          };

          this.selectedCells.startCol = Math.max(0, this.selectedCells.startCol);
          this.selectedCells.endCol = Math.max(0, this.selectedCells.endCol);
        }

        if (col !== -1) {
          const prevScrollX = this.scrollX;
          this.scrollX = minMax(this.colOffsets[col] - this.canvas.width / 2, 0, this.totalScrollX);
          if (prevScrollX !== this.scrollX) {
            this.updateToDraw(ToDraw.Cells);
            this.notifySelectionChange();
          } else {
            this.updateToDraw(ToDraw.Selection);
            this.notifySelectionChange();
          }
        }
        break;

      case "ArrowRight":
        col = -1;
        if (this.selectedCols.length > 0) {
          col = Math.min(this.totalCols - 1, this.selectedCols[0] + 1);
          this.selectedCols = [col];
          this.selectedRows = [];
          this.selectedCells = null;

          if (this.statsVisualizer) {
            await this.statsVisualizer.showStats(this.columns[col]);
            this.hasStatsPanel = true;
          }
        }

        if (this.selectedCells) {
          const { startRow, endRow, startCol, endCol } = this.selectedCells;
          const row = event.shiftKey ? endRow : startRow;
          col = event.shiftKey ? endCol : startCol;

          this.selectedCells = {
            startRow: event.shiftKey ? startRow : row,
            endRow: event.shiftKey ? endRow : row,
            startCol: event.shiftKey ? startCol : col + 1,
            endCol: event.shiftKey ? col + 1 : col + 1,
          };

          this.selectedCells.startCol = Math.min(this.totalCols - 1, this.selectedCells.startCol);
          this.selectedCells.endCol = Math.min(this.totalCols - 1, this.selectedCells.endCol);
        }

        if (col !== -1) {
          const prevScrollX = this.scrollX;
          this.scrollX = minMax(this.colOffsets[col] - this.canvas.width / 2, 0, this.totalScrollX);
          if (prevScrollX !== this.scrollX) {
            this.updateToDraw(ToDraw.Cells);
            this.notifySelectionChange();
          } else {
            this.updateToDraw(ToDraw.Selection);
            this.notifySelectionChange();
          }
        }
        break;

      case "Enter":
        if (this.selectedCells == null && this.selectedCols.length === 0 && this.selectedRows.length === 0) {
          this.selectedCells = {
            startRow: 1,
            endRow: 1,
            startCol: 0,
            endCol: 0,
          };
          this.updateToDraw(ToDraw.Selection);
          this.notifySelectionChange();
        }
        break;

      // Copy
      case "c":
      case "C":
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const selected = await this.getSelectedFormattedValues();
          if (selected.data.length > 0) {
            const headerLine = selected.headers.join("\t");
            const dataLines = selected.data.map((row) => row.join("\t")).join("\n");
            const tsvText = headerLine + "\n" + dataLines;
            navigator.clipboard.writeText(tsvText).catch(console.error);
          }
        }
        break;

      // Cancel selection
      case "Escape":
        this.selectedCells = null;
        this.updateToDraw(ToDraw.Selection);
        this.notifySelectionChange();
        break;

      default:
        handled = false;
        break;
    }

    await this.draw();
    return handled;
  }

  public async handleResize(): Promise<boolean> {
    await this.updateLayout();
    this.updateToDraw(ToDraw.Cells);
    await this.draw();
    return true;
  }

  // Public method to trigger resize from external components
  public async resize(): Promise<void> {
    await this.handleResize();
  }
}
