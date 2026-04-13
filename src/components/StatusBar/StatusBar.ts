import { BedevereAppMessageType } from "../BedevereApp/BedevereApp";
import { ICellSelection } from "../SpreadsheetVisualizer/types";
import { MessagePopover } from "./MessagePopover";

export interface MessageOptions {
  /** Duration in ms; 0 means persistent until dismissed. Defaults per type. */
  duration?: number;
  /** Full text shown in the expanded popover (e.g. stack trace). */
  details?: string;
  /** Optional title; defaults to severity label (ERROR / WARNING / …). */
  title?: string;
}

const DEFAULT_DURATIONS: Record<BedevereAppMessageType, number> = {
  error: 10_000,
  warning: 6_000,
  success: 3_000,
  info: 3_000,
};

const MESSAGE_ICONS: Record<BedevereAppMessageType, string> = {
  error: "\u2716", // ✖
  warning: "\u26A0", // ⚠
  success: "\u2713", // ✓
  info: "\u2139", // ℹ
};

interface ActiveMessage {
  type: BedevereAppMessageType;
  message: string;
  details?: string;
  title?: string;
  timestamp: Date;
}

export interface StatusBarItem {
  id: string;
  text: string;
  html?: string;
  tooltip?: string;
  priority: number;
  alignment: "left" | "right";
  command?: string;
  color?: string;
  backgroundColor?: string;
  visible?: boolean;
  /** Severity, used to apply modifier classes and enable click-to-expand. */
  messageType?: BedevereAppMessageType;
  /** Whether clicking this item should open the popover. */
  expandable?: boolean;
}

export class StatusBar {
  private container: HTMLElement;
  private leftSection: HTMLElement;
  private rightSection: HTMLElement;
  private version: string;
  private items: Map<string, StatusBarItem> = new Map();
  private onCommandCallback?: (command: string) => void;

  // Active transient message (for the popover)
  private activeMessage: ActiveMessage | null = null;
  private messageTimeoutId: number | null = null;
  private popover: MessagePopover;
  private onHelpClickCallback?: () => void;

  constructor(parent: HTMLElement, version: string) {
    this.container = document.createElement("div");
    this.container.className = "status-bar";

    this.leftSection = document.createElement("div");
    this.leftSection.className = "status-bar__section status-bar__section--left";

    this.rightSection = document.createElement("div");
    this.rightSection.className = "status-bar__section status-bar__section--right";

    this.container.appendChild(this.leftSection);
    this.container.appendChild(this.rightSection);
    parent.appendChild(this.container);

    this.version = version;

    this.popover = new MessagePopover(document.body);

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

  public setOnHelpClickCallback(callback: () => void): void {
    this.onHelpClickCallback = callback;
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
    }

    // Column selection: rows is empty, columns has the selected column(s)
    if (cellSelection.rows.length === 0 && cellSelection.columns.length > 0) {
      const count = cellSelection.columns.length;
      const text = count === 1 ? "1 column selected" : `${count} columns selected`;
      this.updateItem("selection-info", {
        text,
        tooltip: `Selection: ${text}`,
      });
      return;
    }

    // Cell selection
    if (cellSelection.rows.length > 0 && cellSelection.columns.length > 0) {
      const cellCount = cellSelection.rows.length * cellSelection.columns.length;
      const text = cellCount === 1 ? "1 cell selected" : `${cellCount} cells selected`;
      this.updateItem("selection-info", {
        text,
        tooltip: cellCount === 1
          ? "Selection: 1 cell selected"
          : `Selection: ${cellSelection.rows.length} rows \u00d7 ${cellSelection.columns.length} columns`,
      });
      return;
    }

    this.updateItem("selection-info", {
      text: "No selection",
      tooltip: "No selection",
    });
  }

  public updatePosition(cellSelection?: ICellSelection): void {
    if (!cellSelection || cellSelection.rows.length === 0) {
      this.updateItem("position-info", { text: "", visible: false });
      return;
    }

    if (cellSelection.rows.length === 1 && cellSelection.columns.length === 1) {
      const text = `${cellSelection.columns[0].name}:${cellSelection.rows[0]}`;
      this.updateItem("position-info", { text, tooltip: `Position: ${text}`, visible: true });
      return;
    }

    if (cellSelection.rows.length > 0 && cellSelection.columns.length > 0) {
      const startCol = cellSelection.columns[0].name;
      const startRow = cellSelection.rows[0];
      const endCol = cellSelection.columns[cellSelection.columns.length - 1].name;
      const endRow = cellSelection.rows[cellSelection.rows.length - 1];
      const text = `${startCol}:${startRow} \u2192 ${endCol}:${endRow}`;
      this.updateItem("position-info", { text, tooltip: `Range: ${text}`, visible: true });
      return;
    }

    this.updateItem("position-info", { text: "", visible: false });
  }

  public updateCellValue(cellSelection?: ICellSelection): void {
    if (!cellSelection || cellSelection.rows.length === 0) {
      this.updateItem("cell-value", { text: "", html: undefined, visible: false });
      return;
    }

    if (cellSelection.formatted.length > 0 && cellSelection.formatted[0].length > 0) {
      const formatted = cellSelection.formatted[0][0];
      const raw = cellSelection.values[0][0];
      const dataType = cellSelection.columns[0]?.dataType?.toLowerCase() ?? "";
      const hasRaw = raw != null && String(raw) !== formatted;
      const plainText = hasRaw ? `${formatted} [${raw}]` : formatted;

      const escapedFormatted = this.escapeHtml(formatted);
      const formattedSpan = `<span class="cell-value__formatted cell-value__formatted--${dataType}">${escapedFormatted}</span>`;
      const rawSpan = hasRaw ? ` <span class="cell-value__raw">[${this.escapeHtml(String(raw))}]</span>` : "";

      this.updateItem("cell-value", {
        text: plainText,
        html: formattedSpan + rawSpan,
        tooltip: `Cell value: ${plainText}`,
        visible: true,
      });
      return;
    }

    this.updateItem("cell-value", { text: "", html: undefined, visible: false });
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  public showMessage(
    message: string,
    type: BedevereAppMessageType = "info",
    options?: MessageOptions,
  ): void {
    // Clear any previously-scheduled dismissal
    if (this.messageTimeoutId !== null) {
      window.clearTimeout(this.messageTimeoutId);
      this.messageTimeoutId = null;
    }

    const duration = options?.duration ?? DEFAULT_DURATIONS[type];
    const icon = MESSAGE_ICONS[type];

    this.activeMessage = {
      type,
      message,
      details: options?.details,
      title: options?.title,
      timestamp: new Date(),
    };

    // If the popover was already open for a previous message, update it in place
    if (this.popover.isOpen() && this.activeMessage) {
      this.popover.show(this.activeMessage);
    }

    const itemHtml =
      `<span class="status-bar__msg-icon">${icon}</span>` +
      `<span class="status-bar__msg-text">${escapeHtml(message)}</span>` +
      (options?.details ? `<span class="status-bar__msg-more" title="Click to expand">\u2026</span>` : "");

    const messageItem: StatusBarItem = {
      id: "temp-message",
      text: message,
      html: itemHtml,
      tooltip: options?.details ? `${message}\n\nClick to expand` : message,
      priority: 1000,
      alignment: "left",
      visible: true,
      messageType: type,
      expandable: true,
    };

    this.addItem(messageItem);

    if (duration > 0) {
      this.messageTimeoutId = window.setTimeout(() => {
        this.removeItem("temp-message");
        this.messageTimeoutId = null;
        this.activeMessage = null;
        this.popover.hide();
      }, duration);
    }
  }

  /**
   * Toggle the message popover open/closed for the currently-active message.
   * Called when the user clicks the transient status bar message.
   */
  private toggleMessagePopover(): void {
    if (!this.activeMessage) return;
    if (this.popover.isOpen()) {
      this.popover.hide();
    } else {
      this.popover.show(this.activeMessage);
    }
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
      id: "position-info",
      text: "",
      priority: 95,
      alignment: "left",
      tooltip: "Current position",
      visible: false,
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

    // this.addItem({
    //   id: "column-stats",
    //   text: "Stats",
    //   priority: 90,
    //   alignment: "right",
    //   tooltip: "Toggle Column Statistics",
    //   command: "view.toggleColumnStats",
    // });

    // this.addItem({
    //   id: "export-data",
    //   text: "Export",
    //   priority: 80,
    //   alignment: "right",
    //   tooltip: "Export current dataset",
    //   command: "dataset.export",
    // });
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
    versionElement.className = "status-bar__item status-bar__item--clickable status-bar__item--version";
    versionElement.title = `Bedevere Wise v${this.version}\nClick to view changelog`;
    const dash = this.version.indexOf("-");
    const versionNum = dash >= 0 ? this.version.slice(0, dash) : this.version;
    const codename = dash >= 0 ? this.version.slice(dash + 1) : "";
    versionElement.innerHTML = codename
      ? `<span class="status-bar__version-num">v${escapeHtml(versionNum)}</span>` +
        `<span class="status-bar__version-sep">\u00B7</span>` +
        `<span class="status-bar__version-codename">${escapeHtml(codename)}</span>`
      : `<span class="status-bar__version-num">v${escapeHtml(versionNum)}</span>`;
    versionElement.addEventListener("click", () => {
      window.open("https://github.com/caerbannogwhite/bedevere-wise/blob/main/CHANGELOG.md", "_blank", "noopener,noreferrer");
    });
    this.rightSection.appendChild(versionElement);

    // Help button (opens HelpPanel — How To + About)
    const helpElement = document.createElement("div");
    helpElement.className = "status-bar__item status-bar__item--clickable status-bar__item--help";
    helpElement.title = "Open Help";
    helpElement.textContent = "Help";
    helpElement.addEventListener("click", () => this.onHelpClickCallback?.());
    this.rightSection.appendChild(helpElement);

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
    element.setAttribute("data-id", item.id);

    if (item.messageType) {
      element.classList.add(`status-bar__item--${item.messageType}`);
    }

    if (item.html) {
      element.innerHTML = item.html;
    } else {
      element.textContent = item.text;
    }

    if (item.tooltip) {
      element.title = item.tooltip;
    }

    if (item.color) {
      element.style.color = item.color;
    }

    if (item.backgroundColor) {
      element.style.backgroundColor = item.backgroundColor;
    }

    if (item.expandable) {
      element.classList.add("status-bar__item--clickable");
      element.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleMessagePopover();
      });
    } else if (item.command) {
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
    if (this.messageTimeoutId !== null) {
      window.clearTimeout(this.messageTimeoutId);
      this.messageTimeoutId = null;
    }
    this.popover.destroy();
    this.container.remove();
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
