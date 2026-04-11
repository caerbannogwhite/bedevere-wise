import {
  DataType,
  isBooleanType,
  isDateType,
  isNumericType,
  isStringType,
  isTemporalType,
  isTimeType,
  isTimestampType,
} from "./types";

export type FilterType = "include" | "exclude" | "range";

export interface ColumnFilter {
  columnName: string;
  /** The column's data type — needed for proper SQL quoting/casting. */
  dataType?: DataType;
  filterType: FilterType;
  /** For include/exclude filters. Values are stored as their display string representation. */
  values?: string[];
  /** For range filters on numeric columns. */
  min?: number;
  max?: number;
  /** For range filters on temporal columns: ISO strings (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS or HH:MM:SS). */
  minStr?: string;
  maxStr?: string;
}

export interface SortConfig {
  columnName: string;
  direction: "asc" | "desc";
}

export class ColumnFilterManager {
  private filters: Map<string, ColumnFilter[]> = new Map(); // dataset name -> filters
  private sorts: Map<string, SortConfig[]> = new Map(); // dataset name -> sorts
  private onChangeCallbacks: Array<(datasetName: string) => void> = [];

  public setFilter(datasetName: string, filter: ColumnFilter): void {
    const filters = this.filters.get(datasetName) || [];

    // Replace existing filter on the same column, or add new
    const existingIndex = filters.findIndex((f) => f.columnName === filter.columnName);
    if (existingIndex >= 0) {
      filters[existingIndex] = filter;
    } else {
      filters.push(filter);
    }

    this.filters.set(datasetName, filters);
    this.notifyChange(datasetName);
  }

  public removeFilter(datasetName: string, columnName: string): void {
    const filters = this.filters.get(datasetName);
    if (!filters) return;

    const newFilters = filters.filter((f) => f.columnName !== columnName);
    if (newFilters.length === 0) {
      this.filters.delete(datasetName);
    } else {
      this.filters.set(datasetName, newFilters);
    }

    this.notifyChange(datasetName);
  }

  public clearFilters(datasetName: string): void {
    this.filters.delete(datasetName);
    this.notifyChange(datasetName);
  }

  public getFilters(datasetName: string): ColumnFilter[] {
    return this.filters.get(datasetName) || [];
  }

  public hasFilters(datasetName: string): boolean {
    const filters = this.filters.get(datasetName);
    return !!filters && filters.length > 0;
  }

  public isColumnFiltered(datasetName: string, columnName: string): boolean {
    const filters = this.filters.get(datasetName);
    return !!filters && filters.some((f) => f.columnName === columnName);
  }

  public setSort(datasetName: string, sort: SortConfig): void {
    // Replace all sorts with a single sort (for now, single-column sort)
    this.sorts.set(datasetName, [sort]);
    this.notifyChange(datasetName);
  }

  public removeSort(datasetName: string, columnName: string): void {
    const sorts = this.sorts.get(datasetName);
    if (!sorts) return;

    const newSorts = sorts.filter((s) => s.columnName !== columnName);
    if (newSorts.length === 0) {
      this.sorts.delete(datasetName);
    } else {
      this.sorts.set(datasetName, newSorts);
    }

    this.notifyChange(datasetName);
  }

  public clearSorts(datasetName: string): void {
    this.sorts.delete(datasetName);
    this.notifyChange(datasetName);
  }

  public getSorts(datasetName: string): SortConfig[] {
    return this.sorts.get(datasetName) || [];
  }

  public isColumnSorted(datasetName: string, columnName: string): "asc" | "desc" | null {
    const sorts = this.sorts.get(datasetName);
    if (!sorts) return null;
    const sort = sorts.find((s) => s.columnName === columnName);
    return sort ? sort.direction : null;
  }

  public buildWhereClause(datasetName: string): string {
    const filters = this.filters.get(datasetName);
    if (!filters || filters.length === 0) return "";

    const conditions = filters
      .map((filter) => buildConditionForFilter(filter))
      .filter((c) => c.length > 0);

    return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  }

  public buildOrderByClause(datasetName: string): string {
    const sorts = this.sorts.get(datasetName);
    if (!sorts || sorts.length === 0) return "";

    const orderParts = sorts.map((sort) => `"${sort.columnName}" ${sort.direction.toUpperCase()}`);
    return `ORDER BY ${orderParts.join(", ")}`;
  }

  public buildFilteredQuery(tableName: string, datasetName: string): string {
    const where = this.buildWhereClause(datasetName);
    const orderBy = this.buildOrderByClause(datasetName);
    return `SELECT * FROM "${tableName}" ${where} ${orderBy}`.trim();
  }

  public hasAnyFiltersOrSorts(datasetName: string): boolean {
    return this.hasFilters(datasetName) || (this.sorts.get(datasetName)?.length ?? 0) > 0;
  }

  public onChange(callback: (datasetName: string) => void): void {
    this.onChangeCallbacks.push(callback);
  }

  public removeOnChange(callback: (datasetName: string) => void): void {
    this.onChangeCallbacks = this.onChangeCallbacks.filter((cb) => cb !== callback);
  }

  private notifyChange(datasetName: string): void {
    for (const cb of this.onChangeCallbacks) {
      cb(datasetName);
    }
  }
}

// ---------- SQL generation helpers ----------

function sqlLiteralForValue(value: string, dataType?: DataType): string {
  if (!dataType) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (isBooleanType(dataType)) {
    const v = value.toUpperCase();
    if (v === "TRUE" || v === "1" || v === "T") return "TRUE";
    if (v === "FALSE" || v === "0" || v === "F") return "FALSE";
    return "NULL";
  }
  if (isNumericType(dataType)) {
    // Emit as-is (numeric); fall back to quoted string if not parseable
    if (value.trim() === "") return "NULL";
    const n = Number(value);
    if (isFinite(n)) return String(n);
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (isDateType(dataType)) {
    return `DATE '${value.replace(/'/g, "''")}'`;
  }
  if (isTimeType(dataType)) {
    return `TIME '${value.replace(/'/g, "''")}'`;
  }
  if (isTimestampType(dataType)) {
    return `TIMESTAMP '${value.replace(/'/g, "''")}'`;
  }
  if (isStringType(dataType)) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlBoundForRange(value: number | string | undefined, dataType?: DataType): string | null {
  if (value === undefined || value === null || value === "") return null;

  if (dataType && isTemporalType(dataType)) {
    const str = String(value);
    if (isDateType(dataType)) return `DATE '${str}'`;
    if (isTimeType(dataType)) return `TIME '${str}'`;
    if (isTimestampType(dataType)) return `TIMESTAMP '${str.replace("T", " ")}'`;
  }
  if (typeof value === "number") {
    return isFinite(value) ? String(value) : null;
  }
  const n = Number(value);
  return isFinite(n) ? String(n) : null;
}

function buildConditionForFilter(filter: ColumnFilter): string {
  const col = `"${filter.columnName}"`;
  const dt = filter.dataType;

  switch (filter.filterType) {
    case "include": {
      if (!filter.values || filter.values.length === 0) return "";
      const literals = filter.values.map((v) => sqlLiteralForValue(v, dt)).join(", ");
      return `${col} IN (${literals})`;
    }
    case "exclude": {
      if (!filter.values || filter.values.length === 0) return "";
      const literals = filter.values.map((v) => sqlLiteralForValue(v, dt)).join(", ");
      return `${col} NOT IN (${literals})`;
    }
    case "range": {
      const parts: string[] = [];
      // Temporal range uses minStr/maxStr; numeric uses min/max.
      const minLit = dt && isTemporalType(dt)
        ? sqlBoundForRange(filter.minStr, dt)
        : sqlBoundForRange(filter.min, dt);
      const maxLit = dt && isTemporalType(dt)
        ? sqlBoundForRange(filter.maxStr, dt)
        : sqlBoundForRange(filter.max, dt);
      if (minLit !== null) parts.push(`${col} >= ${minLit}`);
      if (maxLit !== null) parts.push(`${col} <= ${maxLit}`);
      return parts.length > 0 ? parts.join(" AND ") : "";
    }
    default:
      return "";
  }
}
