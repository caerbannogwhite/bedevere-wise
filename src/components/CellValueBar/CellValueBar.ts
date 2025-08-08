import { Column } from "../../data/types";
import { ICellSelection } from "../SpreadsheetVisualizer/types";

export interface CellValueBarOptions {
  container: HTMLElement;
}

export interface CellInfo {
  value: any;
  column: Column;
  position: { row: number; col: number };
}

export class CellValueBar {
  private container: HTMLElement;
  private element: HTMLDivElement;
  private positionElement!: HTMLSpanElement;
  private valueElement!: HTMLSpanElement;

  constructor(options: CellValueBarOptions) {
    this.container = options.container;
    this.element = document.createElement("div");
    this.element.className = "cell-value-bar";
    this.setupHTML();
    this.container.appendChild(this.element);
  }

  private setupHTML(): void {
    this.element.innerHTML = `
      <span class="cell-value-bar__position"></span>
      <span class="cell-value-bar__value"></span>
    `;

    this.positionElement = this.element.querySelector(".cell-value-bar__position") as HTMLSpanElement;
    this.valueElement = this.element.querySelector(".cell-value-bar__value") as HTMLSpanElement;
  }

  public updateCell(selection?: ICellSelection): void {
    if (!selection) {
      this.positionElement.textContent = "";
      this.valueElement.textContent = "";
      this.valueElement.className = "cell-value-bar__value";
      return;
    }

    if (selection.columns.length > 0 && selection.rows.length === 0) {
      this.positionElement.textContent = "";
      this.valueElement.textContent = "";
      this.valueElement.className = "cell-value-bar__value cell-value-bar__value--column";
      return;
    }

    if (selection.rows.length === 1 && selection.columns.length === 1) {
      this.positionElement.innerHTML = this.formatPosition(selection.rows[0], selection.columns[0].name);
    } else if (selection.columns.length > 0 && selection.rows.length > 0) {
      const position = `${this.formatPosition(
        selection.rows[0],
        selection.columns[0].name
      )}<span class="cell-value-bar__position-separator">:</span>${this.formatPosition(
        selection.rows[selection.rows.length - 1],
        selection.columns[selection.columns.length - 1].name
      )}`;
      this.positionElement.innerHTML = position;
    }

    this.valueElement.innerHTML = this.formatValueDisplay(selection.values[0][0], selection.formatted[0][0]);
    this.valueElement.className = `cell-value-bar__value cell-value-bar__value--${selection.columns[0].dataType}`;
  }

  private formatPosition(row: number, columnName: string): string {
    return `<span class="cell-value-bar__position-column">${columnName}</span><span class="cell-value-bar__position-row">${row}</span>`;
  }

  private formatValueDisplay(raw: any, formatted: string): string {
    // If formatted and raw are the same, just show formatted
    if (formatted === raw) {
      return formatted;
    }

    // Show formatted value followed by raw value in brackets with dimmed styling
    return `${formatted} <span class="cell-value-bar__raw-value">[${raw}]</span>`;
  }

  public destroy(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
