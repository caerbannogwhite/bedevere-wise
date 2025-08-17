import { DuckDBService } from "./DuckDBService";
import { Column, ColumnStats, DataProvider, DatasetMetadata } from "./types";

export class DuckDBDataProvider implements DataProvider {
  private name: string = "";
  private fileName: string = "";
  private description: string = "";
  private label: string = "";

  constructor(private duckDBService: DuckDBService, name: string, fileName: string) {
    this.name = name;
    this.fileName = fileName;
  }

  public setName(name: string): void {
    this.duckDBService.executeQuery(`ALTER TABLE ${this.name} RENAME TO ${name}`).then(() => {
      this.name = name;
    });
  }

  public setDescription(description: string): void {
    this.description = description;
  }

  public setLabel(label: string): void {
    this.label = label;
  }

  public async getMetadata(): Promise<DatasetMetadata> {
    const totalRows = (await this.duckDBService.executeQuery(`SELECT COUNT(*) FROM ${this.name}`))[0].toArray()[0] as BigInt;
    const columns = await this.duckDBService.getTableInfo(this.name);

    return {
      name: this.name,
      fileName: this.fileName,
      description: this.description,
      label: this.label,
      totalRows: Number(totalRows),
      totalColumns: columns.length,
      columns: columns.map((column: any) => ({
        name: column.column_name,
        key: column.key,
        extra: column.extra,
        default: column.default,
        dataType: column.column_type,
        hasNulls: column.nulls === "YES",
      })),
    };
  }

  public async fetchData(startRow: number, endRow: number): Promise<any[][]> {
    const query = `SELECT * FROM ${this.name} LIMIT ${endRow - startRow} OFFSET ${startRow}`;
    return (await this.duckDBService.executeQuery(query)).map((row: any) => row.toArray());
  }

  public async fetchDataColumnRange(startRow: number, endRow: number, startCol: number, endCol: number): Promise<any[][]> {
    const columns = await this.duckDBService.getTableInfo(this.name);
    const columnNames = columns.map((column: any) => column.column_name).slice(startCol, endCol);
    const columnNamesString = columnNames.join(", ");

    const query = `SELECT ${columnNamesString} FROM ${this.name} LIMIT ${endRow - startRow} OFFSET ${startRow}`;
    return (await this.duckDBService.executeQuery(query)).map((row: any) => row.toArray());
  }

  private generateHistogram(values: number[], min: number, max: number, binCount: number = 20): Map<string, number> {
    if (values.length === 0 || min === max) {
      return new Map();
    }

    const binWidth = (max - min) / binCount;
    const histogram = new Map<string, number>();

    // Initialize bins
    for (let i = 0; i < binCount; i++) {
      const binStart = min + i * binWidth;
      const binEnd = min + (i + 1) * binWidth;
      const binLabel =
        i === binCount - 1 ? `[${binStart.toFixed(2)}, ${binEnd.toFixed(2)}]` : `[${binStart.toFixed(2)}, ${binEnd.toFixed(2)})`;
      histogram.set(binLabel, 0);
    }

    // Count values in each bin
    for (const value of values) {
      if (value < min || value > max) continue;

      let binIndex = Math.floor((value - min) / binWidth);
      if (binIndex >= binCount) binIndex = binCount - 1; // Handle edge case

      const binStart = min + binIndex * binWidth;
      const binEnd = min + (binIndex + 1) * binWidth;
      const binLabel =
        binIndex === binCount - 1 ? `[${binStart.toFixed(2)}, ${binEnd.toFixed(2)}]` : `[${binStart.toFixed(2)}, ${binEnd.toFixed(2)})`;

      histogram.set(binLabel, (histogram.get(binLabel) || 0) + 1);
    }

    return histogram;
  }

  public async getColumnStats(
    column: string | Column,
    valueCountsLimit: number = 10,
    histogramBinCount: number = 20
  ): Promise<ColumnStats | null> {
    const columnName = typeof column === "string" ? column : column.name;

    // Get column data type
    let dataType = typeof column === "string" ? null : column.dataType;
    if (!dataType) {
      const columnInfo = await this.duckDBService.getColumnInfo(this.name, columnName);
      dataType = columnInfo?.data_type;
    }

    try {
      // Get basic column statistics
      const basicStatsQuery = `
        SELECT 
          COUNT(*) as total_count,
          COUNT(CASE WHEN ${columnName} IS NULL THEN 1 END) as null_count,
          COUNT(DISTINCT ${columnName}) as distinct_count
        FROM ${this.name}
      `;

      const basicStats = (await this.duckDBService.executeQuery(basicStatsQuery))[0];
      const totalCount = Number(basicStats.total_count);
      const nullCount = Number(basicStats.null_count);

      // Check if column is numeric
      const isNumeric = dataType && ["BIGINT", "DOUBLE", "INTEGER", "FLOAT"].includes(dataType);

      if (!isNumeric) {
        // Get value counts for categorical data (limit to top 100 to avoid memory issues)
        const valueCountsQuery = `
        SELECT ${columnName}, COUNT(*) as count
        FROM ${this.name}
        WHERE ${columnName} IS NOT NULL
        GROUP BY ${columnName}
        ORDER BY count DESC
        LIMIT ${valueCountsLimit}
        `;

        const valueCountsResult = await this.duckDBService.executeQuery(valueCountsQuery);
        const valueCounts = new Map<string, number>();

        for (const row of valueCountsResult) {
          const value = String(row[columnName]);
          const count = Number(row.count);
          valueCounts.set(value, count);
        }

        return {
          totalCount,
          nullCount,
          valueCounts,
          isCategorical: true,
          numericStats: null,
        };
      } else {
        // Get numeric statistics
        const numericStatsQuery = `
          SELECT 
            MIN(${columnName}) as min_val,
            MAX(${columnName}) as max_val,
            AVG(${columnName}) as mean_val,
            STDDEV(${columnName}) as stddev_val
          FROM ${this.name}
          WHERE ${columnName} IS NOT NULL
        `;

        const numericStats = (await this.duckDBService.executeQuery(numericStatsQuery))[0];

        // Calculate median (DuckDB doesn't have built-in median, so we'll approximate)
        const medianQuery = `
          SELECT ${columnName}
          FROM ${this.name}
          WHERE ${columnName} IS NOT NULL
          ORDER BY ${columnName}
          LIMIT 1 OFFSET ${Math.floor((totalCount - nullCount) / 2)}
        `;

        const medianResult = await this.duckDBService.executeQuery(medianQuery);
        const median = medianResult.length > 0 ? Number(medianResult[0][columnName]) : 0;

        const valuesQuery = `
          SELECT ${columnName}
          FROM ${this.name}
          WHERE ${columnName} IS NOT NULL
        `;
        const valuesResult = await this.duckDBService.executeQuery(valuesQuery);
        const values = valuesResult.map((row: any) => Number(row[columnName]));

        const min = Number(numericStats.min_val) || 0;
        const max = Number(numericStats.max_val) || 0;

        // Generate histogram with 20 bins (configurable)
        const histogram = this.generateHistogram(values, min, max, histogramBinCount);

        return {
          totalCount,
          nullCount,
          isCategorical: false,
          valueCounts: histogram,
          numericStats: {
            min,
            max,
            mean: Number(numericStats.mean_val) || 0,
            median,
            stdDev: Number(numericStats.stddev_val) || 0,
          },
        };
      }
    } catch (error) {
      console.error(`Error getting column stats for ${columnName}:`, error);
      return null;
    }
  }
}
