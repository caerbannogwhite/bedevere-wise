import { Column, DataType } from "../../data/types";
import { SpreadsheetOptions } from "./types";
import { getFormatOptions } from "./utils/formatting";

export interface SelectionState {
  isSelecting: boolean;
  start: CellPosition | null;
  end: CellPosition | null;
  color: string;
  borderColor: string;
}

export interface HoverState {
  cell: CellPosition | null;
  color: string;
  borderColor: string;
}

export interface ScrollbarState {
  isHoveringVertical: boolean;
  isHoveringHorizontal: boolean;
  isDraggingVertical: boolean;
  isDraggingHorizontal: boolean;
  lastMouseY: number;
  lastMouseX: number;
}

export interface ScrollState {
  scrollY: number;
  scrollX: number;
  totalRows: number;
  totalColumns: number;
  visibleRows: number;
  visibleColumns: number;
  rowBuffer: number;
  dataCache: Map<number, any[]>;
  isFetching: boolean;
  lastFetchStart: number;
  lastFetchEnd: number;
}

export interface CellPosition {
  row: number;
  col: number;
}

export interface CellStyle {
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: "left" | "center" | "right";
  padding?: number;
  numericColor?: string;
  dateColor?: string;
  nullColor?: string;
}

export class ColumnInternal implements Column {
  name: string;
  key: string | null;
  extra: string | null;
  default: string | null;
  label?: string;
  dataType: DataType;
  length?: number;
  format?: string | Intl.NumberFormatOptions;
  widthPx: number = 0;
  guessedFormat: any = undefined;

  constructor(column: Column, options: SpreadsheetOptions) {
    this.name = column.name;
    this.key = column.key;
    this.extra = column.extra;
    this.default = column.default;
    this.dataType = column.dataType;
    this.label = column.label;
    this.length = column.length;
    this.format = column.format;
    this.widthPx = 0;
    this.guessedFormat = getFormatOptions(this, options);
  }
}
