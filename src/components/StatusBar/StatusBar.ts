import { BRIAN_APP_VERSION, BrianAppMessageType } from "../BrianApp/BrianApp";
import { ICellSelection } from "../SpreadsheetVisualizer/types";

export interface StatusBarItem {
  id: string;
  text: string;
  tooltip?: string;
  priority: number;
  alignment: "left" | "right";
  command?: string;
  color?: string;
  backgroundColor?: string;
  visible?: boolean;
}

export class StatusBar {
  private container: HTMLElement;
  private leftSection: HTMLElement;
  private rightSection: HTMLElement;
  private items: Map<string, StatusBarItem> = new Map();
  private onCommandCallback?: (command: string) => void;

  constructor(parent: HTMLElement) {
    this.container = document.createElement("div");
    this.container.className = "status-bar";

    this.leftSection = document.createElement("div");
    this.leftSection.className = "status-bar__section status-bar__section--left";

    this.rightSection = document.createElement("div");
    this.rightSection.className = "status-bar__section status-bar__section--right";

    this.container.appendChild(this.leftSection);
    this.container.appendChild(this.rightSection);
    parent.appendChild(this.container);

    this.initializeDefaultItems();
  }

  public addItem(item: StatusBarItem): void {
    this.items.set(item.id, { ...item, visible: item.visible ?? true });
    this.render();
  }

  public updateItem(id: string, updates: Partial<StatusBarItem>): void {
    const item = this.items.get(id);
    if (item) {
      Object.assign(item, updates);
      this.render();
    }
  }

  public removeItem(id: string): void {
    this.items.delete(id);
    this.render();
  }

  public setOnCommandCallback(callback: (command: string) => void): void {
    this.onCommandCallback = callback;
  }

  public updateDatasetInfo(datasetName: string, totalRows: number, totalColumns: number): void {
    this.updateItem("dataset-info", {
      text: `${datasetName} • ${totalRows} rows • ${totalColumns} columns`,
      tooltip: `Dataset: ${datasetName}\nRows: ${totalRows}\nColumns: ${totalColumns}`,
    });
  }

  public updateSelection(cellSelection?: ICellSelection): void {
    if (!cellSelection) {
      this.updateItem("selection-info", {
        text: "No selection",
        tooltip: "No selection",
      });
      return;
    } else if (cellSelection.columns.length > 0) {
      this.updateItem("selection-info", {
        text: `${cellSelection.columns.length} columns selected`,
        tooltip: `Selection: ${cellSelection.columns.length} columns`,
      });
      return;
    }

    const rowCount = cellSelection.rows.length;
    const colCount = cellSelection.columns.length;

    this.updateItem("selection-info", {
      text: `${rowCount} × ${colCount} cells selected`,
      tooltip: `Selection: ${rowCount} rows × ${colCount} columns`,
    });
  }

  public showMessage(message: string, type: BrianAppMessageType = "info", duration: number = 3000): void {
    const messageItem: StatusBarItem = {
      id: "temp-message",
      text: message,
      priority: 1000,
      alignment: "left",
      color: type === "error" ? "#f14c4c" : type === "warning" ? "#ffcc02" : type === "success" ? "#89d185" : "#007acc",
      visible: true,
    };

    this.addItem(messageItem);

    setTimeout(() => {
      this.removeItem("temp-message");
    }, duration);
  }

  private initializeDefaultItems(): void {
    // Left side items
    this.addItem({
      id: "dataset-info",
      text: "No dataset loaded",
      priority: 100,
      alignment: "left",
      tooltip: "Dataset information",
    });

    this.addItem({
      id: "selection-info",
      text: "No selection",
      priority: 90,
      alignment: "left",
      tooltip: "Current selection",
    });

    this.addItem({
      id: "cell-value",
      text: "",
      priority: 80,
      alignment: "left",
      tooltip: "Current cell value",
      visible: false,
    });

    // Right side items
    this.addItem({
      id: "command-palette",
      text: "Ctrl+P",
      priority: 100,
      alignment: "right",
      tooltip: "Open Command Palette",
      command: "workbench.action.showCommands",
    });

    this.addItem({
      id: "column-stats",
      text: "Stats",
      priority: 90,
      alignment: "right",
      tooltip: "Toggle Column Statistics",
      command: "view.toggleColumnStats",
    });

    this.addItem({
      id: "export-data",
      text: "Export",
      priority: 80,
      alignment: "right",
      tooltip: "Export current dataset",
      command: "dataset.export",
    });
  }

  private render(): void {
    this.leftSection.innerHTML = "";
    this.rightSection.innerHTML = "";

    const leftItems = Array.from(this.items.values())
      .filter((item) => item.alignment === "left" && item.visible)
      .sort((a, b) => b.priority - a.priority);

    const rightItems = Array.from(this.items.values())
      .filter((item) => item.alignment === "right" && item.visible)
      .sort((a, b) => b.priority - a.priority);

    leftItems.forEach((item) => this.renderItem(item, this.leftSection));
    rightItems.forEach((item) => this.renderItem(item, this.rightSection));

    // Add version and made by information
    const versionElement = document.createElement("div");
    versionElement.className = "status-bar__item status-bar__item--clickable";
    versionElement.title = `Brian App Version ${BRIAN_APP_VERSION}\nClick to view changelog`;
    versionElement.textContent = `v${BRIAN_APP_VERSION}`;
    versionElement.addEventListener("click", () => {
      window.open("https://github.com/caerbannogwhite/brian/blob/main/CHANGELOG", "_blank", "noopener,noreferrer");
    });
    this.rightSection.appendChild(versionElement);

    const createdByElement = document.createElement("div");
    createdByElement.className = "status-bar__item status-bar__item--created-by";
    createdByElement.title = "Visit the creator's GitHub profile";
    createdByElement.innerHTML = `
      <span class="created-by__text">Made with</span>
      <span class="created-by__heart">❤️</span>
      <span class="created-by__text">by</span>
      <a href="https://github.com/caerbannogwhite" target="_blank" rel="noopener noreferrer" class="created-by__link">
        caerbannogwhite
      </a>
    `;
    this.rightSection.appendChild(createdByElement);
  }

  private renderItem(item: StatusBarItem, container: HTMLElement): void {
    const element = document.createElement("div");
    element.className = "status-bar__item";
    element.textContent = item.text;

    if (item.tooltip) {
      element.title = item.tooltip;
    }

    if (item.color) {
      element.style.color = item.color;
    }

    if (item.backgroundColor) {
      element.style.backgroundColor = item.backgroundColor;
    }

    if (item.command) {
      element.classList.add("status-bar__item--clickable");
      element.addEventListener("click", () => {
        if (this.onCommandCallback) {
          this.onCommandCallback(item.command!);
        }
      });
    }

    container.appendChild(element);
  }

  public destroy(): void {
    this.container.remove();
  }
}
