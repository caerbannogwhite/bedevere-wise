import duckPng from "@/assets/duck.png?url";

export type HelpPanelTab = "howto" | "about";

export interface HelpPanelOptions {
  version: string;
  onLoadSampleDataset: () => Promise<void> | void;
  onShowMessage?: (msg: string, type: "info" | "success" | "error") => void;
}

interface SnippetDef {
  title: string;
  sql: string;
}

const STATS_DUCK_SNIPPETS: SnippetDef[] = [
  {
    title: "One-sample t-test",
    sql: "SELECT ttest_1samp(v3) FROM measurements;",
  },
  {
    title: "Two-sample t-test (Welch's)",
    sql: "SELECT ttest_2samp(group_a, group_b) FROM experiment;",
  },
  {
    title: "Paired t-test",
    sql: "SELECT ttest_paired(before, after) FROM patients;",
  },
  {
    title: "Mann-Whitney U test",
    sql: "SELECT mann_whitney_u(group_a, group_b) FROM experiment;",
  },
  {
    title: "Read SAS / SPSS / Stata files",
    sql: "SELECT * FROM read_stat('data.sas7bdat');",
  },
  {
    title: "Group-by analysis",
    sql:
      "SELECT id3,\n" +
      "       (ttest_1samp(v3)).t_statistic,\n" +
      "       (ttest_1samp(v3)).p_value\n" +
      "FROM measurements\n" +
      "GROUP BY id3;",
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
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.hide();
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
    document.addEventListener("keydown", this.onKeyDown);
  }

  public hide(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    this.overlay?.remove();
    this.overlay = null;
    this.panel = null;
    this.tabButtons.clear();
    this.tabBodies.clear();
    this.sampleButton = null;
  }

  public isOpen(): boolean {
    return this.overlay !== null;
  }

  public setTab(tab: HelpPanelTab): void {
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

    const howToBtn = this.makeTabButton("howto", "How To");
    const aboutBtn = this.makeTabButton("about", "About");

    this.tabButtons.set("howto", howToBtn);
    this.tabButtons.set("about", aboutBtn);

    tabs.appendChild(howToBtn);
    tabs.appendChild(aboutBtn);
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

      <h3 class="help-panel__section-title">Statistical examples</h3>
      <p class="help-panel__hint">
        Bedevere ships with the <a href="https://github.com/caerbannogwhite/the-stats-duck" target="_blank" rel="noopener noreferrer">Stats Duck</a>
        DuckDB extension, which adds hypothesis tests and readers for SAS, SPSS, and Stata.
        The snippets below are <em>patterns</em> &mdash; the table names are placeholders for your own data.
      </p>
      <div class="help-panel__snippets" data-snippets></div>

      <p class="help-panel__footer-note">
        See the <a href="https://github.com/caerbannogwhite/the-stats-duck" target="_blank" rel="noopener noreferrer">Stats Duck README</a>
        for the full reference.
      </p>
    `;

    this.sampleButton = body.querySelector<HTMLButtonElement>("[data-action='load-sample']");
    this.sampleButton?.addEventListener("click", () => this.handleLoadSample());

    const snippetsHost = body.querySelector("[data-snippets]")!;
    for (const snippet of STATS_DUCK_SNIPPETS) {
      snippetsHost.appendChild(this.buildSnippet(snippet));
    }

    return body;
  }

  private buildSnippet(def: SnippetDef): HTMLElement {
    const card = document.createElement("div");
    card.className = "help-panel__snippet";

    const head = document.createElement("div");
    head.className = "help-panel__snippet-head";

    const title = document.createElement("span");
    title.className = "help-panel__snippet-title";
    title.textContent = def.title;

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "help-panel__copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => this.handleCopy(def.sql, copyBtn));

    head.appendChild(title);
    head.appendChild(copyBtn);

    const pre = document.createElement("pre");
    pre.className = "help-panel__snippet-code";
    const code = document.createElement("code");
    code.textContent = def.sql;
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
      <p class="help-panel__attribution">
        Duck icons created by <a href="https://www.flaticon.com/free-icons/duck" target="_blank" rel="noopener noreferrer" title="duck icons">Marz Gallery &mdash; Flaticon</a>.
      </p>
    `;

    return body;
  }
}
