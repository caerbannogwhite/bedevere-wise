# Changelog

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
