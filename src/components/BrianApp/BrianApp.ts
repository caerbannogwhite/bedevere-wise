import { MultiDatasetVisualizer } from "../MultiDatasetVisualizer";
import { DatasetPanel } from "../DatasetPanel";
import { StatusBar } from "../StatusBar";
import { CommandPalette } from "../CommandPalette/CommandPalette";
import { SpreadsheetOptions } from "../SpreadsheetVisualizer/types";
import { DataProvider } from "../../data/types";
import { FocusManager } from "./FocusManager";
import { EventDispatcher } from "./EventDispatcher";
import { EventHandler } from "./types";
import { DragDropZoneFocusable } from "../DragDropZone/DragDropZoneFocusable";
import { DatasetInfo } from "../DatasetPanel/DatasetPanel";
import { exportAsHTML, exportAsMarkdown, exportAsText } from "./ExportHub";
import { DuckDBService } from "@/data/duckdb";

export type BrianAppTheme = "light" | "dark" | "auto";

export type BrianAppMessageType = "info" | "warning" | "error" | "success";

export interface BrianAppOptions {
  spreadsheetOptions?: SpreadsheetOptions;
  theme?: BrianAppTheme;
  showLeftPanel?: boolean;
  statusBarVisible?: boolean;
  commandPaletteEnabled?: boolean;
  showDragDropZone?: boolean;
  debugMode?: boolean;
}

export class BrianApp implements EventHandler {
  private container: HTMLElement;
  private mainContainer!: HTMLElement;
  private leftPanelContainer!: HTMLElement;
  private spreadsheetContainer!: HTMLElement;

  private duckDBService!: DuckDBService;
  private commandPalette!: CommandPalette;
  private leftPanel!: DatasetPanel;
  private dragDropZone!: DragDropZoneFocusable | null;
  private multiDatasetVisualizer!: MultiDatasetVisualizer;
  private statusBar!: StatusBar;

  private options: BrianAppOptions;
  private theme: BrianAppTheme = "dark";
  private version: string;

  // Event system
  private focusManager: FocusManager;
  private eventDispatcher: EventDispatcher;

  constructor(parent: HTMLElement, options: BrianAppOptions = {}, duckDBService: DuckDBService, version: string) {
    this.options = {
      theme: "dark",
      showLeftPanel: true,
      statusBarVisible: true,
      commandPaletteEnabled: true,
      ...options,
    };

    this.container = document.createElement("div");
    this.container.className = "brian-app";
    this.setupTheme();

    this.duckDBService = duckDBService;
    this.version = version;

    // Initialize event system
    this.focusManager = new FocusManager({ debugMode: options.debugMode || false });
    this.eventDispatcher = new EventDispatcher(this.focusManager, { debugMode: options.debugMode || false });

    this.createLayout();
    this.setupComponents();
    this.registerCommands();
    this.setupEventSystem();

    parent.appendChild(this.container);
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
    this.container.classList.remove(`brian-app--${this.theme}`);
    document.body.classList.remove(`theme-${this.theme}`);

    this.theme = theme;
    this.container.classList.add(`brian-app--${this.theme}`);
    document.body.classList.add(`theme-${this.theme}`);
  }

  public showMessage(message: string, type: BrianAppMessageType = "info"): void {
    this.statusBar?.showMessage(message, type);
  }

  public destroy(): void {
    // Clean up event system
    this.eventDispatcher.removeGlobalEventHandler(this);
    this.focusManager.clearFocus();
    this.focusManager.clearFocusStack();

    this.statusBar?.destroy();
    this.commandPalette?.destroy();
    this.leftPanel?.destroy();
    this.dragDropZone?.destroy();

    this.container.remove();
  }

  // EventHandler interface implementation
  public async handleKeyDown(e: KeyboardEvent): Promise<boolean> {
    switch (e.key) {
      //@ts-ignore
      case "b":
        if (e.ctrlKey) {
          e.preventDefault();
          this.toggleDatasetPanel();
          return true;
        }

      //@ts-ignore
      case "P":
        if (e.ctrlKey && e.shiftKey) {
          e.preventDefault();
          this.commandPalette?.show();
          return true;
        }

      case "F11":
        e.preventDefault();
        this.toggleFullscreen();
        return true;

      default:
        return false;
    }
  }

  public async handleResize(_e: Event): Promise<boolean> {
    this.updateDimensions();
    return true;
  }

  private createLayout(): void {
    // Main container (excluding status bar)
    this.mainContainer = document.createElement("div");
    this.mainContainer.className = "brian-app__main";

    // Dataset panel container
    this.leftPanelContainer = document.createElement("div");
    this.leftPanelContainer.className = "brian-app__dataset-panel";

    // Spreadsheet container
    this.spreadsheetContainer = document.createElement("div");
    this.spreadsheetContainer.className = "brian-app__spreadsheet";

    this.mainContainer.appendChild(this.leftPanelContainer);
    this.mainContainer.appendChild(this.spreadsheetContainer);

    this.container.appendChild(this.mainContainer);
  }

  private setupComponents(): void {
    // Status bar
    if (this.options.statusBarVisible) {
      this.statusBar = new StatusBar(this.container, this.version);
      this.statusBar.setOnCommandCallback((command) => this.executeCommand(command));
    }

    // Command palette
    if (this.options.commandPaletteEnabled) {
      this.commandPalette = new CommandPalette(this.container, "command-palette");
      this.commandPalette.setEventDispatcher(this.eventDispatcher);
      this.eventDispatcher.registerComponent(this.commandPalette);
    }

    // Drag drop zone
    if (this.options.showDragDropZone) {
      this.dragDropZone = new DragDropZoneFocusable(this.container);
      this.setOnFileDroppedCallback();
    }

    // Calculate dimensions
    this.updateDimensions();

    // Multi-dataset visualizer
    this.multiDatasetVisualizer = new MultiDatasetVisualizer(this.spreadsheetContainer, this.options.spreadsheetOptions);

    // Set event dispatcher on multi-dataset visualizer
    this.multiDatasetVisualizer.setEventDispatcher(this.eventDispatcher);
    this.setOnCloseTabCallback();
    this.setOnCellSelectionCallback();

    // Dataset panel
    if (this.options.showLeftPanel) {
      this.leftPanel = new DatasetPanel(this.leftPanelContainer, this.multiDatasetVisualizer);
      this.setOnSelectDatasetCallback();

      // Handle panel toggle
      this.leftPanel.setOnToggleCallback((isMinimized) => {
        this.container.classList.toggle("brian-app--panel-minimized", isMinimized);
        this.updateDimensions();
      });
    }

    // Listen for dataset changes
    this.setupDatasetListeners();
  }

  private setupTheme(): void {
    this.theme = this.options.theme === "auto" ? this.detectTheme() : this.options.theme || "dark";
    this.container.classList.add(`brian-app--${this.theme}`);
    document.body.classList.add(`theme-${this.theme}`);
  }

  private detectTheme(): "light" | "dark" {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  private setupEventSystem(): void {
    // Register BrianApp as a global event handler
    this.eventDispatcher.addGlobalEventHandler(this);

    // Theme change detection
    if (this.options.theme === "auto") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        this.setTheme(e.matches ? "dark" : "light");
      });
    }
  }

  private updateDimensions(): void {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const statusBarHeight = this.options.statusBarVisible ? 22 : 0;
    const panelWidth = this.options.showLeftPanel ? (this.leftPanel?.getIsMinimized() ? 48 : 280) : 0;

    // Update main container
    this.mainContainer.style.height = `${windowHeight - statusBarHeight}px`;
    this.mainContainer.style.paddingBottom = `${statusBarHeight}px`;

    // Update spreadsheet container
    const contentWidth = windowWidth - panelWidth;
    this.spreadsheetContainer.style.width = `${contentWidth}px`;
    this.spreadsheetContainer.style.height = `${windowHeight - statusBarHeight}px`;

    // Trigger resize on the multi-dataset visualizer to update the active spreadsheet
    if (this.multiDatasetVisualizer) {
      this.multiDatasetVisualizer.resize().catch(console.error);
    }
  }

  private setupDatasetListeners(): void {
    // Override closeDataset to update panel state
    const originalCloseDataset = this.multiDatasetVisualizer.closeDataset.bind(this.multiDatasetVisualizer);
    this.multiDatasetVisualizer.closeDataset = (id: string) => {
      originalCloseDataset(id);
      this.leftPanel?.markDatasetAsUnloaded(id);
      this.updateStatusBarDatasetInfo();
      this.updateFocusAfterDatasetChange();
    };

    // Listen for dataset switches (this would require extending MultiDatasetVisualizer)
    // For now, we'll update status bar when datasets are added
  }

  private updateFocusAfterDatasetChange(): void {
    // Set focus to the active dataset's spreadsheet, or clear focus if no active dataset
    const activeDatasetTab = this.multiDatasetVisualizer.getActiveDatasetTab();
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
      id: "view.toggleLeftPanel",
      title: "Toggle Left Panel",
      description: "Show or hide the left panel",
      category: "View",
      execute: () => this.toggleDatasetPanel(),
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
      when: () => this.multiDatasetVisualizer.getActiveDatasetTab() !== null,
      execute: (params?: Record<string, any>) => this.exportSelection(params),
    });

    this.commandPalette.registerCommand({
      id: "dataset.export",
      title: "Export Current Dataset",
      description: "Export the currently active dataset",
      category: "Dataset",
      when: () => this.multiDatasetVisualizer.getActiveDatasetTab() !== null,
      execute: () => this.exportCurrentDataset(),
    });

    this.commandPalette.registerCommand({
      id: "dataset.closeAll",
      title: "Close All Datasets",
      description: "Close all open datasets",
      category: "Dataset",
      when: () => this.multiDatasetVisualizer.getDatasetIds().length > 0,
      execute: () => this.closeAllDatasets(),
    });

    // Developer commands
    this.commandPalette.registerCommand({
      id: "developer.showInfo",
      title: "Show Application Info",
      description: "Display information about the current application state",
      category: "Developer",
      execute: () => this.showApplicationInfo(),
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

  private toggleDatasetPanel(): void {
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
    const activeDatasetTab = this.multiDatasetVisualizer.getActiveDatasetTab();
    if (activeDatasetTab) {
      const selection = await activeDatasetTab.spreadsheetVisualizer.getSelection();
      console.log("selection", selection);
    } else {
      this.showMessage("No active dataset to export", "warning");
    }
  }

  protected async findDatasetByName(name: string): Promise<DatasetInfo | undefined> {
    return this.leftPanel.getAvailableDatasets().find((d) => d.metadata.name === name);
  }

  private async _openDataset(datasetInfo: DatasetInfo): Promise<void> {
    // Add to dataset panel
    this.addDataset(datasetInfo.dataset);

    // Create data provider and add to visualizer
    await this.multiDatasetVisualizer.addDataset(datasetInfo.metadata, datasetInfo.dataset);

    // Mark as loaded in panel
    this.leftPanel.markDatasetAsLoaded(datasetInfo.metadata.name);

    // Destroy drag drop zone
    this.dragDropZone?.destroy();
    this.dragDropZone = null;

    await this.multiDatasetVisualizer.switchToDataset(datasetInfo.metadata.name);

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
    const datasetIds = this.multiDatasetVisualizer.getDatasetIds();
    datasetIds.forEach((id) => this.multiDatasetVisualizer.closeDataset(id));
    this.showMessage("All datasets closed", "info");
  }

  private async exportSelection(params?: Record<string, any>): Promise<void> {
    const activeDataset = this.multiDatasetVisualizer.getActiveDatasetTab();

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

  private showApplicationInfo(): void {
    const datasetIds = this.multiDatasetVisualizer.getDatasetIds();
    const info = `
    Brian Application Info:
    - Active datasets: ${datasetIds.length}
    - Theme: ${this.theme}
    - Dataset panel: ${this.options.showLeftPanel ? "visible" : "hidden"}
    - Status bar: ${this.options.statusBarVisible ? "visible" : "hidden"}
    - Command palette: ${this.options.commandPaletteEnabled ? "enabled" : "disabled"}
    `.trim();

    console.log(info);
    this.showMessage("Application info logged to console", "info");
  }

  private async updateStatusBarDatasetInfo(dataset?: DataProvider): Promise<void> {
    if (dataset) {
      const metadata = await dataset.getMetadata();
      this.statusBar.updateDatasetInfo(metadata.name, metadata.totalRows, metadata.totalColumns);
    } else {
      const activeDataset = this.multiDatasetVisualizer.getActiveDatasetTab();
      if (activeDataset) {
        const metadata = activeDataset.metadata;
        this.statusBar.updateDatasetInfo(metadata.name, metadata.totalRows, metadata.totalColumns);
      } else {
        this.statusBar.updateDatasetInfo("No dataset selected", 0, 0);
      }
    }
  }

  /**
   * Set the callback for when a file is dropped.
   * Add the dataset to the dataset panel and visualizer.
   * Mark the dataset as loaded in the panel.
   * Update the status bar.
   */
  private setOnFileDroppedCallback(): void {
    this.dragDropZone?.setOnFileDroppedCallback(async (dataset: DataProvider): Promise<void> => {
      try {
        const metadata = await dataset.getMetadata();
        await this._openDataset({ metadata, dataset, isLoaded: true });

        // Show success message
        this.showMessage(`Dataset "${metadata.name}" loaded successfully`, "success");
      } catch (error) {
        console.error("Error adding dropped dataset:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        this.showMessage(`Failed to load dataset: ${errorMessage}`, "error");
      }
    });
  }

  /**
   * Set the callback for when a dataset is selected.
   * Destroy the drag drop zone.
   */
  private setOnSelectDatasetCallback(): void {
    const callback = async (dataset: DataProvider) => {
      await this.updateStatusBarDatasetInfo(dataset);

      this.dragDropZone?.destroy();
      this.dragDropZone = null;
    };

    this.leftPanel.setOnSelectCallback(callback);
    this.multiDatasetVisualizer.setOnSelectCallback(callback);
  }

  /**
   * Set the callback for when a tab is closed.
   * If there are no datasets left, show the drag drop zone.
   */
  private setOnCloseTabCallback(): void {
    this.multiDatasetVisualizer.setOnCloseTabCallback(() => {
      this.updateFocusAfterDatasetChange();
      this.updateStatusBarDatasetInfo();

      // If there are no datasets left, show the drag drop zone
      if (this.multiDatasetVisualizer.getDatasetIds().length === 0 && this.dragDropZone === null) {
        this.dragDropZone = new DragDropZoneFocusable(this.container);
        this.setOnFileDroppedCallback();
      }
    });
  }

  /**
   * Set the callback for when a cell is selected.
   * Update the status bar.
   */
  private setOnCellSelectionCallback(): void {
    this.multiDatasetVisualizer.setOnCellSelectionCallback((cellSelection) => {
      this.statusBar.updateSelection(cellSelection);
    });
  }
}
