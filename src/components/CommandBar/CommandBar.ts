import { Column } from "../../data/types";
import { ICellSelection } from "../SpreadsheetVisualizer/types";

export interface CommandBarOptions {
  container: HTMLElement;
}

export interface CellInfo {
  value: any;
  column: Column;
  position: { row: number; col: number };
}

export class CommandBar {
  private container: HTMLElement;
  private element: HTMLDivElement;
  private toggleButton!: HTMLButtonElement;
  private onToggleSqlEditorCallback?: () => void;
  private sqlEditorExpanded: boolean = false;

  constructor(options: CommandBarOptions) {
    this.container = options.container;
    this.element = document.createElement("div");
    this.element.className = "command-bar";
    this.setupHTML();
    this.container.appendChild(this.element);
  }

  private setupHTML(): void {
    // SQL editor toggle button
    this.toggleButton = document.createElement("button");
    this.toggleButton.className = "command-bar__sql-toggle";
    this.toggleButton.title = "Toggle SQL Editor (Ctrl+E)";
    this.toggleButton.textContent = "SQL";
    this.toggleButton.addEventListener("click", () => {
      this.sqlEditorExpanded = !this.sqlEditorExpanded;
      this.toggleButton.classList.toggle("command-bar__sql-toggle--active", this.sqlEditorExpanded);
      this.onToggleSqlEditorCallback?.();
    });
    this.element.appendChild(this.toggleButton);
  }

  public updateCell(_selection?: ICellSelection): void {
    // Cell value display moved to status bar
  }

  public setOnToggleSqlEditorCallback(callback: () => void): void {
    this.onToggleSqlEditorCallback = callback;
  }

  public setSqlEditorExpanded(expanded: boolean): void {
    this.sqlEditorExpanded = expanded;
    this.toggleButton.classList.toggle("command-bar__sql-toggle--active", expanded);
  }

  public destroy(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
