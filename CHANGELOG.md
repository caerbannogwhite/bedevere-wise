# Changelog

## v0.9 (in development)

- [Feature] **stats_duck plot rendering (Phase 1).** `VISUALIZE … DRAW <mark>` queries detected at dispatch time, routed past the result-table wrapper so stats_duck's parser-extension fires. The returned `(spec, layer_sqls)` row is fanned out: each layer SQL is run via DuckDB-WASM, the rows are inlined into a Vega-Lite `datasets` block, and vega-embed renders the chart in a new ChartTab alongside dataset tabs. Theme-aware (re-embeds on `.theme` flip with Tokyonight-flavoured config). vega-embed is code-split — no bundle hit for users who never plot.
- [Feature] **Non-SELECT queries.** `CREATE TABLE`, `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `PRAGMA`, `COPY`, `EXPORT`, `SET`, transactions: all execute directly without the `CREATE OR REPLACE TABLE result_<n> AS (…)` wrap. The wrap previously corrupted DDL/DML and silently bypassed parser extensions like stats_duck's VISUALIZE.
- [Feature] **`.alias <dataset> <new>`** — shell command for renaming a dataset/table via DuckDB `ALTER TABLE … RENAME` (migrated from the deprecated palette).
- [Enhanced] Result tables now use friendly `result_1`, `result_2`, … names instead of `query_result_<huge-timestamp>`. Type-able in JOINs by hand; renameable via `.alias result_1 mydata` (which calls DuckDB's real ALTER TABLE so existing references keep working).
- [Bug-fix] Theme flip now repaints the spreadsheet immediately. The module-level theme-color cache was racy with the body-class MutationObserver — the listener could fire before the cache invalidator, baking stale colors into each visualizer's options. Now the listener invalidates the cache itself before recomputing.
- [Removed] **CommandPalette (Ctrl+Shift+P).** Deprecated in 0.8; gone in 0.9. Every palette-only command was either covered by an existing shell command or migrated (`.alias`).
- [Removed] **View storage.** `.view save|drop`, `ViewManager`, and the `bedevere_views` localStorage key are gone. Saved views were unrecoverable across page reloads (source tables vanish), producing `worker_dispatcher` cascades on every refresh. Saved queries (`.query save`) cover the persist-my-SQL workflow; raw `CREATE VIEW` SQL works in-session now that non-SELECT queries are allowed.
- [Removed] **GitHub Pages deploy workflow.** `.github/workflows/deploy.yml` removed. Cloudflare Workers Builds (custom domain `bedeverewise.app`) is now the only deploy target.

## v0.8-from-the-castle-of-camelot

- [Feature] Dot-command shell hosted in the always-visible bar above the spreadsheet. Lines starting with `.` dispatch through a unified CommandRegistry; anything else runs as DuckDB SQL. History walks Up/Down and persists across sessions (capped at 200 lines).
- [Feature] `CommandRegistry` — the single source of truth for every verb. Palette, keymap, and shell all resolve through it.
- [Feature] Shell commands: `.help [name]`, `.how-to`, `.shortcuts`, `.feedback`, `.about`, `.tables`, `.columns [name]` (defaults to active tab), `.import [--folder]`, `.open <name>` (matches any Datasets-tree leaf, imports if needed), `.close [name | --all]`, `.theme light|dark|auto`, `.tab next|prev|N`, `.settings [key=value]` (opens Settings tab when no args), `.view save|drop <name>`, `.query save <name>`, `.export <csv|tsv|html|markdown>` (copies to clipboard AND downloads `<dataset>.<ext>`), `.clear`, plus shell shortcuts for global keymap actions (`.panel`, `.sql`, `.fullscreen`, `.palette`, `.focus`).
- [Feature] CommandBar autocomplete: command names complete on dot-prefix; positional arguments complete from each parameter's `options()` thunk (e.g. `.open ` lists Datasets-tree leaves, `.theme ` offers `light/dark/auto`). Tab completes, Up/Down navigate, Esc dismisses.
- [Feature] Help panel gains a Commands tab — registry-driven listing grouped by category. `.help` opens it instead of dumping a multi-screen manual into the status-bar tooltip.
- [Feature] Keybindings: `Ctrl+/` toggles the help panel; `` Ctrl+` `` focuses the shell input.
- [Feature] Tokyonight re-skin: Vim-flavoured palette (Day light / Storm dark) exposed via CSS custom properties; theme switching is a body-class flip with no SCSS recompile.
- [Feature] Spreadsheet renderer Phase A: HiDPI-sharp glyphs and a single-pass grid pipeline.
- [Feature] In-app feedback form (HelpPanel → Feedback) backed by a Cloudflare Worker + D1 store; `mailto:contact@bedeverewise.app` fallback for deployments without the worker.
- [Feature] Deploy story: Cloudflare Workers Builds (recommended) + GitHub Pages, custom domain `bedeverewise.app`, DuckDB-WASM loaded from jsDelivr to keep the bundle slim.
- [Enhanced] Global-scope keymap actions (`app.togglePanel`, `app.toggleSqlEditor`, `tabs.next`, `tabs.prev`, etc.) resolve via `commandRegistry.run(action)` instead of hand-maintained switch statements in three callers.
- [Enhanced] Spreadsheet-scope keymap actions (`spreadsheet.moveUp`, `spreadsheet.copy`, etc.) also unify through the registry, routing to the active tab's `SpreadsheetVisualizer`.
- [Enhanced] CommandBar is always visible — reachable before the first dataset is imported so `.import` / `.help` work from a cold start. SqlEditor input also routes through the dot-command dispatcher (a `.command` typed there + Ctrl+Enter behaves the same as in the CommandBar).
- [Enhanced] `.sql` toggle now also focuses the SQL editor; `.close --all` closes every open dataset.
- [Enhanced] Status-bar version chip uses dedicated `--version-bg` / `--version-fg` tokens (the light-theme yellow was muddy as a fill); the margin between version and adjacent message chips was dropped so success/error chips sit flush.
- [Enhanced] Suggestions dropdown anchored to a wrapper around the input (`left: 0` / `right: 0`) instead of magic pixel offsets — aligns regardless of prompt or font.
- [Bug-fix] `.columns` uses `information_schema.columns` instead of `DESCRIBE` (DuckDB's `DESCRIBE` can't appear inside a `CREATE TABLE … AS (…)` wrapper).
- [Deprecated] CommandPalette (`Ctrl+Shift+P`) is flagged for removal in 0.9. It keeps working in 0.8, backed by the new registry.
- [Removed] Duplicate palette entries `view.toggleLeftPanel` and `sql.toggleEditor` (superseded by `app.togglePanel` / `app.toggleSqlEditor`).

## v0.7-son-of-uther-pendragon

- [Feature] Inspectable STRUCT / LIST / MAP / JSON / UNION cells with a key/value popover that auto-opens as the selection lands on a complex cell (respects Esc dismissal)
- [Feature] Query execution time shown as a status-bar chip (⏱ for success / ✖ for failures) with smart unit switching (ms / s / m s)
- [Feature] Loading feedback for file and folder imports — per-file progress messages and an aggregated success / partial / failure summary at the end of a batch
- [Feature] Settings tab exposes date, datetime, number, and display preferences (decimal places, thousands separator, minimum column width, max chars per cell); preferences persist across reloads
- [Feature] Configurable keymap with a rebind UI and a Reset keymap action
- [Feature] Tab-switch keyboard shortcuts and copy-format preferences (delimiter, include-header)
- [Feature] Help panel SQL tutorial keyed on the Penguins sample dataset
- [Enhanced] Cells that overflow their column now render an ellipsis instead of horizontally squeezed glyphs
- [Enhanced] Columns keep their content-derived width instead of stretching to fill the viewport
- [Enhanced] Type-aware Arrow unwrap; DECIMAL, nested-struct, and map payloads render correctly
- [Enhanced] Arrow keys no longer move cell selection while typing in an input
- [Bug-fix] Date / datetime format presets now honour the literal pattern (previously all presets produced identical output because Intl.DateTimeFormat ignored property order)
- [Bug-fix] Numeric format settings actually apply (previously the options bag was stringified to "[object Object]" and discarded)
- [Bug-fix] Cell cache TTL was 1 minute despite a "5 minutes" comment; corrected to 5 minutes
- [Renamed] MultiDatasetVisualizer → TabManager
- [Chore] Consolidated `escapeHtml` into `src/utils/html.ts`; removed unused event-system types, container-size constants, and a broken export-dataset stub

## v0.6-it-is-i

- [Feature] DuckDB-WASM data backend replacing the previous in-memory engine
- [Feature] SQL editor with CodeMirror 6, syntax highlighting, and schema-aware autocomplete
- [Feature] Pluggable file import: CSV, TSV, JSON, Parquet, Excel (xlsx/xls), SAS, Stata, SPSS
- [Feature] Folder scanning via File System Access API with file-tree browser
- [Feature] Column filtering (include/exclude values, numeric/temporal ranges)
- [Feature] Persistence: saved views, query bookmarks, and app settings (localStorage)
- [Feature] Configurable keybindings via KeymapService
- [Feature] Table aliases (ALTER TABLE RENAME via AliasManager)
- [Feature] About panel with dependency and version info
- [Enhanced] Expanded DataType system: 30+ DuckDB types with predicates and normalization
- [Enhanced] Per-type column stats (numeric histograms, temporal ranges, boolean/categorical counts)
- [Enhanced] StatusBar message popover with severity styling and click-to-expand details
- [Enhanced] ControlPanel replaces DatasetPanel: accordion layout with resizable panel
- [Enhanced] CommandBar replaces CellValueBar; cell info moved to status bar
- [Enhanced] DragDropZone supports multi-file drops and browse-folder split button
- [Enhanced] Global scrollbar styling matching the canvas theme
- [Bug-fix] Fixed copy range when selection is dragged upward or leftward
- [Bug-fix] NULL display before numeric coercion (was showing 0 or 1970-01-01)
- Renamed from Brian to Bedevere Wise

## v0.5-who-goes-there

- [Feature] Implemented commands with parameters in Command Palette
- [Feature] Export selection commands moved from Context Menu to Command Palette
- [Enhanced] Cell and column selection behavior
- [Enhanced] Added version information to Status Bar
- [Bug-fix] Fixed dataset and selection items in Status Bar

## v0.4-halt

- [Feature] Added Command Palette for improved interactivity
- [Feature] Added drag and drop support for file upload
- [Feature] Added Status Bar
- [Feature] Added Cell Value Bar
- [Feature] Added values distribution visualization in the stats panel
- [Enhanced] Cell styling and formatting
- [Enhanced] Zooming added
- [Enhanced] New event handling system
- [Bug-fix] Fixed scrolling and column selection issues

## v0.3-guard

- [Feature] Multi-dataset support: visualize multiple datasets in different tabs
- [Feature] Export selection menu: CSV, TSV, HTML and Markdown
- [Feature] DataProvider interface updated to include metadata
- [Enhanced] Column stats visualization
- [Bug-fix] Fixed scrolling and boundaries issues

## v0.2-whoa-there

- [Feature] Added a comprehensive Stats Panel for enhanced data insights
- [Feature] Introduced cell selection functionality for improved interactivity
- [Bug-fix] Enhanced scrolling performance and responsiveness
- [Bug-fix] Fixed issues with column hovering and selection for a smoother user experience

## v0.1-arthur

- Initial release
