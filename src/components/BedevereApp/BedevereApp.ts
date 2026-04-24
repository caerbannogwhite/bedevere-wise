import { TabManager } from "../TabManager";
import { ControlPanel } from "../ControlPanel";
import { StatusBar } from "../StatusBar";
import { HelpPanel } from "../HelpPanel";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_DATETIME_FORMAT,
  DEFAULT_MIN_CELL_WIDTH,
  DEFAULT_MAX_STRING_LENGTH,
  DEFAULT_NUMBER_FORMAT,
} from "../SpreadsheetVisualizer/defaults";
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
import { commandRegistry } from "@/data/CommandRegistry";
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
    if (!action) return false;
    e.preventDefault();
    if (commandRegistry.has(action)) {
      commandRegistry.run(action).catch((err) => console.error(`command ${action} failed:`, err));
    }
    return true;
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
      getFormatOptions: () => {
        const s = this.persistenceService.loadAppSettings();
        return {
          dateFormat: s.dateFormat ?? DEFAULT_DATE_FORMAT,
          datetimeFormat: s.datetimeFormat ?? DEFAULT_DATETIME_FORMAT,
          numberMinDecimals: s.numberMinDecimals ?? DEFAULT_NUMBER_FORMAT.minimumFractionDigits,
          numberMaxDecimals: s.numberMaxDecimals ?? DEFAULT_NUMBER_FORMAT.maximumFractionDigits,
          numberUseGrouping: s.numberUseGrouping ?? true,
          minCellWidth: s.minCellWidth ?? DEFAULT_MIN_CELL_WIDTH,
          maxStringLength: s.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
        };
      },
      setFormatOptions: (opts) => {
        const s = this.persistenceService.loadAppSettings();
        s.dateFormat = opts.dateFormat;
        s.datetimeFormat = opts.datetimeFormat;
        s.numberMinDecimals = opts.numberMinDecimals;
        s.numberMaxDecimals = opts.numberMaxDecimals;
        s.numberUseGrouping = opts.numberUseGrouping;
        s.minCellWidth = opts.minCellWidth;
        s.maxStringLength = opts.maxStringLength;
        this.persistenceService.saveAppSettings(s);
        this.applyFormatSettings(opts);
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

    // Show query elapsed time on the right side of the status bar.
    this.tabManager.setOnQueryCompletedCallback(({ elapsedMs, error }) => {
      this.statusBar?.updateQueryTime(elapsedMs, !error);
    });

    // Shell text output (.help, .settings, etc.) → status bar info toast with
    // click-to-expand for long content.
    this.tabManager.setOnShellMessageCallback((text, details) => {
      this.showMessage(text, "info", { details, duration: 0 });
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
      shellName: "export",
      title: "Export Selection",
      description: "Export the current selection (csv | tsv | html | markdown)",
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
      id: "dataset.closeAll",
      title: "Close All Datasets",
      description: "Close all open datasets",
      category: "Dataset",
      when: () => this.tabManager.getDatasetIds().length > 0,
      execute: () => this.closeAllDatasets(),
    });

    // SQL Editor commands
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
      shellName: "clear",
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

    // Global-scope keymap actions. Registered here so handleKeyDown can
    // dispatch via commandRegistry.run(action) instead of a local switch,
    // and so the palette / shell / .help all see the same verbs.
    commandRegistry.register({
      id: "app.togglePanel",
      shellName: "panel",
      title: "Toggle Left Panel",
      description: "Show or hide the left panel",
      category: "View",
      scope: "global",
      execute: () => this.toggleControlPanel(),
    });
    commandRegistry.register({
      id: "app.commandPalette",
      shellName: "palette",
      title: "Command Palette",
      description: "Open the command palette (deprecated in 0.9 — the shell will be the canonical surface)",
      category: "View",
      scope: "global",
      execute: () => this.commandPalette?.show(),
    });
    commandRegistry.register({
      id: "app.toggleSqlEditor",
      shellName: "sql",
      title: "Toggle SQL Editor",
      description: "Show or hide the SQL editor panel",
      category: "SQL",
      scope: "global",
      execute: () => this.toggleSqlEditor(),
    });
    commandRegistry.register({
      id: "app.toggleFullscreen",
      shellName: "fullscreen",
      title: "Toggle Fullscreen",
      description: "Toggle fullscreen mode",
      category: "View",
      scope: "global",
      execute: () => this.toggleFullscreen(),
    });
    commandRegistry.register({
      id: "tabs.next",
      title: "Next Tab",
      description: "Switch to the next dataset tab",
      category: "Navigation",
      scope: "global",
      execute: () => this.tabManager.switchToNextTab(),
    });
    commandRegistry.register({
      id: "tabs.prev",
      title: "Previous Tab",
      description: "Switch to the previous dataset tab",
      category: "Navigation",
      scope: "global",
      execute: () => this.tabManager.switchToPreviousTab(),
    });

    // Spreadsheet-scope keymap actions. Registered here (not in the
    // visualizer's constructor) so shell/palette callers hit the ACTIVE
    // tab's instance instead of whichever visualizer registered last.
    // The visualizer's handleKeyDown continues to call dispatchKeymapAction
    // directly — so keyboard input skips the registry round-trip.
    const SPREADSHEET_ACTIONS: Array<[string, string, string]> = [
      ["spreadsheet.scrollUp",       "Scroll Up",         "Scroll the viewport up"],
      ["spreadsheet.scrollDown",     "Scroll Down",       "Scroll the viewport down"],
      ["spreadsheet.scrollLeft",     "Scroll Left",       "Scroll the viewport left"],
      ["spreadsheet.scrollRight",    "Scroll Right",      "Scroll the viewport right"],
      ["spreadsheet.moveUp",         "Move Up",           "Move the cell selection up"],
      ["spreadsheet.moveDown",       "Move Down",         "Move the cell selection down"],
      ["spreadsheet.moveLeft",       "Move Left",         "Move the cell selection left"],
      ["spreadsheet.moveRight",      "Move Right",        "Move the cell selection right"],
      ["spreadsheet.extendUp",       "Extend Up",         "Extend the selection up"],
      ["spreadsheet.extendDown",     "Extend Down",       "Extend the selection down"],
      ["spreadsheet.extendLeft",     "Extend Left",       "Extend the selection left"],
      ["spreadsheet.extendRight",    "Extend Right",      "Extend the selection right"],
      ["spreadsheet.enter",          "Enter Selection",   "Start a cell selection at A1"],
      ["spreadsheet.copy",           "Copy Selection",    "Copy the current selection to the clipboard"],
      ["spreadsheet.cancelSelection", "Cancel Selection", "Clear the current cell selection"],
    ];
    for (const [id, title, description] of SPREADSHEET_ACTIONS) {
      commandRegistry.register({
        id,
        title,
        description,
        category: "Spreadsheet",
        scope: "spreadsheet",
        execute: async () => {
          const active = this.tabManager.getActiveDatasetTab()?.spreadsheetVisualizer;
          if (!active) return;
          await active.dispatchKeymapAction(id);
        },
      });
    }

    // Shell-native commands (new for 0.8 — not in palette, not bound to keys).
    this.registerShellCommands();
  }

  /**
   * Commands that are introduced by the shell: `.theme`, `.tables`, `.columns`,
   * `.open`, `.close`, `.tab`. They live alongside the palette/keymap commands
   * in the registry and are reachable from `.help`.
   */
  private registerShellCommands(): void {
    commandRegistry.register({
      id: "view.setTheme",
      shellName: "theme",
      title: "Set Theme",
      description: "Set light / dark / auto",
      category: "View",
      parameters: [
        {
          name: "theme",
          type: "string",
          required: true,
          description: "light | dark | auto",
          options: () => ["light", "dark", "auto"],
        },
      ],
      execute: (params) => {
        const choice = params?.theme as "light" | "dark" | "auto" | undefined;
        if (!choice || !["light", "dark", "auto"].includes(choice)) {
          throw new Error(".theme requires one of: light, dark, auto");
        }
        const resolved = choice === "auto" ? this.detectTheme() : choice;
        this.setTheme(resolved);
        const s = this.persistenceService.loadAppSettings();
        s.theme = choice;
        this.persistenceService.saveAppSettings(s);
      },
    });

    commandRegistry.register({
      id: "shell.tables",
      shellName: "tables",
      title: "List Tables",
      description: "Open a new tab listing every table in the current database",
      category: "Dataset",
      execute: async () => {
        if (!this.duckDBService) throw new Error("Database not initialized");
        await this.tabManager.addQueryResult(
          "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
          this.duckDBService,
        );
      },
    });

    commandRegistry.register({
      id: "shell.columns",
      shellName: "columns",
      title: "Describe Table",
      description: "Open a new tab with the columns of a table",
      category: "Dataset",
      parameters: [
        {
          name: "table",
          type: "string",
          required: true,
          description: "Table name",
          options: () => this.tabManager.getDatasetIds(),
        },
      ],
      execute: async (params) => {
        const table = params?.table;
        if (!table) throw new Error(".columns requires a table name (e.g. .columns penguins)");
        if (!this.duckDBService) throw new Error("Database not initialized");
        // information_schema.columns rather than DESCRIBE — addQueryResult
        // wraps in CREATE TABLE … AS (…) which DuckDB's DESCRIBE statement
        // can't appear inside (it's not a SELECT).
        const tableLiteral = String(table).replace(/'/g, "''");
        await this.tabManager.addQueryResult(
          `SELECT column_name, data_type, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema = 'main' AND table_name = '${tableLiteral}' ORDER BY ordinal_position`,
          this.duckDBService,
        );
      },
    });

    commandRegistry.register({
      id: "shell.open",
      shellName: "open",
      title: "Open Dataset / File / Folder",
      description: "No args → file picker. `--folder` / `-d` → folder picker. <name> → switch to an already-imported dataset.",
      category: "Dataset",
      execute: async (params) => {
        // Folder form.
        if (params?.folder || params?.d) {
          this.leftPanel?.openFolderPicker();
          return;
        }
        // Dataset-name form.
        const arg = (params?._args as string[] | undefined)?.[0];
        if (arg && this.tabManager.getDatasetIds().includes(arg)) {
          await this.tabManager.switchToDataset(arg);
          return;
        }
        if (arg) {
          // Arg supplied but doesn't match an imported dataset — error out so
          // the user knows, rather than silently opening a file picker.
          throw new Error(`No dataset named '${arg}'. Drop a file or run .open to pick one.`);
        }
        // No-arg form → native file picker. Reuses the ControlPanel drop path.
        const picker = document.createElement("input");
        picker.type = "file";
        picker.multiple = true;
        const exts = this.fileImportService.getSupportedExtensions();
        picker.accept = exts.map((e) => (e.startsWith(".") ? e : "." + e)).join(",");
        picker.addEventListener("change", async () => {
          if (picker.files && picker.files.length > 0) {
            await this.leftPanel?.addFilesFromDrop(Array.from(picker.files), true);
          }
        });
        picker.click();
      },
    });

    commandRegistry.register({
      id: "shell.close",
      shellName: "close",
      title: "Close Dataset Tab",
      description: "Close the named dataset, or the active tab if no name is given",
      category: "Dataset",
      parameters: [
        {
          name: "dataset",
          type: "string",
          required: false,
          description: "Dataset name (defaults to active tab)",
          options: () => this.tabManager.getDatasetIds(),
        },
      ],
      execute: (params) => {
        const name = (params?.dataset as string | undefined) ?? this.tabManager.getActiveDatasetTab()?.metadata.name;
        if (!name) throw new Error("No active dataset to close");
        this.tabManager.closeDataset(name);
      },
    });

    commandRegistry.register({
      id: "shell.tab",
      shellName: "tab",
      title: "Switch Tab",
      description: "next | prev | <1-based index>",
      category: "Navigation",
      parameters: [
        {
          name: "target",
          type: "string",
          required: true,
          description: "next | prev | N (1-based)",
          options: () => ["next", "prev"],
        },
      ],
      execute: (params) => {
        const arg = String(params?.target ?? "").trim();
        if (arg === "next") { this.tabManager.switchToNextTab(); return; }
        if (arg === "prev") { this.tabManager.switchToPreviousTab(); return; }
        if (/^\d+$/.test(arg)) { this.tabManager.switchToTabByIndex(Number(arg) - 1); return; }
        throw new Error(".tab expects 'next', 'prev', or a 1-based index");
      },
    });

    // ---- .settings ------------------------------------------------------
    commandRegistry.register({
      id: "shell.settings",
      shellName: "settings",
      title: "Settings",
      description:
        "No args: print current settings. `key=value` (one or more): set. Known keys: theme, dateFormat, datetimeFormat, numberMinDecimals, numberMaxDecimals, numberUseGrouping, minCellWidth, maxStringLength, copyDelimiter, copyIncludeHeader.",
      category: "View",
      execute: async (params) => {
        await this.handleShellSettings(params ?? {});
      },
    });

    // ---- .view save|drop <name> -----------------------------------------
    commandRegistry.register({
      id: "shell.view",
      shellName: "view",
      title: "Manage SQL Views",
      description: "`.view save <name>` persists the editor's query as a view; `.view drop <name>` removes one.",
      category: "View",
      parameters: [
        { name: "action", type: "string", required: true, options: () => ["save", "drop"] },
        { name: "name", type: "string", required: true },
      ],
      execute: async (params) => {
        const action = String(params?.action ?? "").trim();
        const name = String(params?.name ?? "").trim();
        if (!name) throw new Error(".view requires a name: .view save <name> or .view drop <name>");
        if (action === "save") {
          const editor = this.tabManager.getSqlEditor();
          const query = editor?.getQuery().trim();
          if (!query) throw new Error("SQL editor is empty — open it with .sql and type a query first");
          await this.viewManager.createView(name, query);
          this.showMessage(`View "${name}" saved`, "success");
          return;
        }
        if (action === "drop") {
          await this.viewManager.dropView(name);
          this.showMessage(`View "${name}" dropped`, "success");
          return;
        }
        throw new Error(`.view expects 'save' or 'drop' as the first argument, got '${action}'`);
      },
    });

    // ---- .query save <name> ---------------------------------------------
    commandRegistry.register({
      id: "shell.query",
      shellName: "query",
      title: "Manage Query Bookmarks",
      description: "`.query save <name>` bookmarks the editor's current query.",
      category: "Query",
      parameters: [
        { name: "action", type: "string", required: true, options: () => ["save"] },
        { name: "name", type: "string", required: true },
      ],
      execute: (params) => {
        const action = String(params?.action ?? "").trim();
        const name = String(params?.name ?? "").trim();
        if (action !== "save") throw new Error(".query currently supports only 'save'");
        if (!name) throw new Error(".query save requires a name");
        const editor = this.tabManager.getSqlEditor();
        const query = editor?.getQuery().trim();
        if (!query) throw new Error("SQL editor is empty — open it with .sql and type a query first");
        this.persistenceService.saveQueryBookmark(name, query);
        this.showMessage(`Query "${name}" bookmarked`, "success");
      },
    });
  }

  /**
   * Back-end for `.settings`. With no args, emit the current config through
   * the shell's text/details channel (so the status-bar chip stays one line
   * and the popover carries the full dump). With args, apply each as a
   * setting via the same paths as the Settings tab.
   */
  private async handleShellSettings(params: Record<string, any>): Promise<void> {
    const keys = Object.keys(params).filter((k) => k !== "_args");

    // Print mode.
    const positional = (params._args as string[] | undefined) ?? [];
    if (keys.length === 0 && positional.length === 0) {
      const s = this.persistenceService.loadAppSettings();
      const details = [
        `  theme              = ${s.theme ?? "auto"}`,
        `  dateFormat         = ${s.dateFormat ?? "yyyy-MM-dd"}`,
        `  datetimeFormat     = ${s.datetimeFormat ?? "yyyy-MM-dd HH:mm:ss"}`,
        `  numberMinDecimals  = ${s.numberMinDecimals ?? 2}`,
        `  numberMaxDecimals  = ${s.numberMaxDecimals ?? 2}`,
        `  numberUseGrouping  = ${s.numberUseGrouping ?? true}`,
        `  minCellWidth       = ${s.minCellWidth ?? 100}`,
        `  maxStringLength    = ${s.maxStringLength ?? 100}`,
        `  copyDelimiter      = ${s.copyDelimiter ?? "tab"}`,
        `  copyIncludeHeader  = ${s.copyIncludeHeader ?? true}`,
      ].join("\n");
      this.showMessage("Settings (click to expand — override with .settings key=value)", "info", {
        details,
        duration: 0,
      });
      return;
    }

    // Apply mode.
    const updates: string[] = [];
    let formatChanged = false;
    const settings = this.persistenceService.loadAppSettings();
    for (const key of keys) {
      const raw = params[key];
      switch (key) {
        case "theme": {
          const v = String(raw);
          if (!["light", "dark", "auto"].includes(v)) throw new Error(`theme must be light|dark|auto, got '${v}'`);
          settings.theme = v as "light" | "dark" | "auto";
          this.setTheme(v === "auto" ? this.detectTheme() : (v as "light" | "dark"));
          updates.push(`theme=${v}`);
          break;
        }
        case "dateFormat":      settings.dateFormat = String(raw);       formatChanged = true; updates.push(`dateFormat=${raw}`); break;
        case "datetimeFormat":  settings.datetimeFormat = String(raw);   formatChanged = true; updates.push(`datetimeFormat=${raw}`); break;
        case "numberMinDecimals": settings.numberMinDecimals = Number(raw); formatChanged = true; updates.push(`numberMinDecimals=${raw}`); break;
        case "numberMaxDecimals": settings.numberMaxDecimals = Number(raw); formatChanged = true; updates.push(`numberMaxDecimals=${raw}`); break;
        case "numberUseGrouping": settings.numberUseGrouping = raw === true || raw === "true"; formatChanged = true; updates.push(`numberUseGrouping=${settings.numberUseGrouping}`); break;
        case "minCellWidth":    settings.minCellWidth = Number(raw);     formatChanged = true; updates.push(`minCellWidth=${raw}`); break;
        case "maxStringLength": settings.maxStringLength = Number(raw);  formatChanged = true; updates.push(`maxStringLength=${raw}`); break;
        case "copyDelimiter": {
          const v = String(raw);
          if (v !== "tab" && v !== "comma") throw new Error(`copyDelimiter must be tab|comma, got '${v}'`);
          settings.copyDelimiter = v;
          updates.push(`copyDelimiter=${v}`);
          break;
        }
        case "copyIncludeHeader":
          settings.copyIncludeHeader = raw === true || raw === "true";
          updates.push(`copyIncludeHeader=${settings.copyIncludeHeader}`);
          break;
        default:
          throw new Error(`Unknown setting: ${key}. Run .settings with no args to list known keys.`);
      }
    }
    this.persistenceService.saveAppSettings(settings);

    if (formatChanged) {
      this.applyFormatSettings({
        dateFormat: settings.dateFormat ?? "yyyy-MM-dd",
        datetimeFormat: settings.datetimeFormat ?? "yyyy-MM-dd HH:mm:ss",
        numberMinDecimals: settings.numberMinDecimals ?? 2,
        numberMaxDecimals: settings.numberMaxDecimals ?? 2,
        numberUseGrouping: settings.numberUseGrouping ?? true,
        minCellWidth: settings.minCellWidth ?? 100,
        maxStringLength: settings.maxStringLength ?? 100,
      });
    }

    this.showMessage(`Updated: ${updates.join(", ")}`, "success");
  }

  private async executeCommand(command: string): Promise<void> {
    switch (command) {
      case "workbench.action.showCommands":
        this.commandPalette?.show();
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

  /**
   * Apply freshly-saved format preferences to every open tab and the status
   * bar. The numberFormat receives a new object reference so reference-keyed
   * caches (preview/popover number formatters) invalidate correctly.
   */
  private applyFormatSettings(opts: {
    dateFormat: string;
    datetimeFormat: string;
    numberMinDecimals: number;
    numberMaxDecimals: number;
    numberUseGrouping: boolean;
    minCellWidth: number;
    maxStringLength: number;
  }): void {
    const so = this.options.spreadsheetOptions ?? (this.options.spreadsheetOptions = {});
    so.dateFormat = opts.dateFormat;
    so.datetimeFormat = opts.datetimeFormat;
    so.numberFormat = {
      minimumFractionDigits: opts.numberMinDecimals,
      maximumFractionDigits: opts.numberMaxDecimals,
      useGrouping: opts.numberUseGrouping,
    };
    so.minCellWidth = opts.minCellWidth;
    so.maxStringLength = opts.maxStringLength;
    this.statusBar?.setSpreadsheetOptions(so);
    this.tabManager?.applyFormatChange(so).catch((err) => {
      console.error("applyFormatChange failed:", err);
    });
  }
}
