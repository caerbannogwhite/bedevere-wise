import { SpreadsheetVisualizer } from "../SpreadsheetVisualizer/SpreadsheetVisualizer";
import { SpreadsheetOptions } from "../SpreadsheetVisualizer/types";
import { ColumnStatsVisualizerFocusable } from "../ColumnStatsVisualizer/ColumnStatsVisualizerFocusable";
import { CommandBar } from "../CommandBar";
import { SqlEditor } from "../SqlEditor";
import { DataProvider, DatasetMetadata } from "../../data/types";
import { DuckDBService } from "../../data/DuckDBService";
import { ColumnFilterManager } from "../../data/ColumnFilterManager";
import { FilteredDuckDBDataProvider } from "../../data/FilteredDuckDBDataProvider";
import { EventDispatcher } from "../BedevereApp/EventDispatcher";
import { ICellSelection } from "../SpreadsheetVisualizer/types";

interface DatasetTab {
  metadata: DatasetMetadata;
  dataProvider: DataProvider;
  spreadsheetVisualizer: SpreadsheetVisualizer;
  container: HTMLElement;
  isActive: boolean;
  onCloseTab?: () => void;
}

export class TabManager {
  private container: HTMLElement;
  private tabsContainer: HTMLElement;
  private sqlEditorContainer: HTMLElement;
  private commandBarContainer: HTMLElement;
  private contentContainer: HTMLElement;
  private tabs: DatasetTab[] = [];
  private activeTabId: string | null = null;
  private options: SpreadsheetOptions;
  private sharedStatsVisualizer: ColumnStatsVisualizerFocusable;
  private commandBar: CommandBar | null = null;
  private sqlEditor: SqlEditor | null = null;
  private filterManager: ColumnFilterManager = new ColumnFilterManager();
  private duckDBService: DuckDBService | null = null;
  private eventDispatcher?: EventDispatcher;
  private onCellSelectionCallback?: (cellSelection?: ICellSelection) => void;
  private onCloseTabCallback?: () => void;
  private onSelectCallback?: (dataset: DataProvider) => void;
  private onQueryErrorCallback?: (error: Error) => void;

  constructor(parent: HTMLElement, options: SpreadsheetOptions = {}) {
    this.container = document.createElement("div");
    this.container.className = "tab-manager";
    this.options = options;

    // Set explicit dimensions if provided
    if (options.width) {
      this.container.style.width = `${options.width}px`;
    }
    if (options.height) {
      this.container.style.height = `${options.height}px`;
    }

    // Create tabs container
    this.tabsContainer = document.createElement("div");
    this.tabsContainer.className = "tab-manager__tabs-container";

    // Create command bar container (above tabs)
    this.commandBarContainer = document.createElement("div");
    this.commandBarContainer.className = "tab-manager__command-bar-container";

    // Create SQL editor container (between tabs and content)
    this.sqlEditorContainer = document.createElement("div");
    this.sqlEditorContainer.className = "tab-manager__sql-editor-container";

    // Create content container
    this.contentContainer = document.createElement("div");
    this.contentContainer.className = "tab-manager__content-container";

    this.container.appendChild(this.commandBarContainer);
    this.container.appendChild(this.sqlEditorContainer);
    this.container.appendChild(this.tabsContainer);
    this.container.appendChild(this.contentContainer);
    parent.appendChild(this.container);

    // Force layout calculation
    this.container.offsetHeight;

    // Create shared stats visualizer
    this.sharedStatsVisualizer = new ColumnStatsVisualizerFocusable(this.container, null, 350);

    // Setup resize handling
    this.setupResizeHandling();

    // Wire up filter changes
    this.filterManager.onChange((datasetName) => this.handleFilterChange(datasetName));
  }

  public async addDataset(metadata: DatasetMetadata, dataProvider: DataProvider): Promise<void> {
    // Create a separate container for this dataset's spreadsheet visualizer
    const datasetContainer = document.createElement("div");
    datasetContainer.className = "tab-manager__dataset-container";
    this.contentContainer.appendChild(datasetContainer);

    // Force layout calculation to get accurate dimensions
    this.container.offsetHeight;
    this.tabsContainer.offsetHeight;
    this.commandBarContainer.offsetHeight;
    this.contentContainer.offsetHeight;

    // Calculate actual available dimensions based on container size
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const tabsHeight = this.tabsContainer.offsetHeight || 40;
    const sqlEditorHeight = this.sqlEditorContainer.offsetHeight || 0;
    const commandBarHeight = this.commandBarContainer.offsetHeight || 32;
    const chromeHeight = tabsHeight + sqlEditorHeight + commandBarHeight;

    // Calculate dimensions that will fill the available space
    const availableWidth = containerWidth > 0 ? containerWidth : this.options.width;
    const availableHeight =
      containerHeight > 0
        ? containerHeight - chromeHeight
        : this.options.height
        ? this.options.height - chromeHeight
        : undefined;

    // Create options for the spreadsheet with calculated dimensions
    const spreadsheetOptions = {
      ...this.options,
      width: availableWidth,
      height: availableHeight,
      // Remove any fixed min/max constraints that might limit full utilization
      minWidth: Math.min(this.options.minWidth || 600, availableWidth || 600),
      minHeight: Math.min(this.options.minHeight || 400, availableHeight || 400),
    };

    // Create wrapper for event handling
    const spreadsheetVisualizer = new SpreadsheetVisualizer(
      datasetContainer,
      dataProvider,
      spreadsheetOptions,
      this.sharedStatsVisualizer,
      `spreadsheet-${metadata.name}`
    );

    // Wire filter manager for header indicators
    spreadsheetVisualizer.setFilterManager(this.filterManager, metadata.name);

    // Connect selection change to cell value bar
    spreadsheetVisualizer.addOnSelectionChangeSubscription((selection) => {
      if (this.commandBar && selection) {
        this.commandBar.updateCell(selection);
      } else if (this.commandBar) {
        this.commandBar.updateCell(undefined);
      }
    });

    // Wire the external cell-selection callback exactly once per dataset. Doing
    // this in activateTab would add a new subscription every time the user
    // switches to this tab, causing the callback to fire N times after N
    // activations.
    if (this.onCellSelectionCallback) {
      spreadsheetVisualizer.addOnSelectionChangeSubscription(this.onCellSelectionCallback);
    }

    const tab: DatasetTab = {
      metadata,
      dataProvider,
      spreadsheetVisualizer,
      container: datasetContainer,
      isActive: false,
    };

    this.tabs.push(tab);
    this.createTabElement(tab);

    // Register with event dispatcher if available
    if (this.eventDispatcher) {
      this.eventDispatcher.registerComponent(tab.spreadsheetVisualizer);
    }

    // Initialize the spreadsheet
    await spreadsheetVisualizer.initialize();

    // If this is the first tab, activate it and hide empty state
    if (this.tabs.length === 1) {
      this.showCommandBar();
      await this.activateTab(metadata.name);
    }
  }

  public async switchToDataset(id: string): Promise<void> {
    const tab = this.tabs.find((t) => t.metadata.name === id);
    if (tab) {
      this.activateTab(id);
    }
  }

  public closeDataset(name: string): void {
    const tabIndex = this.tabs.findIndex((t) => t.metadata.name === name);
    if (tabIndex === -1) return;

    const tab = this.tabs[tabIndex];

    // Unregister from event dispatcher if available
    if (this.eventDispatcher) {
      this.eventDispatcher.unregisterComponent(tab.spreadsheetVisualizer.componentId);
    }

    // Remove tab element
    const tabElement = this.tabsContainer.querySelector(`[data-tab-id="${name}"]`);
    if (tabElement) {
      tabElement.remove();
    }

    // Remove dataset container from DOM
    tab.container.remove();

    // Remove from tabs array
    this.tabs.splice(tabIndex, 1);

    // If this was the active tab, switch to another tab
    if (tab.isActive) {
      if (this.tabs.length > 0) {
        const newActiveTab = tabIndex < this.tabs.length ? this.tabs[tabIndex] : this.tabs[tabIndex - 1];
        this.activateTab(newActiveTab.metadata.name);
      } else {
        this.activeTabId = null;
        this.contentContainer.innerHTML = "";
        // Hide stats visualizer when no datasets are active
        this.sharedStatsVisualizer.hide();
        // Hide cell value bar when no datasets remain
        this.hideCommandBar();
      }
    }

    if (this.onCloseTabCallback) {
      this.onCloseTabCallback();
    }
  }

  public getDatasetIds(): string[] {
    return this.tabs.map((t) => t.metadata.name);
  }

  public getActiveDatasetTab(): DatasetTab | null {
    return this.tabs.find((t) => t.isActive) || null;
  }

  public setEventDispatcher(eventDispatcher: EventDispatcher): void {
    this.eventDispatcher = eventDispatcher;

    // Register all existing tabs with the event dispatcher
    for (const tab of this.tabs) {
      this.eventDispatcher.registerComponent(tab.spreadsheetVisualizer);
    }
  }

  public setOnCellSelectionCallback(callback: (cellSelection?: ICellSelection) => void): void {
    this.onCellSelectionCallback = callback;
    // Back-fill any tabs that were added before the callback was wired.
    for (const tab of this.tabs) {
      tab.spreadsheetVisualizer.addOnSelectionChangeSubscription(callback);
    }
  }

  public setOnSelectCallback(callback: (dataset: DataProvider) => void): void {
    this.onSelectCallback = callback;
  }

  public setOnCloseTabCallback(callback: () => void): void {
    this.onCloseTabCallback = callback;
  }

  public setOnQueryErrorCallback(callback: (error: Error) => void): void {
    this.onQueryErrorCallback = callback;
  }

  private createTabElement(tab: DatasetTab): void {
    const tabElement = document.createElement("div");
    tabElement.setAttribute("data-tab-id", tab.metadata.name);
    tabElement.className = "tab-manager__tab";

    // Tab title
    const titleElement = document.createElement("span");
    titleElement.textContent = tab.metadata.name;
    titleElement.className = "tab-manager__tab-title";

    // Close button
    const closeButton = document.createElement("button");
    closeButton.innerHTML = "×";
    closeButton.className = "tab-manager__tab-close";

    // Event listeners
    tabElement.addEventListener("click", (e) => {
      if (e.target !== closeButton) {
        this.activateTab(tab.metadata.name);
      }
    });

    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeDataset(tab.metadata.name);
    });

    tabElement.appendChild(titleElement);
    tabElement.appendChild(closeButton);
    this.tabsContainer.appendChild(tabElement);
  }

  private async activateTab(id: string): Promise<void> {
    // Deactivate current tab
    if (this.activeTabId) {
      const currentTab = this.tabs.find((t) => t.metadata.name === this.activeTabId);
      if (currentTab) {
        currentTab.isActive = false;
        currentTab.container.classList.remove("tab-manager__dataset-container--active");
        this.updateTabStyles(this.activeTabId, false);
      }
    }

    // Activate new tab
    const newTab = this.tabs.find((t) => t.metadata.name === id);
    if (newTab) {
      newTab.isActive = true;
      this.activeTabId = id;
      newTab.container.classList.add("tab-manager__dataset-container--active");
      this.updateTabStyles(id, true);

      // Set focus on the new active tab
      if (this.eventDispatcher) {
        this.eventDispatcher.setFocus(newTab.spreadsheetVisualizer.componentId);
      }

      // Force layout calculation and resize to ensure spreadsheet takes full space
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await newTab.spreadsheetVisualizer.resize();

      // Update the shared stats visualizer with the new spreadsheet visualizer and filter manager
      this.sharedStatsVisualizer.setFilterManager(this.filterManager, newTab.metadata.name);
      await this.sharedStatsVisualizer.setSpreadsheetVisualizer(newTab.spreadsheetVisualizer);

      if (this.onSelectCallback) {
        this.onSelectCallback(newTab.dataProvider);
      }
    }
  }

  private updateTabStyles(tabId: string, isActive: boolean): void {
    const tabElement = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement;
    if (tabElement) {
      if (isActive) {
        tabElement.classList.add("tab-manager__tab--active");
      } else {
        tabElement.classList.remove("tab-manager__tab--active");
      }
    }
  }

  private setupResizeHandling(): void {
    // Use ResizeObserver for better performance than window resize events
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      resizeObserver.observe(this.container);
    } else {
      // Fallback for browsers without ResizeObserver
      window.addEventListener("resize", () => this.handleResize());
    }
  }

  private async handleResize(): Promise<void> {
    // Trigger resize on the active spreadsheet visualizer
    const activeTab = this.tabs.find((tab) => tab.isActive);
    if (activeTab) {
      // Force layout recalculation before resize
      this.container.offsetHeight;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await activeTab.spreadsheetVisualizer.resize();
    }
  }

  public async resize(): Promise<void> {
    // Public method to trigger resize from external components (e.g., BedevereApp)
    await this.handleResize();
  }

  public getStatsVisualizer(): ColumnStatsVisualizerFocusable {
    return this.sharedStatsVisualizer;
  }

  public setColumnStatsParent(container: HTMLElement): void {
    const statsElement = this.sharedStatsVisualizer.getContainer();
    if (statsElement.parentNode) {
      statsElement.parentNode.removeChild(statsElement);
    }
    container.appendChild(statsElement);
  }

  public getFilterManager(): ColumnFilterManager {
    return this.filterManager;
  }

  public initSqlEditor(duckDBService: DuckDBService): void {
    if (this.sqlEditor) return;

    this.duckDBService = duckDBService;
    this.sqlEditor = new SqlEditor(this.sqlEditorContainer, duckDBService);

    // Register with event dispatcher
    if (this.eventDispatcher) {
      this.eventDispatcher.registerComponent(this.sqlEditor);
    }

    // Wire up query execution
    this.sqlEditor.setOnExecuteCallback(async (query: string) => {
      try {
        await this.addQueryResult(query, duckDBService);
      } catch (error) {
        if (this.onQueryErrorCallback) {
          this.onQueryErrorCallback(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });

    // Resize spreadsheet when editor toggles
    this.sqlEditor.setOnToggleCallback(() => {
      // Give the CSS transition time to apply, then resize
      setTimeout(() => this.handleResize(), 260);
    });
  }

  public toggleSqlEditor(): void {
    this.sqlEditor?.toggle();
  }

  public getSqlEditor(): SqlEditor | null {
    return this.sqlEditor;
  }

  private async handleFilterChange(datasetName: string): Promise<void> {
    const tab = this.tabs.find((t) => t.metadata.name === datasetName);
    if (!tab || !this.duckDBService) return;

    // Determine the source table name
    const currentProvider = tab.dataProvider;
    let sourceTableName: string;
    if (currentProvider instanceof FilteredDuckDBDataProvider) {
      sourceTableName = currentProvider.getSourceTableName();
    } else {
      sourceTableName = tab.metadata.name;
    }

    if (this.filterManager.hasAnyFiltersOrSorts(datasetName)) {
      // Create a filtered provider
      const filteredProvider = new FilteredDuckDBDataProvider(
        this.duckDBService,
        sourceTableName,
        this.filterManager,
        datasetName,
        tab.metadata.fileName ?? ""
      );
      tab.dataProvider = filteredProvider;
      await tab.spreadsheetVisualizer.reinitialize(filteredProvider);
    } else {
      // No filters - use the original DuckDBDataProvider
      const { DuckDBDataProvider } = await import("../../data/DuckDBDataProvider");
      const originalProvider = new DuckDBDataProvider(this.duckDBService, sourceTableName, tab.metadata.fileName ?? "");
      tab.dataProvider = originalProvider;
      await tab.spreadsheetVisualizer.reinitialize(originalProvider);
    }

    // Update stats visualizer to reflect filter state
    await this.sharedStatsVisualizer.setSpreadsheetVisualizer(tab.spreadsheetVisualizer);
  }

  public async addQueryResult(query: string, duckDBService: DuckDBService): Promise<void> {
    try {
      const dataProvider = await duckDBService.executeQueryAsDataProvider(query);
      const metadata = await dataProvider.getMetadata();
      await this.addDataset(metadata, dataProvider);
      await this.switchToDataset(metadata.name);
    } catch (error) {
      console.error("Query execution failed:", error);
      throw error;
    }
  }

  public destroy(): void {
    // Clean up all spreadsheet visualizers
    this.tabs.forEach((tab) => {
      tab.spreadsheetVisualizer.destroy();
    });

    // Hide shared stats visualizer
    this.sharedStatsVisualizer.hide();

    // Clean up SQL editor
    if (this.sqlEditor) {
      if (this.eventDispatcher) {
        this.eventDispatcher.unregisterComponent(this.sqlEditor.componentId);
      }
      this.sqlEditor.destroy();
      this.sqlEditor = null;
    }

    // Clean up cell value bar
    if (this.commandBar) {
      this.commandBar.destroy();
      this.commandBar = null;
    }
  }

  private showCommandBar(): void {
    if (this.commandBar) return;

    this.commandBar = new CommandBar({
      container: this.commandBarContainer,
    });

    // Wire up SQL editor toggle from cell value bar
    this.commandBar.setOnToggleSqlEditorCallback(() => {
      this.toggleSqlEditor();
    });

    // Sync toggle button state when SQL editor toggles
    if (this.sqlEditor) {
      this.sqlEditor.setOnToggleCallback((isExpanded) => {
        this.commandBar?.setSqlEditorExpanded(isExpanded);
        setTimeout(() => this.handleResize(), 260);
      });
    }
  }

  private hideCommandBar(): void {
    if (this.commandBar) {
      this.commandBar.destroy();
      this.commandBar = null;
    }
  }
}
