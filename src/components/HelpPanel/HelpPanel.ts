import duckPng from "@/assets/duck.png?url";
import {
  KeyBinding,
  KeymapEntry,
  formatBinding,
  keymapService,
  matchesBinding,
} from "@/data/KeymapService";

export type HelpPanelTab = "howto" | "import" | "shortcuts" | "settings" | "about";

export interface HelpPanelOptions {
  version: string;
  onLoadSampleDataset: () => Promise<void> | void;
  onShowMessage?: (msg: string, type: "info" | "success" | "error") => void;
  onBrowseFolder?: () => void;
  onFilesReceived?: (files: File[]) => void | Promise<void>;
  supportedFormats?: string[];
  initialTheme?: "light" | "dark" | "auto";
  onThemeChange?: (theme: "light" | "dark" | "auto") => void;
  onResetKeymap?: () => void;
  onClearAllData?: () => Promise<void> | void;
  getCopyOptions?: () => { delimiter: "tab" | "comma"; includeHeader: boolean };
  setCopyOptions?: (opts: { delimiter: "tab" | "comma"; includeHeader: boolean }) => void;
}

const TAB_ORDER: HelpPanelTab[] = ["howto", "import", "shortcuts", "settings", "about"];

const SCOPE_LABELS: Record<string, string> = {
  global: "App",
  spreadsheet: "Spreadsheet",
  sqlEditor: "SQL Editor",
  commandPalette: "Command Palette",
};

const SCOPE_ORDER: string[] = ["global", "spreadsheet", "sqlEditor", "commandPalette"];

type TutorialNode =
  | { kind: "heading"; text: string }
  | { kind: "prose"; html: string }
  | { kind: "tip"; html: string }
  | { kind: "snippet"; sql: string };

const PENGUINS_TUTORIAL: TutorialNode[] = [
  {
    kind: "prose",
    html:
      `DuckDB supports a rich SQL dialect \u2014 see the ` +
      `<a href="https://duckdb.org/docs/current/sql/introduction" target="_blank" rel="noopener noreferrer">DuckDB SQL reference</a> ` +
      `for the full syntax. The examples below assume the Palmer Penguins sample loaded via the button above.`,
  },

  { kind: "heading", text: "Parse the dataset" },
  {
    kind: "prose",
    html:
      `The raw CSV stores numeric columns as strings with <code>"NA"</code> for missing values and leaves the ` +
      `categorical columns as free-form text. Cast the numerics with <code>TRY_CAST</code>, and tighten the ` +
      `categoricals into <code>ENUM</code>s so they take less memory and only accept valid values.`,
  },
  {
    kind: "snippet",
    sql:
      "-- Tighten categorical text into ENUMs (less memory, only valid values)\n" +
      "-- and cast measurements to DOUBLE. TRY_CAST yields NULL on failure, so\n" +
      "-- the string \"NA\" becomes a real NULL.\n" +
      "SELECT\n" +
      "    species::ENUM ('Adelie', 'Gentoo', 'Chinstrap') AS species\n" +
      "  , island::ENUM ('Dream', 'Torgersen', 'Biscoe') AS island\n" +
      "  , sex::ENUM ('female', 'male') AS sex\n" +
      "  , TRY_CAST(bill_length_mm AS DOUBLE) AS bill_length_mm\n" +
      "  , TRY_CAST(bill_depth_mm AS DOUBLE) AS bill_depth_mm\n" +
      "  , TRY_CAST(flipper_length_mm AS DOUBLE) AS flipper_length_mm\n" +
      "  , TRY_CAST(body_mass_g AS DOUBLE) AS body_mass_g\n" +
      "FROM penguins\n" +
      "WHERE sex != 'NA'             -- drop rows with unknown sex\n" +
      "ORDER BY species, island, sex",
  },
  {
    kind: "tip",
    html:
      `Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>, run <strong>Create View</strong>, and name it ` +
      `<code>penguins_clean</code>. The later examples reference that name.`,
  },

  { kind: "heading", text: "Basic summary" },
  {
    kind: "prose",
    html: `A classic <code>GROUP BY</code> with the standard <code>AVG</code> / <code>STDDEV</code> aggregates.`,
  },
  {
    kind: "snippet",
    sql:
      "-- Mean and standard deviation of every measurement, broken down by\n" +
      "-- species x island x sex. The penguins_clean view already excludes\n" +
      "-- rows with sex = 'NA', so no WHERE clause is needed.\n" +
      "SELECT species, island, sex\n" +
      "  , AVG(bill_length_mm)    AS mean_bill_length\n" +
      "  , STDDEV(bill_length_mm) AS std_bill_length\n" +
      "  , AVG(bill_depth_mm)     AS mean_bill_depth\n" +
      "  , STDDEV(bill_depth_mm)  AS std_bill_depth\n" +
      "  , AVG(flipper_length_mm)    AS mean_flipper_length\n" +
      "  , STDDEV(flipper_length_mm) AS std_flipper_length\n" +
      "  , AVG(body_mass_g)    AS mean_body_mass\n" +
      "  , STDDEV(body_mass_g) AS std_body_mass\n" +
      "FROM penguins_clean\n" +
      "GROUP BY species, island, sex\n" +
      "ORDER BY species, island, sex",
  },

  { kind: "heading", text: "Better summary with Stats Duck" },
  {
    kind: "prose",
    html:
      `Bedevere auto-loads the ` +
      `<a href="https://github.com/caerbannogwhite/the-stats-duck" target="_blank" rel="noopener noreferrer">Stats Duck</a> ` +
      `DuckDB extension. Its <code>summary_stats()</code> aggregate returns a STRUCT with count, mean, sd, quartiles, ` +
      `min/max, skewness, and kurtosis.`,
  },
  {
    kind: "snippet",
    sql:
      "-- One summary_stats() call per measurement. Each result cell is a\n" +
      "-- STRUCT holding count, mean, sd, quartiles, min/max, skewness, and\n" +
      "-- kurtosis \u2014 click a cell to inspect it.\n" +
      "SELECT species, island, sex\n" +
      "  , summary_stats(bill_length_mm)    AS bill_length_summ\n" +
      "  , summary_stats(bill_depth_mm)     AS bill_depth_summ\n" +
      "  , summary_stats(flipper_length_mm) AS flipper_length_summ\n" +
      "  , summary_stats(body_mass_g)       AS body_mass_summ\n" +
      "FROM penguins_clean\n" +
      "GROUP BY species, island, sex\n" +
      "ORDER BY species, island, sex",
  },
  {
    kind: "tip",
    html:
      `Each result cell is a STRUCT. Click the cell, then click the value in the status bar to open an inspector ` +
      `with every field on its own row.`,
  },

  { kind: "heading", text: "All in one query" },
  {
    kind: "prose",
    html: `Skip the intermediate view \u2014 cast inline.`,
  },
  {
    kind: "snippet",
    sql:
      "-- Cast and summarise in one pass, without a saved view.\n" +
      "SELECT species, island\n" +
      "  , summary_stats(TRY_CAST(bill_length_mm AS DOUBLE))    AS bill_length_mm\n" +
      "  , summary_stats(TRY_CAST(bill_depth_mm AS DOUBLE))     AS bill_depth_mm\n" +
      "  , summary_stats(TRY_CAST(flipper_length_mm AS DOUBLE)) AS flipper_length_mm\n" +
      "  , summary_stats(TRY_CAST(body_mass_g AS DOUBLE))       AS body_mass_g\n" +
      "FROM penguins\n" +
      "GROUP BY species, island",
  },

  { kind: "heading", text: "Testing a hypothesis" },
  {
    kind: "prose",
    html:
      `Stats Duck ships a battery of hypothesis tests. Here's a two-sample t-test comparing body mass between Adelie and ` +
      `Gentoo penguins. <code>CASE WHEN species = 'X'</code> selects one group per argument and NULLs out the rest; ` +
      `Stats Duck ignores NULLs.`,
  },
  {
    kind: "snippet",
    sql:
      "-- Two-sample Welch's t-test on two measurements at once: is body mass\n" +
      "-- (and flipper length) different between Adelie and Gentoo penguins?\n" +
      "-- CASE WHEN selects one group per argument; NULLs in the other group\n" +
      "-- are ignored by Stats Duck. Each result cell is a STRUCT with\n" +
      "-- t_statistic, p_value, df, and the confidence interval.\n" +
      "SELECT\n" +
      "    ttest_2samp(\n" +
      "      CASE WHEN species = 'Adelie' THEN body_mass_g END,\n" +
      "      CASE WHEN species = 'Gentoo' THEN body_mass_g END\n" +
      "    ) AS t_test_body_mass\n" +
      "  , ttest_2samp(\n" +
      "      CASE WHEN species = 'Adelie' THEN flipper_length_mm END,\n" +
      "      CASE WHEN species = 'Gentoo' THEN flipper_length_mm END\n" +
      "    ) AS t_test_flipper_length\n" +
      "FROM penguins_clean\n" +
      "WHERE body_mass_g IS NOT NULL\n" +
      "  AND flipper_length_mm IS NOT NULL",
  },
  {
    kind: "tip",
    html:
      `For a non-parametric alternative (no normality assumption), replace <code>ttest_2samp</code> with ` +
      `<code>mann_whitney_u</code>.`,
  },
];

export class HelpPanel {
  private parent: HTMLElement;
  private options: HelpPanelOptions;
  private overlay: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private tabButtons: Map<HelpPanelTab, HTMLButtonElement> = new Map();
  private tabBodies: Map<HelpPanelTab, HTMLElement> = new Map();
  private sampleButton: HTMLButtonElement | null = null;
  private currentTab: HelpPanelTab = "howto";
  private captureActive: boolean = false;

  // Capture-phase listener so we pre-empt EventDispatcher's keydown routing.
  // Runs before BedevereApp.handleKeyDown, lets us own Escape / tab-nav keys
  // while the panel is open.
  private onKeyDown = (e: KeyboardEvent) => {
    // Capture-mode (rebinding a shortcut) owns every key — don't steal events.
    if (this.captureActive) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.hide();
      return;
    }

    // Ctrl+Alt+←/→ cycles Help tabs; mirrors dataset-tab nav.
    if (e.ctrlKey && e.altKey && !e.shiftKey) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.cycleTab(1);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.cycleTab(-1);
        return;
      }
    }

    // Alt+1..N jumps directly to tab N while Help is open.
    if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      if (idx < TAB_ORDER.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.setTab(TAB_ORDER[idx]);
      }
    }
  };

  constructor(parent: HTMLElement, options: HelpPanelOptions) {
    this.parent = parent;
    this.options = options;
  }

  public show(tab: HelpPanelTab = "howto"): void {
    if (!this.overlay) {
      this.build();
    }
    this.setTab(tab);
    document.addEventListener("keydown", this.onKeyDown, { capture: true });
  }

  public hide(): void {
    document.removeEventListener("keydown", this.onKeyDown, { capture: true });
    this.captureActive = false;
    this.overlay?.remove();
    this.overlay = null;
    this.panel = null;
    this.tabButtons.clear();
    this.tabBodies.clear();
    this.sampleButton = null;
  }

  private cycleTab(delta: number): void {
    const idx = TAB_ORDER.indexOf(this.currentTab);
    const next = (idx + delta + TAB_ORDER.length) % TAB_ORDER.length;
    this.setTab(TAB_ORDER[next]);
  }

  public isOpen(): boolean {
    return this.overlay !== null;
  }

  public setTab(tab: HelpPanelTab): void {
    this.currentTab = tab;
    for (const [id, btn] of this.tabButtons) {
      btn.classList.toggle("help-panel__tab--active", id === tab);
    }
    for (const [id, body] of this.tabBodies) {
      body.classList.toggle("help-panel__tab-body--active", id === tab);
    }
  }

  public destroy(): void {
    this.hide();
  }

  private build(): void {
    this.overlay = document.createElement("div");
    this.overlay.className = "help-panel-overlay";
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.hide();
    });

    this.panel = document.createElement("div");
    this.panel.className = "help-panel";

    this.panel.appendChild(this.buildHeader());
    this.panel.appendChild(this.buildTabs());

    const body = document.createElement("div");
    body.className = "help-panel__body";
    body.appendChild(this.buildHowToBody());
    body.appendChild(this.buildImportBody());
    body.appendChild(this.buildShortcutsBody());
    body.appendChild(this.buildSettingsBody());
    body.appendChild(this.buildAboutBody());
    this.panel.appendChild(body);

    this.overlay.appendChild(this.panel);
    this.parent.appendChild(this.overlay);
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement("div");
    header.className = "help-panel__header";

    const title = document.createElement("h2");
    title.className = "help-panel__title";
    title.innerHTML = `<img class="help-panel__brand-icon" src="${duckPng}" alt="" /> Bedevere Wise`;

    const close = document.createElement("button");
    close.className = "help-panel__close";
    close.title = "Close";
    close.textContent = "\u00D7";
    close.addEventListener("click", () => this.hide());

    header.appendChild(title);
    header.appendChild(close);
    return header;
  }

  private buildTabs(): HTMLElement {
    const tabs = document.createElement("div");
    tabs.className = "help-panel__tabs";

    const labels: Record<HelpPanelTab, string> = {
      howto: "How To",
      import: "Import",
      shortcuts: "Shortcuts",
      settings: "Settings",
      about: "About",
    };
    for (const id of TAB_ORDER) {
      const btn = this.makeTabButton(id, labels[id]);
      this.tabButtons.set(id, btn);
      tabs.appendChild(btn);
    }
    return tabs;
  }

  private makeTabButton(id: HelpPanelTab, label: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "help-panel__tab";
    btn.textContent = label;
    btn.addEventListener("click", () => this.setTab(id));
    return btn;
  }

  private buildHowToBody(): HTMLElement {
    const body = document.createElement("div");
    body.className = "help-panel__tab-body help-panel__tab-body--howto";
    this.tabBodies.set("howto", body);

    body.innerHTML = `
      <p class="help-panel__lead">
        \uD83D\uDC4B Welcome to <strong>Bedevere Wise</strong> &mdash; a local-first SQL data viewer.
      </p>

      <div class="help-panel__callout help-panel__callout--privacy">
        <div class="help-panel__callout-title">\uD83D\uDD12 Your data stays on your device</div>
        <p>
          All parsing and querying happens locally in your browser via <strong>DuckDB-WASM</strong>.
          No telemetry, no uploads, nothing crosses the network unless you explicitly fetch a remote file.
        </p>
      </div>

      <div class="help-panel__callout help-panel__callout--deps">
        <div class="help-panel__callout-title">\u2696\uFE0F Minimal dependencies</div>
        <p>
          Built on just two libraries: <a href="https://duckdb.org/docs/api/wasm/overview" target="_blank" rel="noopener noreferrer">DuckDB-WASM</a>
          (SQL engine) and <a href="https://codemirror.net/" target="_blank" rel="noopener noreferrer">CodeMirror 6</a> (editor).
          No frameworks, no analytics, no tracking.
        </p>
      </div>

      <h3 class="help-panel__section-title">Get started</h3>
      <ol class="help-panel__steps">
        <li><strong>Drop a file</strong> &mdash; CSV, TSV, JSON, Parquet, Excel, SAS, Stata, SPSS &mdash; or use the <em>Browse</em> button.</li>
        <li><strong>Try a SQL query</strong> &mdash; press <kbd>Ctrl</kbd>+<kbd>E</kbd> for the editor; autocomplete knows your tables and columns.</li>
        <li><strong>Save views &amp; queries</strong> &mdash; build up a workspace from the left panel.</li>
      </ol>

      <h3 class="help-panel__section-title">Try it now</h3>
      <p class="help-panel__hint">
        Don't have a file handy? Load a small demo to play around.
      </p>
      <button type="button" class="help-panel__sample-btn" data-action="load-sample">
        Load sample dataset (Palmer Penguins)
      </button>

      <h3 class="help-panel__section-title">Working with SQL</h3>
      <div class="help-panel__tutorial" data-tutorial></div>
    `;

    this.sampleButton = body.querySelector<HTMLButtonElement>("[data-action='load-sample']");
    this.sampleButton?.addEventListener("click", () => this.handleLoadSample());

    const tutorialHost = body.querySelector("[data-tutorial]")!;
    for (const node of PENGUINS_TUTORIAL) {
      tutorialHost.appendChild(this.buildTutorialNode(node));
    }

    return body;
  }

  private buildTutorialNode(node: TutorialNode): HTMLElement {
    switch (node.kind) {
      case "heading": {
        const h = document.createElement("h4");
        h.className = "help-panel__tutorial-heading";
        h.textContent = node.text;
        return h;
      }
      case "prose": {
        const p = document.createElement("p");
        p.className = "help-panel__tutorial-prose";
        p.innerHTML = node.html;
        return p;
      }
      case "tip": {
        const p = document.createElement("p");
        p.className = "help-panel__tip";
        p.innerHTML = `<strong>Tip:</strong> ${node.html}`;
        return p;
      }
      case "snippet":
        return this.buildTutorialSnippet(node.sql);
    }
  }

  private buildTutorialSnippet(sql: string): HTMLElement {
    const card = document.createElement("div");
    card.className = "help-panel__snippet help-panel__snippet--titleless";

    const head = document.createElement("div");
    head.className = "help-panel__snippet-head help-panel__snippet-head--titleless";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "help-panel__copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => this.handleCopy(sql, copyBtn));
    head.appendChild(copyBtn);

    const pre = document.createElement("pre");
    pre.className = "help-panel__snippet-code";
    const code = document.createElement("code");
    code.textContent = sql;
    pre.appendChild(code);

    card.appendChild(head);
    card.appendChild(pre);
    return card;
  }

  private async handleCopy(text: string, btn: HTMLButtonElement): Promise<void> {
    const ok = await this.copyToClipboard(text);
    if (ok) {
      const original = btn.textContent ?? "Copy";
      btn.textContent = "Copied!";
      btn.classList.add("help-panel__copy-btn--copied");
      window.setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("help-panel__copy-btn--copied");
      }, 1500);
    } else {
      this.options.onShowMessage?.("Copy failed", "error");
    }
  }

  private async copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through to legacy path
      }
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  private async handleLoadSample(): Promise<void> {
    if (!this.sampleButton) return;
    const original = this.sampleButton.textContent ?? "Load sample dataset";
    this.sampleButton.disabled = true;
    this.sampleButton.textContent = "Loading\u2026";
    try {
      await this.options.onLoadSampleDataset();
    } catch {
      // BedevereApp surfaces its own error; just restore button
      this.sampleButton.disabled = false;
      this.sampleButton.textContent = original;
    }
  }

  private buildImportBody(): HTMLElement {
    const body = document.createElement("div");
    body.className = "help-panel__tab-body help-panel__tab-body--import";
    this.tabBodies.set("import", body);

    const formats = this.options.supportedFormats ?? [];

    // Drop zone area
    const dropzone = document.createElement("div");
    dropzone.className = "help-panel__import-dropzone";
    dropzone.innerHTML = `
      <svg class="help-panel__import-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7,10 12,15 17,10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <h3 class="help-panel__import-title">Import Data</h3>
      <p class="help-panel__import-description">
        Drag files here, or use the buttons below.
      </p>
      <p class="help-panel__import-formats">
        Supported: ${formats.join(", ") || "CSV, TSV, JSON, Parquet, Excel, SAS, SPSS, Stata"}
      </p>
    `;

    // Scoped drag-drop handlers on the dropzone div
    const prevent = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    dropzone.addEventListener("dragenter", (e) => { prevent(e); dropzone.classList.add("help-panel__import-dropzone--active"); });
    dropzone.addEventListener("dragover", (e) => { prevent(e); dropzone.classList.add("help-panel__import-dropzone--active"); });
    dropzone.addEventListener("dragleave", (e) => { prevent(e); dropzone.classList.remove("help-panel__import-dropzone--active"); });
    dropzone.addEventListener("drop", (e) => {
      prevent(e);
      dropzone.classList.remove("help-panel__import-dropzone--active");
      const files = Array.from((e as DragEvent).dataTransfer?.files || []);
      if (files.length > 0) this.handleImportFiles(files);
    });

    body.appendChild(dropzone);

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "help-panel__import-actions";

    // Hidden file input
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = formats.join(",");
    fileInput.multiple = true;
    fileInput.style.display = "none";
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files.length > 0) {
        this.handleImportFiles(Array.from(fileInput.files));
        fileInput.value = "";
      }
    });
    body.appendChild(fileInput);

    const browseBtn = document.createElement("button");
    browseBtn.type = "button";
    browseBtn.className = "help-panel__import-btn";
    browseBtn.textContent = "Browse Files";
    browseBtn.addEventListener("click", () => fileInput.click());
    actions.appendChild(browseBtn);

    const folderBtn = document.createElement("button");
    folderBtn.type = "button";
    folderBtn.className = "help-panel__import-btn help-panel__import-btn--secondary";
    folderBtn.textContent = "Browse Folder";
    folderBtn.addEventListener("click", () => {
      this.options.onBrowseFolder?.();
      this.hide();
    });
    actions.appendChild(folderBtn);

    body.appendChild(actions);

    // Status area for inline feedback
    const status = document.createElement("div");
    status.className = "help-panel__import-status";
    status.dataset.importStatus = "";
    body.appendChild(status);

    return body;
  }

  private async handleImportFiles(files: File[]): Promise<void> {
    const statusEl = this.panel?.querySelector<HTMLElement>("[data-import-status]");
    if (statusEl) {
      statusEl.textContent = `Importing ${files.length} file${files.length > 1 ? "s" : ""}\u2026`;
      statusEl.className = "help-panel__import-status help-panel__import-status--loading";
    }
    try {
      await this.options.onFilesReceived?.(files);
      this.hide();
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = `Import failed: ${error instanceof Error ? error.message : "unknown error"}`;
        statusEl.className = "help-panel__import-status help-panel__import-status--error";
      }
    }
  }

  private buildShortcutsBody(): HTMLElement {
    const body = document.createElement("div");
    body.className = "help-panel__tab-body help-panel__tab-body--shortcuts";
    this.tabBodies.set("shortcuts", body);
    this.renderShortcutsInto(body);
    return body;
  }

  /**
   * Re-render the shortcuts tab body in place. Used after rebind / reset so
   * the updated keymap is reflected without closing the panel.
   */
  private renderShortcutsInto(body: HTMLElement): void {
    const scrollTop = body.scrollTop;
    body.innerHTML = "";

    const intro = document.createElement("p");
    intro.className = "help-panel__hint";
    intro.textContent = "Click a shortcut to rebind it. Esc cancels capture.";
    body.appendChild(intro);

    const entries = keymapService.getEntries();
    const byScope = new Map<string, KeymapEntry[]>();
    for (const e of entries) {
      if (!byScope.has(e.scope)) byScope.set(e.scope, []);
      byScope.get(e.scope)!.push(e);
    }

    for (const scope of SCOPE_ORDER) {
      const scopeEntries = byScope.get(scope);
      if (!scopeEntries || scopeEntries.length === 0) continue;

      const section = document.createElement("div");
      section.className = "help-panel__shortcuts-section";

      const title = document.createElement("h3");
      title.className = "help-panel__section-title";
      title.textContent = SCOPE_LABELS[scope] ?? scope;
      section.appendChild(title);

      const list = document.createElement("dl");
      list.className = "help-panel__shortcuts-list";
      for (const entry of scopeEntries) {
        list.appendChild(this.buildShortcutRow(entry));
      }

      // After the global/"App" section, slot in the Alt+1..9 jump. Handled
      // outside the keymap so not rebindable — show it read-only.
      if (scope === "global") {
        list.appendChild(this.buildStaticShortcutRow("Jump to tab N", "Alt+1 \u2026 Alt+9"));
      }

      section.appendChild(list);
      body.appendChild(section);
    }

    body.scrollTop = scrollTop;
  }

  /** Build a rebindable shortcut row for a KeymapEntry. */
  private buildShortcutRow(entry: KeymapEntry): HTMLElement {
    const row = document.createElement("div");
    row.className = "help-panel__shortcut-row help-panel__shortcut-row--rebindable";
    row.tabIndex = 0;

    const dt = document.createElement("dt");
    dt.className = "help-panel__shortcut-desc";
    dt.textContent = entry.description;

    const dd = document.createElement("dd");
    dd.className = "help-panel__shortcut-keys";

    this.renderShortcutKeys(dd, entry);

    row.appendChild(dt);
    row.appendChild(dd);

    const startCapture = () => this.beginCapture(entry, row, dd);
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".help-panel__reset-btn")) return;
      startCapture();
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startCapture();
      }
    });

    return row;
  }

  /** Build a read-only shortcut row (e.g. for shortcuts not in the keymap). */
  private buildStaticShortcutRow(description: string, keys: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "help-panel__shortcut-row help-panel__shortcut-row--static";

    const dt = document.createElement("dt");
    dt.className = "help-panel__shortcut-desc";
    dt.textContent = description;

    const dd = document.createElement("dd");
    dd.className = "help-panel__shortcut-keys";
    this.renderKeyTokens(dd, keys);

    row.appendChild(dt);
    row.appendChild(dd);
    return row;
  }

  /** Render the key area for a rebindable entry: tokens + optional reset btn. */
  private renderShortcutKeys(dd: HTMLElement, entry: KeymapEntry): void {
    dd.innerHTML = "";
    this.renderKeyTokens(dd, formatBinding(entry.binding));

    const def = keymapService.getDefaultBinding(entry.action);
    if (def && !bindingsEqual(def, entry.binding)) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "help-panel__reset-btn";
      reset.title = `Reset to default (${formatBinding(def)})`;
      reset.textContent = "\u21BA";
      reset.addEventListener("click", (e) => {
        e.stopPropagation();
        keymapService.setBinding(entry.action, def);
        const bodyEl = this.tabBodies.get("shortcuts");
        if (bodyEl) this.renderShortcutsInto(bodyEl);
      });
      dd.appendChild(reset);
    }
  }

  private renderKeyTokens(dd: HTMLElement, keys: string): void {
    const tokens = keys.split("+");
    tokens.forEach((token, i) => {
      const kbd = document.createElement("kbd");
      kbd.className = "help-panel__kbd";
      kbd.textContent = token;
      dd.appendChild(kbd);
      if (i < tokens.length - 1) {
        const sep = document.createElement("span");
        sep.className = "help-panel__kbd-sep";
        sep.textContent = "+";
        dd.appendChild(sep);
      }
    });
  }

  /**
   * Enter rebinding capture mode for a single shortcut. Swaps the row's key
   * display for a "Press keys\u2026" message, installs a capture-phase keydown
   * listener that records the next non-modifier combo, and either saves or
   * warns about a conflict.
   */
  private beginCapture(entry: KeymapEntry, row: HTMLElement, dd: HTMLElement): void {
    if (this.captureActive) return;
    this.captureActive = true;

    row.classList.add("help-panel__shortcut-row--capturing");
    dd.innerHTML = "";
    const prompt = document.createElement("span");
    prompt.className = "help-panel__capture";
    prompt.textContent = "Press keys\u2026 (Esc to cancel)";
    dd.appendChild(prompt);

    const restore = () => {
      row.classList.remove("help-panel__shortcut-row--capturing");
      this.renderShortcutKeys(dd, entry);
    };

    const cleanup = () => {
      document.removeEventListener("keydown", handler, { capture: true });
      this.captureActive = false;
    };

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Ignore pure modifier key presses; wait for the real key.
      if (e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") {
        return;
      }

      if (e.key === "Escape") {
        cleanup();
        restore();
        return;
      }

      const binding: KeyBinding = {
        key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
      };

      const conflict = keymapService
        .getEntries(entry.scope)
        .find((other) => other.action !== entry.action && matchesBinding(e, other.binding));

      if (conflict) {
        prompt.innerHTML = "";
        const txt = document.createElement("span");
        txt.textContent = `Conflicts with "${conflict.description}" \u2014 try another combo.`;
        prompt.appendChild(txt);
        prompt.classList.add("help-panel__capture--conflict");
        return;
      }

      keymapService.setBinding(entry.action, binding);
      cleanup();
      const bodyEl = this.tabBodies.get("shortcuts");
      if (bodyEl) this.renderShortcutsInto(bodyEl);
    };

    document.addEventListener("keydown", handler, { capture: true });
  }

  private buildSettingsBody(): HTMLElement {
    const body = document.createElement("div");
    body.className = "help-panel__tab-body help-panel__tab-body--settings";
    this.tabBodies.set("settings", body);

    // --- Theme ---
    body.appendChild(this.buildSettingsSection("Theme", (section) => {
      const seg = document.createElement("div");
      seg.className = "help-panel__segmented";
      const current = this.options.initialTheme ?? "auto";
      const opts: Array<{ value: "light" | "dark" | "auto"; label: string }> = [
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
        { value: "auto", label: "Auto" },
      ];
      for (const opt of opts) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "help-panel__segmented-btn";
        btn.textContent = opt.label;
        if (opt.value === current) btn.classList.add("help-panel__segmented-btn--active");
        btn.addEventListener("click", () => {
          for (const sibling of seg.querySelectorAll("button")) {
            sibling.classList.remove("help-panel__segmented-btn--active");
          }
          btn.classList.add("help-panel__segmented-btn--active");
          this.options.onThemeChange?.(opt.value);
        });
        seg.appendChild(btn);
      }
      section.appendChild(seg);
    }));

    // --- Copy format ---
    body.appendChild(this.buildSettingsSection("Copy format", (section) => {
      const current = this.options.getCopyOptions?.() ?? { delimiter: "tab" as const, includeHeader: true };

      const delimRow = document.createElement("div");
      delimRow.className = "help-panel__settings-row";
      const delimLabel = document.createElement("span");
      delimLabel.className = "help-panel__settings-label";
      delimLabel.textContent = "Delimiter";
      delimRow.appendChild(delimLabel);

      const delimSeg = document.createElement("div");
      delimSeg.className = "help-panel__segmented";
      const delims: Array<{ value: "tab" | "comma"; label: string }> = [
        { value: "tab", label: "Tab" },
        { value: "comma", label: "Comma" },
      ];
      for (const opt of delims) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "help-panel__segmented-btn";
        btn.textContent = opt.label;
        if (opt.value === current.delimiter) btn.classList.add("help-panel__segmented-btn--active");
        btn.addEventListener("click", () => {
          for (const sibling of delimSeg.querySelectorAll("button")) {
            sibling.classList.remove("help-panel__segmented-btn--active");
          }
          btn.classList.add("help-panel__segmented-btn--active");
          const latest = this.options.getCopyOptions?.() ?? { delimiter: "tab" as const, includeHeader: true };
          this.options.setCopyOptions?.({ delimiter: opt.value, includeHeader: latest.includeHeader });
        });
        delimSeg.appendChild(btn);
      }
      delimRow.appendChild(delimSeg);
      section.appendChild(delimRow);

      const headerRow = document.createElement("label");
      headerRow.className = "help-panel__settings-row help-panel__settings-row--checkbox";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = current.includeHeader;
      cb.addEventListener("change", () => {
        const latest = this.options.getCopyOptions?.() ?? { delimiter: "tab" as const, includeHeader: true };
        this.options.setCopyOptions?.({ delimiter: latest.delimiter, includeHeader: cb.checked });
      });
      const cbLabel = document.createElement("span");
      cbLabel.textContent = "Include header row";
      headerRow.appendChild(cb);
      headerRow.appendChild(cbLabel);
      section.appendChild(headerRow);
    }));

    // --- Reset keymap ---
    body.appendChild(this.buildSettingsSection("Reset keymap", (section) => {
      const hint = document.createElement("p");
      hint.className = "help-panel__hint";
      hint.textContent = "Revert every keyboard shortcut to its default binding.";
      section.appendChild(hint);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "help-panel__settings-btn";
      btn.textContent = "Reset keymap";
      btn.addEventListener("click", () => {
        this.options.onResetKeymap?.();
        const bodyEl = this.tabBodies.get("shortcuts");
        if (bodyEl) this.renderShortcutsInto(bodyEl);
        btn.textContent = "Keymap reset";
        btn.disabled = true;
        window.setTimeout(() => { btn.textContent = "Reset keymap"; btn.disabled = false; }, 1500);
      });
      section.appendChild(btn);
    }));

    // --- Clear all data ---
    body.appendChild(this.buildSettingsSection("Clear all data", (section) => {
      const hint = document.createElement("p");
      hint.className = "help-panel__hint";
      hint.textContent = "Delete every persisted setting, saved view, query bookmark, and cached table. Not undoable.";
      section.appendChild(hint);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "help-panel__settings-btn help-panel__settings-btn--danger";
      btn.textContent = "Clear all data";
      let armed = false;
      let armTimer: number | null = null;
      btn.addEventListener("click", async () => {
        if (!armed) {
          armed = true;
          btn.textContent = "Click again to confirm";
          btn.classList.add("help-panel__settings-btn--armed");
          armTimer = window.setTimeout(() => {
            armed = false;
            btn.textContent = "Clear all data";
            btn.classList.remove("help-panel__settings-btn--armed");
          }, 3000);
          return;
        }
        if (armTimer !== null) window.clearTimeout(armTimer);
        btn.disabled = true;
        btn.textContent = "Clearing\u2026";
        try {
          await this.options.onClearAllData?.();
          btn.textContent = "Cleared \u2014 reload the page";
          btn.classList.remove("help-panel__settings-btn--armed");
        } catch (err) {
          btn.textContent = `Failed: ${err instanceof Error ? err.message : "unknown"}`;
          btn.disabled = false;
          armed = false;
        }
      });
      section.appendChild(btn);
    }));

    return body;
  }

  private buildSettingsSection(title: string, fill: (section: HTMLElement) => void): HTMLElement {
    const section = document.createElement("div");
    section.className = "help-panel__settings-section";

    const h = document.createElement("h3");
    h.className = "help-panel__section-title";
    h.textContent = title;
    section.appendChild(h);

    fill(section);
    return section;
  }

  private buildAboutBody(): HTMLElement {
    const body = document.createElement("div");
    body.className = "help-panel__tab-body help-panel__tab-body--about";
    this.tabBodies.set("about", body);

    body.innerHTML = `
      <p class="help-panel__about-version">v${this.options.version}</p>
      <p class="help-panel__about-description">A local-first data viewer powered by DuckDB.</p>
      <div class="help-panel__about-section">
        <h3 class="help-panel__about-section-title">Dependencies</h3>
        <ul class="help-panel__about-deps">
          <li><a href="https://duckdb.org/docs/api/wasm/overview" target="_blank" rel="noopener noreferrer">DuckDB-WASM</a></li>
          <li><a href="https://codemirror.net/" target="_blank" rel="noopener noreferrer">CodeMirror 6</a></li>
        </ul>
      </div>
      <div class="help-panel__about-links">
        <a href="https://github.com/caerbannogwhite/bedevere-wise" target="_blank" rel="noopener noreferrer">GitHub</a>
        <span class="help-panel__about-separator">\u00B7</span>
        <a href="https://github.com/caerbannogwhite/bedevere-wise/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer">Changelog</a>
        <span class="help-panel__about-separator">\u00B7</span>
        <a href="https://github.com/caerbannogwhite/bedevere-wise/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>
      </div>
      <p class="help-panel__about-author">Made by <a href="https://github.com/caerbannogwhite" target="_blank" rel="noopener noreferrer">caerbannogwhite</a></p>
      <details class="help-panel__lore">
        <summary class="help-panel__lore-summary">Why a duck?</summary>
        <p class="help-panel__lore-body">
          Why is there a duck next to the name of a knight of the Round Table? Well, <i>logically</i>, you might think it's because
          the mighty DuckDB powers this application, and including references to it is wise and fair.<br>However, you would be at fault:
          the real reason for the duck is that Sir Bedevere the Wise is the one who can tell if a witch is such, thanks to just a duck.
        </p>
        <p class="help-panel__lore-body">
          <a href="https://www.youtube.com/watch?v=yp_l5ntikaU" target="_blank" rel="noopener noreferrer">https://www.youtube.com/watch?v=yp_l5ntikaU</a>
        </p>
      </details>
      <p class="help-panel__attribution">
        Duck icons created by <a href="https://www.flaticon.com/free-icons/duck" target="_blank" rel="noopener noreferrer" title="duck icons">Marz Gallery &mdash; Flaticon</a>.
      </p>
    `;

    return body;
  }
}

function bindingsEqual(a: KeyBinding, b: KeyBinding): boolean {
  return (
    a.key === b.key &&
    (a.ctrl ?? false) === (b.ctrl ?? false) &&
    (a.shift ?? false) === (b.shift ?? false) &&
    (a.alt ?? false) === (b.alt ?? false)
  );
}
