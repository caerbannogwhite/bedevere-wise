import { EditorView, keymap, placeholder, lineNumbers } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, insertTab, indentLess } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { FocusableComponent } from "../BedevereApp/types";
import { DuckDBService } from "../../data/DuckDBService";
import { keymapService } from "../../data/KeymapService";
import { commandRegistry } from "../../data/CommandRegistry";
import { SqlAutoComplete } from "./SqlAutoComplete";
import { listenForThemeChanges } from "../SpreadsheetVisualizer/utils/theme";

// Syntax highlighting that matches the tokyonight palette via CSS variables,
// so the editor follows light/dark theme switches without a rebuild. Token
// classes are emitted by `@codemirror/lang-sql`'s parser; we just bind colors
// to the lezer tags.
const tokyonightHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--magenta)", fontWeight: "600" },
  { tag: [t.string, t.special(t.string)], color: "var(--green)" },
  { tag: [t.number, t.bool, t.atom], color: "var(--orange)" },
  { tag: t.null, color: "var(--red)" },
  { tag: [t.lineComment, t.blockComment], color: "var(--fg-muted)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.standard(t.variableName)], color: "var(--blue)" },
  { tag: [t.typeName, t.className], color: "var(--yellow)" },
  { tag: t.operator, color: "var(--cyan)" },
  { tag: [t.bracket, t.punctuation, t.separator], color: "var(--fg-dark)" },
  { tag: t.variableName, color: "var(--fg)" },
]);

export class SqlEditor implements FocusableComponent {
  public readonly componentId: string;
  public readonly canReceiveFocus: boolean = true;
  public readonly focusableElement: HTMLElement;

  private container: HTMLElement;
  private editorContainer: HTMLElement;
  private editorView: EditorView | null = null;
  private autoComplete: SqlAutoComplete;
  private _isFocused: boolean = false;
  private _isExpanded: boolean = false;
  private themeCleanup: (() => void) | null = null;

  private onExecuteCallback?: (query: string) => void;
  private onToggleCallback?: (isExpanded: boolean) => void;

  constructor(parent: HTMLElement, duckDBService: DuckDBService, componentId?: string) {
    this.componentId = componentId ?? "sql-editor";
    this.autoComplete = new SqlAutoComplete(duckDBService);

    // Create the container
    this.container = document.createElement("div");
    this.container.className = "sql-editor";
    this.focusableElement = this.container;

    // Create editor wrapper
    this.editorContainer = document.createElement("div");
    this.editorContainer.className = "sql-editor__editor";
    this.container.appendChild(this.editorContainer);

    // Create toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "sql-editor__toolbar";

    const runButton = document.createElement("button");
    runButton.className = "sql-editor__run-button";
    runButton.textContent = "Run";
    runButton.title = "Execute query (Ctrl+Enter)";
    runButton.addEventListener("click", () => this.execute());

    const clearButton = document.createElement("button");
    clearButton.className = "sql-editor__clear-button";
    clearButton.textContent = "Clear";
    clearButton.title = "Clear editor";
    clearButton.addEventListener("click", () => this.clear());

    toolbar.appendChild(runButton);
    toolbar.appendChild(clearButton);
    this.container.appendChild(toolbar);

    parent.appendChild(this.container);

    // Initialize CodeMirror
    this.initializeEditor();

    // Refresh schema for autocompletion
    this.autoComplete.refreshSchema();

    // Listen for theme changes
    this.themeCleanup = listenForThemeChanges(() => {
      this.rebuildEditor();
    });

    // Keymap-scope commands. Registered here because `this.execute` and
    // `this.collapse` are private and need the editor instance's closure.
    commandRegistry.register({
      id: "sqlEditor.execute",
      title: "Execute SQL Query",
      description: "Run the query currently in the SQL editor",
      category: "SQL",
      scope: "sqlEditor",
      execute: async () => { await this.execute(); },
    });
    commandRegistry.register({
      id: "sqlEditor.collapse",
      title: "Collapse SQL Editor",
      description: "Close the SQL editor panel",
      category: "SQL",
      scope: "sqlEditor",
      execute: () => this.collapse(),
    });
  }

  // FocusableComponent interface
  public focus(): void {
    this._isFocused = true;
    this.editorView?.focus();
  }

  public blur(): void {
    this._isFocused = false;
    this.editorView?.contentDOM.blur();
  }

  public isFocused(): boolean {
    return this._isFocused;
  }

  public async handleKeyDown(event: KeyboardEvent): Promise<boolean> {
    // Mod-Enter (execute) is wired through the CodeMirror keymap so the editor
    // owns its primary chord and we don't double-fire when the event also
    // bubbles up to this document-level handler. Only sqlEditor.collapse
    // (Escape when no autocomplete dropdown is open) needs routing here.
    const action = keymapService.matchEvent(event, "sqlEditor");
    if (action !== "sqlEditor.collapse") return false;
    event.preventDefault();
    if (commandRegistry.has(action)) {
      try { await commandRegistry.run(action); }
      catch (err) { console.error(`command ${action} failed:`, err); }
    }
    return true;
  }

  // Public API
  public getQuery(): string {
    return this.editorView?.state.doc.toString() ?? "";
  }

  public setQuery(query: string): void {
    if (!this.editorView) return;
    this.editorView.dispatch({
      changes: { from: 0, to: this.editorView.state.doc.length, insert: query },
    });
  }

  public async execute(): Promise<void> {
    const query = this.getQuery().trim();
    if (!query) return;

    if (this.onExecuteCallback) {
      this.onExecuteCallback(query);
    }
  }

  public clear(): void {
    this.setQuery("");
    this.editorView?.focus();
  }

  public toggle(): void {
    if (this._isExpanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  public expand(): void {
    if (this._isExpanded) return;
    this._isExpanded = true;
    this.container.classList.add("sql-editor--expanded");

    // Focus the editor after expansion animation
    requestAnimationFrame(() => {
      this.editorView?.focus();
    });

    this.onToggleCallback?.(true);
  }

  public collapse(): void {
    if (!this._isExpanded) return;
    this._isExpanded = false;
    this.container.classList.remove("sql-editor--expanded");
    this.onToggleCallback?.(false);
  }

  public isExpanded(): boolean {
    return this._isExpanded;
  }

  public setOnExecuteCallback(callback: (query: string) => void): void {
    this.onExecuteCallback = callback;
  }

  public setOnToggleCallback(callback: (isExpanded: boolean) => void): void {
    this.onToggleCallback = callback;
  }

  public refreshSchema(): void {
    this.autoComplete.refreshSchema();
  }

  public destroy(): void {
    if (this.themeCleanup) {
      this.themeCleanup();
      this.themeCleanup = null;
    }
    this.editorView?.destroy();
    this.editorView = null;
    this.container.remove();
  }

  private initializeEditor(): void {
    const extensions = [
      lineNumbers(),
      history(),
      sql({ dialect: PostgreSQL }),
      syntaxHighlighting(tokyonightHighlight),
      autocompletion({
        override: [this.autoComplete.getCompletionSource()],
      }),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      placeholder("Enter SQL query... (Ctrl+Enter to execute)"),
      EditorView.lineWrapping,
      // Tab needs an explicit binding because defaultKeymap omits it — without
      // this, Tab falls through to the browser and moves focus out of the
      // editor. Mod-Enter must beat defaultKeymap's `Mod-Enter -> insertBlankLine`,
      // hence Prec.high on the whole block.
      Prec.high(
        keymap.of([
          { key: "Tab", run: insertTab, shift: indentLess },
          {
            key: "Mod-Enter",
            run: () => {
              this.execute();
              return true;
            },
          },
        ])
      ),
    ];

    const state = EditorState.create({
      doc: "",
      extensions,
    });

    this.editorView = new EditorView({
      state,
      parent: this.editorContainer,
    });
  }

  private rebuildEditor(): void {
    const currentDoc = this.getQuery();
    this.editorView?.destroy();
    this.editorContainer.innerHTML = "";
    this.initializeEditor();
    if (currentDoc) {
      this.setQuery(currentDoc);
    }
  }
}
