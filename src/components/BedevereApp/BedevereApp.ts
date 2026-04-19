import { TabManager } from "../TabManager";
import { ControlPanel } from "../ControlPanel";
import { StatusBar } from "../StatusBar";
import { HelpPanel } from "../HelpPanel";
import { CommandPalette } from "../CommandPalette/CommandPalette";
import penguinsCsv from "@/assets/samples/penguins.csv?raw";
import { SpreadsheetOptions } from "../SpreadsheetVisualizer/types";
import { DataProvider } from "../../data/types";
import { FocusManager } from "./FocusManager";
import { EventDispatcher } from "./EventDispatcher";
import { EventHandler } from "./types";
import { DatasetInfo } from "../ControlPanel/ControlPanel";
import { exportAsHTML, exportAsMarkdown, exportAsText } from "./ExportHub";
import { DuckDBService } from "@/data/DuckDBService";
import { ViewManager } from "@/data/ViewManager";
import { PersistenceService, persistenceService } from "@/data/PersistenceService";
import { keymapService } from "@/data/KeymapService";
import { FileImportService } from "@/data/FileImportService";
import { DuckDBExtensionLoader } from "@/data/DuckDBExtensionLoader";
import { ExcelFormatHandler } from "@/data/formats/ExcelFormatHandler";
import { StatFormatHandler } from "@/data/formats/StatFormatHandler";
import { AliasManager } from "@/data/AliasManager";

export type BedevereAppTheme = "light" | "dark" | "auto";

export type BedevereAppMessageType = "info" | "warning" | "error" | "success";

export interface BedevereAppOptions {
  spreadsheetOptions?: SpreadsheetOptions;
  theme?: BedevereAppTheme;
  showLeftPanel?: boolean;
  statusBarVisible?: boolean;
  commandPaletteEnabled?: boolean;
  debugMode?: boolean;
}

export class BedevereApp implements EventHandler {
  private container: HTMLElement;
  private mainContainer!: HTMLElement;
  private leftPanelContainer!: HTMLElement;
  private spreadsheetContainer!: HTMLElement;

  private duckDBService!: DuckDBService;
  private commandPalette!: CommandPalette;
  private leftPanel!: ControlPanel;
  private tabManager!: TabManager;
  private statusBar!: StatusBar;
  private helpPanel!: HelpPanel;

  private options: BedevereAppOptions;
  private theme: BedevereAppTheme = "dark";
  private version: string;

  // Persistence, views, and import
  private persistenceService: PersistenceService;
  private viewManager: ViewManager;
  private fileImportService: FileImportService;
  private extensionLoader: DuckDBExtensionLoader;
  private aliasManager: AliasManager;

  // Event system
  private focusManager: FocusManager;
  private eventDispatcher: EventDispatcher;

  constructor(parent: HTMLElement, duckDBService: DuckDBService, version: string, options: BedevereAppOptions = {}) {
    this.options = {
      theme: "dark",
      showLeftPanel: true,
      statusBarVisible: true,
      commandPaletteEnabled: true,
      ...options,
    };

    this.container = document.createElement("div");
    this.container.className = "bedevere-app";
    this.setupTheme();

    this.duckDBService = duckDBService;
    this.version = version;

    // Initialize persistence, view management, and import service
    this.persistenceService = persistenceService;
    this.viewManager = new ViewManager(duckDBService, this.persistenceService);
    this.extensionLoader = new DuckDBExtensionLoader(duckDBService);
    this.fileImportService = new FileImportService(duckDBService);
    this.aliasManager = new AliasManager(duckDBService);

    // Initialize event system
    this.focusManager = new FocusManager({ debugMode: options.debugMode || false });
    this.eventDispatcher = new EventDispatcher(this.focusManager, { debugMode: options.debugMode || false });

    this.createLayout();
    this.setupComponents();
    this.registerCommands();
    this.setupEventSystem();

    parent.appendChild(this.container);
  }

  public async initAsync(): Promise<void> {
    // Try loading DuckDB extensions for additional file format support.
    // Probe queries verify the function actually works in WASM (catches runtime crashes).
    await this.extensionLoader.tryLoad("excel", undefined, [
      "SELECT * FROM read_xlsx('__probe_nonexistent__.xlsx') LIMIT 0",
    ]);

    // Stats file formats: load stats_duck from its published extension repository
    await this.extensionLoader.tryLoad("stats_duck", "https://caerbannogwhite.github.io/the-stats-duck");

    // Register extension-based handlers (they self-check if extension loaded)
    this.fileImportService.register(new ExcelFormatHandler(this.extensionLoader));
    this.fileImportService.register(new StatFormatHandler(this.extensionLoader));

    // Restore saved views
    await this.viewManager.initialize();
    this.leftPanel?.refreshViews();

    // Restore app settings
    const settings = this.persistenceService.loadAppSettings();
    if (settings.theme && settings.theme !== "auto") {
      this.setTheme(settings.theme);
    }
    if (settings.panelMinimized && this.leftPanel && !this.leftPanel.getIsMinimized()) {
      this.leftPanel.toggleMinimize();
    }

    if (!settings.hasSeenOnboarding) {
      this.helpPanel.show("howto");
      settings.hasSeenOnboarding = true;
      this.persistenceService.saveAppSettings(settings);
    } else {
      this.helpPanel.show("import");
    }
  }

  // Public API methods
  public async addDataset(dataset: DataProvider): Promise<void> {
    this.leftPanel.addDataset(dataset);
    this.updateStatusBarDatasetInfo();
    this.updateFocusAfterDatasetChange();
  }

  // Event system access methods
  public getEventDispatcher(): EventDispatcher {
    return this.eventDispatcher;
  }

  public getFocusManager(): FocusManager {
    return this.focusManager;
  }

  public setTheme(theme: "light" | "dark"): void {
    this.container.classList.remove(`bedevere-app--${this.theme}`);
    document.body.classList.remove(`theme-${this.theme}`);

    this.theme = theme;
    this.container.classList.add(`bedevere-app--${this.theme}`);
    document.body.classList.add(`theme-${this.theme}`);

    // Persist theme setting
    const settings = this.persistenceService.loadAppSettings();
    settings.theme = theme;
    this.persistenceService.saveAppSettings(settings);
  }

  public showMessage(
    message: string,
    type: BedevereAppMessageType = "info",
    options?: import("../StatusBar/StatusBar").MessageOptions,
  ): void {
    this.statusBar?.showMessage(message, type, options);
  }

  public destroy(): void {
    // Clean up event system
    this.eventDispatcher.removeGlobalEventHandler(this);
    this.focusManager.clearFocus();
    this.focusManager.clearFocusStack();

    this.statusBar?.destroy();
    this.commandPalette?.destroy();
    this.leftPanel?.destroy();

    this.container.remove();
  }

  // EventHandler interface implementation
  public async handleKeyDown(e: KeyboardEvent): Promise<boolean> {
    // Alt+1..9 jumps directly to tab N. Handled outside the keymap to avoid
    // nine near-identical entries — see tabs.next / tabs.prev in the keymap
    // for the rebindable cyclical shortcuts.
    if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      this.tabManager.switchToTabByIndex(Number(e.key) - 1);
      return true;
    }

    const action = keymapService.matchEvent(e, "global");
    if (action) {
      e.preventDefault();
      switch (action) {
        case "app.togglePanel":      this.toggleControlPanel(); break;
        case "app.commandPalette":   this.commandPalette?.show(); break;
        case "app.toggleSqlEditor":  this.toggleSqlEditor(); break;
        case "app.toggleFullscreen": this.toggleFullscreen(); break;
        case "tabs.next":            this.tabManager.switchToNextTab(); break;
        case "tabs.prev":            this.tabManager.switchToPreviousTab(); break;
      }
      return true;
    }

    return false;
  }

  public async handleResize(_e: Event): Promise<boolean> {
    this.updateDimensions();
    return true;
  }

  private createLayout(): void {
    // Main container (excluding status bar)
    this.mainContainer = document.createElement("div");
    this.mainContainer.className = "bedevere-app__main";

    // Dataset panel container
    this.leftPanelContainer = document.createElement("div");
    this.leftPanelContainer.className = "bedevere-app__control-panel";

    // Spreadsheet container
    this.spreadsheetContainer = document.createElement("div");
    this.spreadsheetContainer.className = "bedevere-app__spreadsheet";

    this.mainContainer.appendChild(this.leftPanelContainer);
    this.mainContainer.appendChild(this.spreadsheetContainer);

    this.container.appendChild(this.mainContainer);
  }

  private setupComponents(): void {
    // Status bar
    if (this.options.statusBarVisible) {
      this.statusBar = new StatusBar(this.container, this.version);
      this.statusBar.setOnCommandCallback((command) => this.executeCommand(command));
      this.statusBar.setSpreadsheetOptions(this.options.spreadsheetOptions ?? {});
    }

    // Help panel (mounted on body so it overlays the entire app)
    this.helpPanel = new HelpPanel(document.body, {
      version: this.version,
      onLoadSampleDataset: () => this.loadSampleDataset(),
      onShowMessage: (msg, type) => this.showMessage(msg, type),
      onBrowseFolder: () => this.leftPanel?.openFolderPicker(),
      onFilesReceived: (files) => this.leftPanel?.addFilesFromDrop(files, true),
      supportedFormats: this.fileImportService.getSupportedExtensions(),
      initialTheme: this.persistenceService.loadAppSettings().theme ?? "auto",
      onThemeChange: (theme) => {
        const resolved = theme === "auto" ? this.detectTheme() : theme;
        this.setTheme(resolved);
        // setTheme persists the resolved value; re-save to preserve "auto"
        // intent so reloads keep following OS preference.
        const s = this.persistenceService.loadAppSettings();
        s.theme = theme;
        this.persistenceService.saveAppSettings(s);
      },
      onResetKeymap: () => keymapService.resetToDefaults(),
      onClearAllData: () => this.persistenceService.clearAll(),
      getCopyOptions: () => {
        const s = this.persistenceService.loadAppSettings();
        return {
          delimiter: s.copyDelimiter ?? "tab",
          includeHeader: s.copyIncludeHeader ?? true,
        };
      },
      setCopyOptions: (opts) => {
        const s = this.persistenceService.loadAppSettings();
        s.copyDelimiter = opts.delimiter;
        s.copyIncludeHeader = opts.includeHeader;
        this.persistenceService.saveAppSettings(s);
      },
    });
    this.statusBar?.setOnHelpClickCallback(() => this.helpPanel.show("howto"));

    // Command palette
    if (this.options.commandPaletteEnabled) {
      this.commandPalette = new CommandPalette(this.container, "command-palette");
      this.commandPalette.setEventDispatcher(this.eventDispatcher);
      this.eventDispatcher.registerComponent(this.commandPalette);
    }

    // Calculate dimensions
    this.updateDimensions();

    // Multi-dataset visualizer
    this.tabManager = new TabManager(this.spreadsheetContainer, this.options.spreadsheetOptions);

    // Initialize SQL editor within the multi-dataset visualizer
    this.tabManager.initSqlEditor(this.duckDBService);

    // Set event dispatcher on multi-dataset visualizer
    this.tabManager.setEventDispatcher(this.eventDispatcher);
    this.setOnCloseTabCallback();
    this.setOnCellSelectionCallback();

    // Surface SQL query errors in status bar
    this.tabManager.setOnQueryErrorCallback((error) => {
      this.showMessage(error.message, "error");
    });

    // Dataset panel
    if (this.options.showLeftPanel) {
      this.leftPanel = new ControlPanel(this.leftPanelContainer, this.tabManager);
      this.setOnSelectDatasetCallback();

      // Move column stats into left panel
      this.tabManager.setColumnStatsParent(this.leftPanel.getColumnStatsContainer());

      // Auto-expand column stats accordion when a column is selected
      this.tabManager.getStatsVisualizer().setOnShowStatsCallback(() => {
        this.leftPanel.expandSection("column-stats");
        if (this.leftPanel.getIsMinimized()) {
          this.leftPanel.toggleMinimize();
        }
      });

      // Wire services to panel
      this.leftPanel.setFileImportService(this.fileImportService);
      this.leftPanel.setOnAliasChangeCallback(async (tableName, alias) => {
        try {
          await this.aliasManager.setAlias(tableName, alias);
          this.showMessage(`Alias "${alias}" set for "${tableName}"`, "success");
          // Force SQL autocomplete to pick up the new name
          this.tabManager.getSqlEditor()?.refreshSchema?.();
        } catch (error) {
          this.showMessage(`Failed to set alias: ${error instanceof Error ? error.message : "unknown error"}`, "error");
        }
      });
      this.leftPanel.setViewManager(this.viewManager);
      this.leftPanel.setPersistenceService(this.persistenceService);
      this.leftPanel.setOnShowMessageCallback((msg, type, options) =>
        this.showMessage(msg, type, options),
      );
      this.leftPanel.setOnOpenQueryCallback((sql) => {
        const editor = this.tabManager.getSqlEditor();
        if (editor) {
          editor.setQuery(sql);
          editor.expand();
        }
      });

      // Handle panel toggle
      this.leftPanel.setOnToggleCallback((isMinimized) => {
        this.container.classList.toggle("bedevere-app--panel-minimized", isMinimized);
        this.updateDimensions();

        // Persist panel state
        const settings = this.persistenceService.loadAppSettings();
        settings.panelMinimized = isMinimized;
        this.persistenceService.saveAppSettings(settings);
      });

      // Re-sync layout now that persisted panel width has been restored
      this.updateDimensions();
    }

    // Listen for dataset changes
    this.setupDatasetListeners();
  }

  private setupTheme(): void {
    this.theme = this.options.theme === "auto" ? this.detectTheme() : this.options.theme || "dark";
    this.container.classList.add(`bedevere-app--${this.theme}`);
    document.body.classList.add(`theme-${this.theme}`);
  }

  private detectTheme(): "light" | "dark" {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  private setupEventSystem(): void {
    // Register BedevereApp as a global event handler
    this.eventDispatcher.addGlobalEventHandler(this);

    // Theme change detection
    if (this.options.theme === "auto") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        this.setTheme(e.matches ? "dark" : "light");
      });
    }

    // Body-level drag-drop: users can drop files anywhere on the page as a
    // shortcut, without opening Help → Import. The files route to ControlPanel
    // through the same addFilesFromDrop pipeline.
    const preventDrag = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    document.body.addEventListener("dragenter", preventDrag);
    document.body.addEventListener("dragover", preventDrag);
    document.body.addEventListener("dragleave", preventDrag);
    document.body.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0 && this.leftPanel) {
        this.leftPanel.addFilesFromDrop(files, true).catch((err) => {
          this.showMessage(`Failed to import: ${err instanceof Error ? err.message : "unknown error"}`, "error");
        });
      }
    });
  }

  private updateDimensions(): void {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const statusBarHeight = this.options.statusBarVisible ? 26 : 0;
    const panelWidth = this.options.showLeftPanel ? (this.leftPanel?.getWidth() ?? 320) : 0;

    // Update main container
    this.mainContainer.style.height = `${windowHeight - statusBarHeight}px`;
    this.mainContainer.style.paddingBottom = `${statusBarHeight}px`;

    // Sync the outer panel container width (flex layout) with the inner panel width
    if (this.leftPanelContainer) {
      // Disable transition during resize drag for instant feedback
      if (this.leftPanel?.isResizing) {
        this.leftPanelContainer.style.transition = "none";
      } else {
        this.leftPanelContainer.style.transition = "";
      }
      this.leftPanelContainer.style.width = `${panelWidth}px`;
      this.leftPanelContainer.style.minWidth = `${panelWidth}px`;
    }

    // Update spreadsheet container
    const contentWidth = windowWidth - panelWidth;
    this.spreadsheetContainer.style.width = `${contentWidth}px`;
    this.spreadsheetContainer.style.height = `${windowHeight - statusBarHeight}px`;

    // Trigger resize on the multi-dataset visualizer to update the active spreadsheet
    if (this.tabManager) {
      this.tabManager.resize().catch(console.error);
    }
  }

  private setupDatasetListeners(): void {
    // Override closeDataset to update panel state
    const originalCloseDataset = this.tabManager.closeDataset.bind(this.tabManager);
    this.tabManager.closeDataset = (id: string) => {
      originalCloseDataset(id);
      this.leftPanel?.markDatasetAsUnloaded(id);
      this.updateStatusBarDatasetInfo();
      this.updateFocusAfterDatasetChange();
    };

    // Listen for dataset switches (this would require extending TabManager)
    // For now, we'll update status bar when datasets are added
  }

  private updateFocusAfterDatasetChange(): void {
    // Set focus to the active dataset's spreadsheet, or clear focus if no active dataset
    const activeDatasetTab = this.tabManager.getActiveDatasetTab();
    if (activeDatasetTab) {
      this.eventDispatcher.setFocus(`spreadsheet-${activeDatasetTab.metadata.name}`);
    } else {
      this.focusManager.clearFocus();
    }
  }

  private registerCommands(): void {
    if (!this.commandPalette) return;

    // View commands
    this.commandPalette.registerCommand({
      id: "help.show",
      title: "Show Help",
      description: "Open the Help panel",
      category: "View",
      execute: () => this.helpPanel.show("howto"),
    });

    this.commandPalette.registerCommand({
      id: "view.toggleLeftPanel",
      title: "Toggle Left Panel",
      description: "Show or hide the left panel",
      category: "View",
      execute: () => this.toggleControlPanel(),
    });

    this.commandPalette.registerCommand({
      id: "view.toggleTheme",
      title: "Toggle Theme",
      description: "Switch between light and dark themes",
      category: "View",
      execute: () => this.toggleTheme(),
    });

    // Dataset commands
    this.commandPalette.registerCommand({
      id: "dataset.executeQuery",
      title: "Execute Query",
      description: "Execute a query on the currently active dataset",
      category: "Dataset",
      parameters: [
        {
          name: "query",
          type: "string",
          description: "The query to execute",
          required: true,
        },
      ],
      execute: (params?: Record<string, any>) => this.executeQuery(params?.query),
    });

    this.commandPalette.registerCommand({
      id: "dataset.open",
      title: "Open Dataset",
      description: "Open a dataset",
      category: "Dataset",
      parameters: [
        {
          name: "dataset",
          type: "string",
          description: "The name of the dataset to open",
          required: true,
          options: () => this.leftPanel.getAvailableDatasets().map((d) => d.metadata.name),
        },
      ],
      execute: (params?: Record<string, any>) => this.openDataset(params?.dataset),
    });

    this.commandPalette.registerCommand({
      id: "dataset.exportSelection",
      title: "Export Selection",
      description: "Export the current selection",
      category: "Dataset",
      parameters: [
        {
          name: "format",
          type: "string",
          description: "The format to export the selection in",
          required: true,
          options: () => ["csv", "tsv", "html", "markdown"],
        },
        {
          name: "includeHeader",
          type: "boolean",
          description: "Whether to include the header row in the export",
          required: false,
          default: "true",
        },
        {
          name: "includeIndex",
          type: "boolean",
          description: "Whether to include the index column in the export",
          required: false,
          default: "true",
        },
      ],
      when: () => this.tabManager.getActiveDatasetTab() !== null,
      execute: (params?: Record<string, any>) => this.exportSelection(params),
    });

    this.commandPalette.registerCommand({
      id: "dataset.export",
      title: "Export Current Dataset",
      description: "Export the currently active dataset",
      category: "Dataset",
      when: () => this.tabManager.getActiveDatasetTab() !== null,
      execute: () => this.exportCurrentDataset(),
    });

    this.commandPalette.registerCommand({
      id: "dataset.closeAll",
      title: "Close All Datasets",
      description: "Close all open datasets",
      category: "Dataset",
      when: () => this.tabManager.getDatasetIds().length > 0,
      execute: () => this.closeAllDatasets(),
    });

    // SQL Editor commands
    this.commandPalette.registerCommand({
      id: "sql.toggleEditor",
      title: "Toggle SQL Editor",
      description: "Show or hide the SQL editor panel",
      category: "SQL",
      keybinding: "Ctrl+E",
      execute: () => this.toggleSqlEditor(),
    });

    this.commandPalette.registerCommand({
      id: "sql.executeQuery",
      title: "Execute SQL Query",
      description: "Execute the current query in the SQL editor",
      category: "SQL",
      keybinding: "Ctrl+Enter",
      when: () => this.tabManager.getSqlEditor()?.isExpanded() === true,
      execute: () => this.tabManager.getSqlEditor()?.execute(),
    });

    this.commandPalette.registerCommand({
      id: "sql.clearEditor",
      title: "Clear SQL Editor",
      description: "Clear the SQL editor content",
      category: "SQL",
      when: () => this.tabManager.getSqlEditor()?.isExpanded() === true,
      execute: () => this.tabManager.getSqlEditor()?.clear(),
    });

    // View/Query commands
    this.commandPalette.registerCommand({
      id: "view.createView",
      title: "Create View",
      description: "Save the SQL editor query as a reusable view",
      category: "View",
      parameters: [
        {
          name: "name",
          type: "string",
          description: "Name for the view",
          required: true,
        },
      ],
      when: () => {
        const editor = this.tabManager.getSqlEditor();
        return editor?.isExpanded() === true && editor.getQuery().trim().length > 0;
      },
      execute: async (params?: Record<string, any>) => {
        const editor = this.tabManager.getSqlEditor();
        if (!editor || !params?.name) return;
        try {
          await this.viewManager.createView(params.name, editor.getQuery());
          this.showMessage(`View "${params.name}" created`, "success");
        } catch (error) {
          this.showMessage(`Failed to create view: ${error instanceof Error ? error.message : "unknown error"}`, "error");
        }
      },
    });

    this.commandPalette.registerCommand({
      id: "query.saveQuery",
      title: "Save Query",
      description: "Save the current SQL editor query as a bookmark",
      category: "Query",
      parameters: [
        {
          name: "name",
          type: "string",
          description: "Name for the saved query",
          required: true,
        },
      ],
      when: () => {
        const editor = this.tabManager.getSqlEditor();
        return editor?.isExpanded() === true && editor.getQuery().trim().length > 0;
      },
      execute: (params?: Record<string, any>) => {
        const editor = this.tabManager.getSqlEditor();
        if (!editor || !params?.name) return;
        this.persistenceService.saveQueryBookmark(params.name, editor.getQuery());
        this.leftPanel?.refreshSavedQueries();
        this.showMessage(`Query "${params.name}" saved`, "success");
      },
    });

    // Import commands
    this.commandPalette.registerCommand({
      id: "dataset.importFolder",
      title: "Import Folder",
      description: "Open a folder and scan for supported data files",
      category: "Dataset",
      execute: () => this.leftPanel?.openFolderPicker(),
    });

    this.commandPalette.registerCommand({
      id: "dataset.setAlias",
      title: "Set Dataset Alias",
      description: "Set a custom alias for a dataset table",
      category: "Dataset",
      parameters: [
        {
          name: "dataset",
          type: "string",
          description: "The dataset to rename",
          required: true,
          options: () => this.tabManager.getDatasetIds(),
        },
        {
          name: "alias",
          type: "string",
          description: "The new alias",
          required: true,
        },
      ],
      when: () => this.tabManager.getDatasetIds().length > 0,
      execute: async (params?: Record<string, any>) => {
        if (params?.dataset && params?.alias) {
          try {
            await this.aliasManager.setAlias(params.dataset, params.alias);
            this.showMessage(`Alias "${params.alias}" set`, "success");
          } catch (error) {
            this.showMessage(`Failed: ${error instanceof Error ? error.message : "unknown"}`, "error");
          }
        }
      },
    });

  }

  private async executeCommand(command: string): Promise<void> {
    switch (command) {
      case "workbench.action.showCommands":
        this.commandPalette?.show();
        break;

      case "dataset.export":
        this.exportCurrentDataset();
        break;

      default:
        console.warn("Unknown command:", command);
    }
  }

  private toggleControlPanel(): void {
    this.leftPanel.toggleMinimize();
  }

  private toggleTheme(): void {
    this.setTheme(this.theme === "light" ? "dark" : "light");
    this.showMessage(`Switched to ${this.theme} theme`, "info");
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  private async exportCurrentDataset(): Promise<void> {
    const activeDatasetTab = this.tabManager.getActiveDatasetTab();
    if (activeDatasetTab) {
      const selection = await activeDatasetTab.spreadsheetVisualizer.getSelection();
      console.log("selection", selection);
    } else {
      this.showMessage("No active dataset to export", "warning");
    }
  }

  private toggleSqlEditor(): void {
    this.tabManager.toggleSqlEditor();
  }

  private async executeQuery(query: string): Promise<void> {
    try {
      await this.tabManager.addQueryResult(query, this.duckDBService);
      this.showMessage("Query executed successfully", "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Query execution failed";
      this.showMessage(msg, "error");
      console.error("Query error:", error);
    }
  }

  protected async findDatasetByName(name: string): Promise<DatasetInfo | undefined> {
    return this.leftPanel.getAvailableDatasets().find((d) => d.metadata.name === name);
  }

  private async loadSampleDataset(): Promise<void> {
    try {
      const file = new File([penguinsCsv], "penguins.csv", { type: "text/csv" });
      await this.leftPanel.addFilesFromDrop([file], true);
      this.helpPanel.hide();
      this.showMessage("Palmer Penguins loaded \u2014 try: SELECT * FROM penguins;", "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "unknown error";
      this.showMessage(`Failed to load sample: ${msg}`, "error");
      throw error;
    }
  }

  private async _openDataset(datasetInfo: DatasetInfo): Promise<void> {
    // Add to dataset panel
    this.addDataset(datasetInfo.dataset);

    // Create data provider and add to visualizer
    await this.tabManager.addDataset(datasetInfo.metadata, datasetInfo.dataset);

    // Mark as loaded in panel
    this.leftPanel.markDatasetAsLoaded(datasetInfo.metadata.name);

    await this.tabManager.switchToDataset(datasetInfo.metadata.name);

    // Update status bar
    this.updateStatusBarDatasetInfo();
  }

  protected async openDataset(name: string): Promise<void> {
    const datasetInfo = await this.findDatasetByName(name);
    if (!datasetInfo) {
      this.showMessage(`Dataset "${name}" not found`, "error");
      return;
    }

    await this._openDataset(datasetInfo);
  }

  private closeAllDatasets(): void {
    const datasetIds = this.tabManager.getDatasetIds();
    datasetIds.forEach((id) => this.tabManager.closeDataset(id));
    this.showMessage("All datasets closed", "info");
  }

  private async exportSelection(params?: Record<string, any>): Promise<void> {
    const activeDataset = this.tabManager.getActiveDatasetTab();

    if (activeDataset) {
      const selection = await activeDataset.spreadsheetVisualizer.getSelection();
      if (!selection) {
        this.showMessage("No selection to export", "warning");
        return;
      }

      const { includeHeader, includeIndex, format } = params || {};

      switch (format) {
        case "csv":
          await exportAsText(selection, includeHeader, includeIndex);
          break;
        case "tsv":
          await exportAsText(selection, includeHeader, includeIndex, "\t");
          break;
        case "html":
          await exportAsHTML(selection, includeHeader, includeIndex);
          break;
        case "markdown":
          await exportAsMarkdown(selection, includeHeader, includeIndex);
          break;
      }
    } else {
      this.showMessage("No active dataset to export", "warning");
    }
  }

  private async updateStatusBarDatasetInfo(dataset?: DataProvider): Promise<void> {
    if (dataset) {
      const metadata = await dataset.getMetadata();
      this.statusBar.updateDatasetInfo(metadata.name, metadata.totalRows, metadata.totalColumns);
    } else {
      const activeDataset = this.tabManager.getActiveDatasetTab();
      if (activeDataset) {
        const metadata = activeDataset.metadata;
        this.statusBar.updateDatasetInfo(metadata.name, metadata.totalRows, metadata.totalColumns);
      } else {
        this.statusBar.updateDatasetInfo("No dataset selected", 0, 0);
      }
    }
  }

  private setOnSelectDatasetCallback(): void {
    const callback = async (dataset: DataProvider) => {
      await this.updateStatusBarDatasetInfo(dataset);
    };

    this.leftPanel.setOnSelectCallback(callback);
    this.tabManager.setOnSelectCallback(callback);
  }

  private setOnCloseTabCallback(): void {
    this.tabManager.setOnCloseTabCallback(() => {
      this.updateFocusAfterDatasetChange();
      this.updateStatusBarDatasetInfo();
    });
  }

  /**
   * Set the callback for when a cell is selected.
   * Update the status bar.
   */
  private setOnCellSelectionCallback(): void {
    this.tabManager.setOnCellSelectionCallback((cellSelection) => {
      this.statusBar.updateSelection(cellSelection);
      this.statusBar.updatePosition(cellSelection);
      this.statusBar.updateCellValue(cellSelection);
    });
  }
}
