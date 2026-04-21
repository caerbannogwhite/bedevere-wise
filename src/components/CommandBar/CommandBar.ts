import { Column } from "../../data/types";
import { ICellSelection } from "../SpreadsheetVisualizer/types";
import { persistenceService } from "../../data/PersistenceService";

const HISTORY_MAX = 200;

export interface CommandBarOptions {
  container: HTMLElement;
}

export interface CellInfo {
  value: any;
  column: Column;
  position: { row: number; col: number };
}

/**
 * The always-visible strip above the spreadsheet. Hosts the shell input (a
 * single-line text field; Enter submits, Up/Down walk a session history) and
 * the SQL-editor toggle on the right. Dispatch of dot-commands vs SQL lives
 * in the caller (TabManager wires the submit callback).
 */
export class CommandBar {
  private container: HTMLElement;
  private element: HTMLDivElement;
  private prompt!: HTMLSpanElement;
  private input!: HTMLInputElement;
  private toggleButton!: HTMLButtonElement;
  private onToggleSqlEditorCallback?: () => void;
  private onSubmitCallback?: (input: string) => void | Promise<void>;
  private sqlEditorExpanded: boolean = false;

  // Persistent history ring. Loaded from localStorage via PersistenceService
  // on construction and written back on every push. Cap is HISTORY_MAX.
  private history: string[] = [];
  private historyIndex: number = -1; // -1 = editing new line, otherwise points into history
  private pendingDraft: string = ""; // stores the unsubmitted line when user starts walking history

  constructor(options: CommandBarOptions) {
    this.container = options.container;
    this.element = document.createElement("div");
    this.element.className = "command-bar";
    this.setupHTML();
    this.container.appendChild(this.element);
    this.loadHistory();
  }

  private loadHistory(): void {
    const stored = persistenceService.loadAppSettings().shellHistory;
    if (Array.isArray(stored)) {
      this.history = stored.slice(-HISTORY_MAX);
    }
  }

  private persistHistory(): void {
    const settings = persistenceService.loadAppSettings();
    settings.shellHistory = this.history.slice(-HISTORY_MAX);
    persistenceService.saveAppSettings(settings);
  }

  private setupHTML(): void {
    // Shell prompt marker
    this.prompt = document.createElement("span");
    this.prompt.className = "command-bar__shell-prompt";
    this.prompt.textContent = ">";
    this.element.appendChild(this.prompt);

    // Shell input — accepts dot-commands and single-line SQL.
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "command-bar__shell-input";
    this.input.placeholder = "type .help or SQL\u2026";
    this.input.spellcheck = false;
    this.input.autocomplete = "off";
    this.input.addEventListener("keydown", (e) => this.onInputKeyDown(e));
    this.element.appendChild(this.input);

    // SQL editor toggle button (existing)
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

  private async onInputKeyDown(e: KeyboardEvent): Promise<void> {
    switch (e.key) {
      case "Enter": {
        e.preventDefault();
        e.stopPropagation();
        const value = this.input.value;
        if (value.trim().length === 0) return;
        this.pushHistory(value);
        this.input.value = "";
        this.historyIndex = -1;
        this.pendingDraft = "";
        await this.onSubmitCallback?.(value);
        break;
      }
      case "ArrowUp": {
        if (this.history.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.historyIndex === -1) {
          this.pendingDraft = this.input.value;
          this.historyIndex = this.history.length - 1;
        } else if (this.historyIndex > 0) {
          this.historyIndex--;
        }
        this.input.value = this.history[this.historyIndex];
        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
        break;
      }
      case "ArrowDown": {
        if (this.historyIndex === -1) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.input.value = this.history[this.historyIndex];
        } else {
          this.historyIndex = -1;
          this.input.value = this.pendingDraft;
          this.pendingDraft = "";
        }
        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
        break;
      }
      // Other keys: let the input handle them normally.
    }
  }

  private pushHistory(value: string): void {
    // De-dup consecutive identical lines; cap to HISTORY_MAX entries.
    if (this.history.length > 0 && this.history[this.history.length - 1] === value) return;
    this.history.push(value);
    if (this.history.length > HISTORY_MAX) this.history.shift();
    this.persistHistory();
  }

  /**
   * Focus the shell input. Exposed so other components (e.g. a `.focus` or
   * `shell.focus` keybinding later) can grab it programmatically.
   */
  public focusInput(): void {
    this.input.focus();
  }

  public setValue(value: string): void {
    this.input.value = value;
  }

  public updateCell(_selection?: ICellSelection): void {
    // Cell value display moved to status bar; kept as a no-op for the existing
    // TabManager call sites.
  }

  public setOnSubmitCallback(callback: (input: string) => void | Promise<void>): void {
    this.onSubmitCallback = callback;
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
