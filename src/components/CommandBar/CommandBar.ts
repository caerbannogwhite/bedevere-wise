import { Column } from "../../data/types";
import { ICellSelection } from "../SpreadsheetVisualizer/types";
import { persistenceService } from "../../data/PersistenceService";
import { Command, commandRegistry } from "../../data/CommandRegistry";

const HISTORY_MAX = 200;
const SUGGESTIONS_MAX = 8;

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

  // Autocomplete dropdown for dot-commands. Visible only while the input
  // starts with '.' and has matching suggestions.
  private suggestionsEl!: HTMLDivElement;
  private suggestions: Command[] = [];
  private suggestionIndex: number = -1; // -1 = no item highlighted
  private suggestionsVisible: boolean = false;

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
    this.prompt.textContent = ":";
    this.element.appendChild(this.prompt);

    // Shell input — accepts dot-commands and single-line SQL.
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "command-bar__shell-input";
    this.input.placeholder = "type .help or SQL\u2026";
    this.input.spellcheck = false;
    this.input.autocomplete = "off";
    this.input.addEventListener("keydown", (e) => this.onInputKeyDown(e));
    this.input.addEventListener("input", () => this.updateSuggestions());
    this.input.addEventListener("blur", () => {
      // Defer hide so a click on a suggestion lands before the dropdown unmounts.
      window.setTimeout(() => this.hideSuggestions(), 150);
    });
    this.element.appendChild(this.input);

    // Autocomplete dropdown. Positioned by CSS (absolute inside command-bar).
    this.suggestionsEl = document.createElement("div");
    this.suggestionsEl.className = "command-bar__suggestions command-bar__suggestions--hidden";
    this.element.appendChild(this.suggestionsEl);

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
    // Autocomplete takes priority over history when visible. Tab/Up/Down/Esc
    // address the dropdown; Enter still submits (bash-style: Tab completes,
    // Enter runs).
    if (this.suggestionsVisible) {
      switch (e.key) {
        case "Tab": {
          e.preventDefault();
          e.stopPropagation();
          this.completeFromSuggestions();
          return;
        }
        case "Escape": {
          e.preventDefault();
          e.stopPropagation();
          this.hideSuggestions();
          return;
        }
        case "ArrowDown": {
          e.preventDefault();
          e.stopPropagation();
          this.moveSuggestion(1);
          return;
        }
        case "ArrowUp": {
          e.preventDefault();
          e.stopPropagation();
          this.moveSuggestion(-1);
          return;
        }
        // Enter falls through to the submit path below.
      }
    }

    switch (e.key) {
      case "Enter": {
        e.preventDefault();
        e.stopPropagation();
        const value = this.input.value;
        if (value.trim().length === 0) return;
        this.hideSuggestions();
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

  // ---- autocomplete ------------------------------------------------------

  /**
   * Recompute the suggestion list based on the current input. Matches any
   * shell command whose `.<shellName>` starts with the typed prefix. Hides
   * the dropdown when the input isn't a dot-command or no matches exist.
   */
  private updateSuggestions(): void {
    const value = this.input.value;
    const prefix = value.trim();

    // Not a dot-command → no completions.
    if (!prefix.startsWith(".")) {
      this.hideSuggestions();
      return;
    }
    // Only complete the FIRST token. Once the user has typed a space, they're
    // onto arguments; the dropdown steps aside.
    const firstSpace = prefix.indexOf(" ");
    if (firstSpace !== -1) {
      this.hideSuggestions();
      return;
    }

    const needle = prefix.slice(1).toLowerCase(); // drop the '.'
    const matches = commandRegistry
      .list({ shellOnly: true })
      .filter((cmd) => {
        const name = cmd.shellName ?? "";
        if (name.toLowerCase().startsWith(needle)) return true;
        if (cmd.aliases?.some((a) => a.toLowerCase().startsWith(needle))) return true;
        return false;
      })
      .sort((a, b) => (a.shellName ?? "").localeCompare(b.shellName ?? ""))
      .slice(0, SUGGESTIONS_MAX);

    if (matches.length === 0) {
      this.hideSuggestions();
      return;
    }

    this.suggestions = matches;
    this.suggestionIndex = 0; // first match pre-selected so Tab is one keypress
    this.renderSuggestions();
    this.suggestionsVisible = true;
    this.suggestionsEl.classList.remove("command-bar__suggestions--hidden");
  }

  private renderSuggestions(): void {
    this.suggestionsEl.innerHTML = "";
    for (let i = 0; i < this.suggestions.length; i++) {
      const cmd = this.suggestions[i];
      const row = document.createElement("div");
      row.className = "command-bar__suggestion";
      if (i === this.suggestionIndex) row.classList.add("command-bar__suggestion--active");
      row.addEventListener("mousedown", (e) => {
        // mousedown (not click) so we beat the input's blur handler.
        e.preventDefault();
        this.suggestionIndex = i;
        this.completeFromSuggestions();
      });

      const name = document.createElement("span");
      name.className = "command-bar__suggestion-name";
      name.textContent = `.${cmd.shellName}`;
      row.appendChild(name);

      const desc = document.createElement("span");
      desc.className = "command-bar__suggestion-desc";
      desc.textContent = cmd.description || cmd.title;
      row.appendChild(desc);

      this.suggestionsEl.appendChild(row);
    }
  }

  private moveSuggestion(delta: number): void {
    if (this.suggestions.length === 0) return;
    const len = this.suggestions.length;
    this.suggestionIndex = (this.suggestionIndex + delta + len) % len;
    this.renderSuggestions();
  }

  private completeFromSuggestions(): void {
    if (this.suggestionIndex < 0 || this.suggestionIndex >= this.suggestions.length) return;
    const cmd = this.suggestions[this.suggestionIndex];
    this.input.value = `.${cmd.shellName} `;
    this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    this.hideSuggestions();
  }

  private hideSuggestions(): void {
    if (!this.suggestionsVisible) return;
    this.suggestionsVisible = false;
    this.suggestions = [];
    this.suggestionIndex = -1;
    this.suggestionsEl.classList.add("command-bar__suggestions--hidden");
    this.suggestionsEl.innerHTML = "";
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
