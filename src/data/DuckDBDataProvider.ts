import { DuckDBService } from "./DuckDBService";
import { DataProvider, DatasetMetadata } from "./types";

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

  public async fetchData(startRow: number, endRow: number, startCol: number, endCol: number): Promise<any[][]> {
    console.log("fetching data", startRow, endRow, startCol, endCol);
    const query = `SELECT * FROM ${this.name} LIMIT ${endRow - startRow} OFFSET ${startRow}`;
    return (await this.duckDBService.executeQuery(query)).map((row: any) => row.toArray());
  }
}
