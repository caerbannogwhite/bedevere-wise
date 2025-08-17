export type DataType = "BIGINT" | "BOOLEAN" | "DATE" | "TIMESTAMP" | "VARCHAR" | "DOUBLE" | "INTEGER" | "FLOAT";

export interface Column {
  name: string;
  key: string | null;
  extra: string | null;
  default: string | null;
  label?: string;
  dataType: DataType;
  length?: number;
  hasNulls?: boolean;
  format?: string | Intl.NumberFormatOptions;
}

export interface ColumnStats {
  isCategorical: boolean;
  totalCount: number;
  nullCount: number;
  valueCounts: Map<string, number>;
  numericStats: ColumnStatsNumeric | null;
}

export interface ColumnStatsNumeric {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
}

export interface DatasetMetadata {
  name: string;
  fileName?: string;
  description?: string;
  label?: string;
  totalRows: number;
  totalColumns: number;
  columns: Column[];
}

export interface DataProvider {
  getMetadata(): Promise<DatasetMetadata>;
  fetchData(startRow: number, endRow: number): Promise<any[][]>;
  fetchDataColumnRange(startRow: number, endRow: number, startCol: number, endCol: number): Promise<any[][]>;
  getColumnStats(column: string | Column): Promise<ColumnStats | null>;

  setName(name: string): void;
  setDescription(description: string): void;
  setLabel(label: string): void;
}
