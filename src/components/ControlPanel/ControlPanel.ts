import { DataProvider, DatasetMetadata } from "../../data/types";
import { ViewManager } from "../../data/ViewManager";
import { PersistenceService } from "../../data/PersistenceService";
import { FileImportService } from "../../data/FileImportService";
import { FolderScanService } from "../../data/FolderScanService";
import { FileTreeNode } from "../../data/FileTreeTypes";
import { FileTreeRenderer, FileTreeCallbacks } from "./FileTreeRenderer";
import { MultiDatasetVisualizer } from "../MultiDatasetVisualizer";
import { BedevereAppMessageType } from "../BedevereApp/BedevereApp";
import type { MessageOptions } from "../StatusBar/StatusBar";

export type ShowMessageFn = (
  message: string,
  type: BedevereAppMessageType,
  options?: MessageOptions,
) => void;

function formatError(err: unknown): { message: string; details?: string } {
  if (err instanceof Error) {
    return { message: err.message, details: err.stack };
  }
  return { message: String(err) };
}

export interface DatasetInfo {
  metadata: DatasetMetadata;
  dataset: DataProvider;
  isLoaded: boolean;
  type?: "table" | "view" | "query_result";
}

interface AccordionSection {
  id: string;
  title: string;
  isExpanded: boolean;
  headerElement: HTMLElement;
  bodyElement: HTMLElement;
}

export class ControlPanel {
  private container: HTMLElement;
  private panelElement: HTMLElement;
  private headerElement: HTMLElement;
  private contentElement: HTMLElement;
  private toggleButton: HTMLElement;
  private datasets: DatasetInfo[] = [];
  private multiDatasetVisualizer: MultiDatasetVisualizer;
  private isMinimized: boolean = false;
  private panelWidth: number = 320;
  private onToggleCallback?: (isMinimized: boolean) => void;
  private onSelectCallback?: (dataset: DataProvider) => void;
  private viewManager?: ViewManager;
  private persistenceService?: PersistenceService;
  private onOpenQueryCallback?: (sql: string) => void;
  private onAliasChangeCallback?: (tableName: string, alias: string) => void;
  private onShowMessageCallback?: ShowMessageFn;

  // File tree
  private fileImportService?: FileImportService;
  private folderScanService?: FolderScanService;
  private treeRenderer?: FileTreeRenderer;
  private fileTree: FileTreeNode[] = [];

  // Accordion
  private accordionSections: Map<string, AccordionSection> = new Map();
  private datasetListElement!: HTMLElement;
  private columnStatsContainer!: HTMLElement;
  private viewsListElement!: HTMLElement;
  private queriesListElement!: HTMLElement;

  // Resize
  private resizeHandle: HTMLElement;
  public isResizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;
  private readonly onResizeMove: (e: MouseEvent) => void;
  private readonly onResizeEnd: (e: MouseEvent) => void;

  constructor(parent: HTMLElement, multiDatasetVisualizer: MultiDatasetVisualizer) {
    this.multiDatasetVisualizer = multiDatasetVisualizer;

    // Bind resize handlers once
    this.onResizeMove = this.handleResizeMove.bind(this);
    this.onResizeEnd = this.handleResizeEnd.bind(this);

    // Create the main container
    this.container = document.createElement("div");
    this.container.className = "control-panel";

    // Create the panel element
    this.panelElement = document.createElement("div");
    this.panelElement.className = "control-panel__panel";
    this.panelElement.style.width = `${this.panelWidth}px`;

    // Create header with app name and minimize button
    this.headerElement = document.createElement("div");
    this.headerElement.className = "control-panel__header";

    const appTitle = document.createElement("span");
    appTitle.className = "control-panel__app-title";
    appTitle.innerHTML = `<span class="control-panel__app-icon">\uD83E\uDD86</span> Bedevere`;

    this.toggleButton = document.createElement("button");
    this.toggleButton.className = "control-panel__toggle";
    this.toggleButton.innerHTML = "−";
    this.toggleButton.title = "Minimize panel";

    this.headerElement.appendChild(appTitle);
    this.headerElement.appendChild(this.toggleButton);

    // Create content area
    this.contentElement = document.createElement("div");
    this.contentElement.className = "control-panel__content";

    // Build accordion sections
    this.buildAccordion();

    // Resize handle
    this.resizeHandle = document.createElement("div");
    this.resizeHandle.className = "control-panel__resize-handle";
    this.resizeHandle.addEventListener("mousedown", (e) => this.handleResizeStart(e));

    // Assemble the panel
    this.panelElement.appendChild(this.headerElement);
    this.panelElement.appendChild(this.contentElement);
    this.panelElement.appendChild(this.resizeHandle);
    this.container.appendChild(this.panelElement);

    parent.appendChild(this.container);

    this.toggleButton.addEventListener("click", () => this.toggleMinimize());
  }

  private buildAccordion(): void {
    // 1. DATASETS
    this.datasetListElement = document.createElement("div");
    this.datasetListElement.className = "control-panel__list";
    this.createAccordionSection("datasets", "Datasets", true, this.datasetListElement);

    // 2. COLUMN STATS
    this.columnStatsContainer = document.createElement("div");
    this.columnStatsContainer.className = "control-panel__column-stats";
    this.createAccordionSection("column-stats", "Column Stats", false, this.columnStatsContainer);

    // 3. VIEWS
    this.viewsListElement = document.createElement("div");
    this.createAccordionSection("views", "Views", false, this.viewsListElement);

    // 4. SAVED QUERIES
    this.queriesListElement = document.createElement("div");
    this.createAccordionSection("saved-queries", "Saved Queries", false, this.queriesListElement);
  }

  private createAccordionSection(id: string, title: string, expanded: boolean, content: HTMLElement): void {
    const section = document.createElement("div");
    section.className = "control-panel__accordion-section";

    const header = document.createElement("div");
    header.className = "control-panel__accordion-header";

    const chevron = document.createElement("span");
    chevron.className = "control-panel__accordion-chevron";
    chevron.textContent = "▶";
    if (expanded) chevron.classList.add("control-panel__accordion-chevron--expanded");

    const titleEl = document.createElement("span");
    titleEl.className = "control-panel__accordion-title";
    titleEl.textContent = title;

    header.appendChild(chevron);
    header.appendChild(titleEl);

    const body = document.createElement("div");
    body.className = "control-panel__accordion-body";
    if (expanded) body.classList.add("control-panel__accordion-body--expanded");
    body.appendChild(content);

    section.appendChild(header);
    section.appendChild(body);
    this.contentElement.appendChild(section);

    const sectionData: AccordionSection = { id, title, isExpanded: expanded, headerElement: header, bodyElement: body };
    this.accordionSections.set(id, sectionData);

    header.addEventListener("click", () => this.toggleSection(id));
  }

  public expandSection(id: string): void {
    const section = this.accordionSections.get(id);
    if (!section || section.isExpanded) return;
    section.isExpanded = true;
    section.bodyElement.classList.add("control-panel__accordion-body--expanded");
    section.headerElement.querySelector(".control-panel__accordion-chevron")?.classList.add("control-panel__accordion-chevron--expanded");
  }

  public collapseSection(id: string): void {
    const section = this.accordionSections.get(id);
    if (!section || !section.isExpanded) return;
    section.isExpanded = false;
    section.bodyElement.classList.remove("control-panel__accordion-body--expanded");
    section.headerElement.querySelector(".control-panel__accordion-chevron")?.classList.remove("control-panel__accordion-chevron--expanded");
  }

  public toggleSection(id: string): void {
    const section = this.accordionSections.get(id);
    if (!section) return;
    if (section.isExpanded) {
      this.collapseSection(id);
    } else {
      this.expandSection(id);
    }
  }

  // --- Column Stats Container ---

  public getColumnStatsContainer(): HTMLElement {
    return this.columnStatsContainer;
  }

  // --- Datasets ---

  public async addDataset(dataset: DataProvider): Promise<void> {
    const metadata = await dataset.getMetadata();

    const existingDataset = this.datasets.find((d) => d.metadata.name === metadata.name);
    if (existingDataset) return;

    this.datasets.push({ metadata, dataset, isLoaded: false });
    this.renderDatasetList();
  }

  public markDatasetAsLoaded(name: string): void {
    const dataset = this.datasets.find((d) => d.metadata.name === name);
    if (dataset) {
      dataset.isLoaded = true;
      this.renderDatasetList();
    }
  }

  public markDatasetAsUnloaded(name: string): void {
    const dataset = this.datasets.find((d) => d.metadata.name === name);
    if (dataset) {
      dataset.isLoaded = false;
      this.renderDatasetList();
    }
  }

  public getLoadedDatasets(): string[] {
    return this.datasets.filter((d) => d.isLoaded).map((d) => d.metadata.name);
  }

  public getAvailableDatasets(): DatasetInfo[] {
    return [...this.datasets];
  }

  // --- File import & tree ---

  public setFileImportService(service: FileImportService): void {
    this.fileImportService = service;
    this.folderScanService = new FolderScanService(service);
  }

  public setOnAliasChangeCallback(callback: (tableName: string, alias: string) => void): void {
    this.onAliasChangeCallback = callback;
  }

  public async openFolderPicker(): Promise<void> {
    if (!this.folderScanService) return;

    let tree: FileTreeNode | null = null;

    if (this.folderScanService.supportsDirectoryPicker()) {
      tree = await this.folderScanService.scanWithDirectoryPicker();
    } else {
      // Fallback: webkitdirectory input
      const input = document.createElement("input");
      input.type = "file";
      (input as any).webkitdirectory = true;
      input.style.display = "none";
      document.body.appendChild(input);

      tree = await new Promise<FileTreeNode | null>((resolve) => {
        input.addEventListener("change", () => {
          const result = input.files ? this.folderScanService!.scanFromFileList(input.files) : null;
          input.remove();
          resolve(result);
        });
        input.click();
      });
    }

    if (tree) {
      this.fileTree.push(tree);
      this.renderTree();
      this.expandSection("datasets");
    }
  }

  public addFileTreeNode(node: FileTreeNode): void {
    this.fileTree.push(node);
    this.renderTree();
  }

  private renderTree(): void {
    if (this.fileTree.length === 0) return;

    if (!this.treeRenderer) {
      const callbacks: FileTreeCallbacks = {
        onNodeClick: (node) => this.handleTreeNodeClick(node),
        onNodeExpand: (node) => this.handleTreeNodeExpand(node),
        onNodeContextMenu: (_node, _e) => { /* TODO: context menu */ },
        onAliasChange: (node, alias) => this.onAliasChangeCallback?.(node.alias || node.name, alias),
      };
      this.treeRenderer = new FileTreeRenderer(this.datasetListElement, callbacks);
    }

    // Combine flat datasets with tree nodes
    const flatNodes: FileTreeNode[] = this.datasets.map((d) => ({
      id: d.metadata.name,
      name: d.metadata.name,
      kind: "file" as const,
      fileType: undefined,
      isImported: d.isLoaded,
      isExpanded: false,
    }));

    this.treeRenderer.render([...flatNodes, ...this.fileTree]);
  }

  private async handleTreeNodeClick(node: FileTreeNode): Promise<void> {
    if (node.kind === "folder") {
      node.isExpanded = !node.isExpanded;
      this.treeRenderer?.updateNode(node.id, { isExpanded: node.isExpanded });
      return;
    }

    if (node.isImported || node.isUnavailable || !this.fileImportService) return;

    try {
      let file: File;
      if (node.fileHandle instanceof File) {
        file = node.fileHandle;
      } else if (node.fileHandle && "getFile" in node.fileHandle) {
        file = await (node.fileHandle as FileSystemFileHandle).getFile();
      } else {
        return;
      }

      const tableName = node.alias || node.name.replace(/\.[^/.]+$/, "");
      const options = node.kind === "sheet" && node.sheetName ? { sheetName: node.sheetName } : undefined;
      const provider = await this.fileImportService.importFile(file, tableName, options);
      const metadata = await provider.getMetadata();

      node.isImported = true;
      this.treeRenderer?.updateNode(node.id, { isImported: true });

      await this.multiDatasetVisualizer.addDataset(metadata, provider);
      await this.multiDatasetVisualizer.switchToDataset(metadata.name);
      this.onSelectCallback?.(provider);
    } catch (error) {
      console.error(`Failed to import ${node.name}:`, error);
      const { message, details } = formatError(error);
      this.onShowMessageCallback?.(
        `Failed to import ${node.name}: ${message}`,
        "error",
        { details },
      );
    }
  }

  private async handleTreeNodeExpand(node: FileTreeNode): Promise<void> {
    // For Excel files: lazily enumerate sheets on first expand
    if (
      node.kind === "file" &&
      (node.fileType === "xlsx" || node.fileType === "xls") &&
      !node.children &&
      this.fileImportService
    ) {
      try {
        let file: File;
        if (node.fileHandle instanceof File) {
          file = node.fileHandle;
        } else if (node.fileHandle && "getFile" in node.fileHandle) {
          file = await (node.fileHandle as FileSystemFileHandle).getFile();
        } else {
          return;
        }

        const sheetNames = await this.fileImportService.getSheetNames(file);
        node.children = sheetNames.map((sheetName) => ({
          id: `${node.id}/${sheetName}`,
          name: sheetName,
          kind: "sheet" as const,
          fileHandle: node.fileHandle,
          fileType: node.fileType,
          sheetName,
          isImported: false,
          isExpanded: false,
        }));

        // Find depth from the DOM
        const el = this.datasetListElement.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
        const row = el?.querySelector(".file-tree__row") as HTMLElement;
        const depth = row ? Math.floor(parseInt(row.style.paddingLeft) / 16) : 0;
        this.treeRenderer?.appendChildren(node.id, node.children, depth);
      } catch (error) {
        console.error(`Failed to enumerate sheets for ${node.name}:`, error);
        const { message, details } = formatError(error);
        this.onShowMessageCallback?.(
          `Failed to read sheets for ${node.name}: ${message}`,
          "error",
          { details },
        );
      }
    }
  }

  // --- Panel state ---

  public setOnToggleCallback(callback: (isMinimized: boolean) => void): void {
    this.onToggleCallback = callback;
  }

  public setOnSelectCallback(callback: (dataset: DataProvider) => void): void {
    this.onSelectCallback = callback;
  }

  public setOnShowMessageCallback(callback: ShowMessageFn): void {
    this.onShowMessageCallback = callback;
  }

  public getIsMinimized(): boolean {
    return this.isMinimized;
  }

  public getWidth(): number {
    return this.isMinimized ? 48 : this.panelWidth;
  }

  public setWidth(width: number): void {
    this.panelWidth = Math.max(300, Math.min(600, width));
    if (!this.isMinimized) {
      this.panelElement.style.width = `${this.panelWidth}px`;
    }
  }

  public toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;

    if (this.isMinimized) {
      this.panelElement.classList.add("control-panel__panel--minimized");
      this.panelElement.style.width = "48px";
      this.toggleButton.innerHTML = "+";
      this.toggleButton.title = "Expand panel";
    } else {
      this.panelElement.classList.remove("control-panel__panel--minimized");
      this.panelElement.style.width = `${this.panelWidth}px`;
      this.toggleButton.innerHTML = "−";
      this.toggleButton.title = "Minimize panel";
    }

    this.onToggleCallback?.(this.isMinimized);
  }

  // --- Views & Queries ---

  public setViewManager(viewManager: ViewManager): void {
    this.viewManager = viewManager;
    this.viewManager.onChange(() => this.renderViews());
    this.renderViews();
  }

  public setPersistenceService(persistenceService: PersistenceService): void {
    this.persistenceService = persistenceService;
    this.renderSavedQueries();

    // Restore persisted panel width
    const settings = this.persistenceService.loadAppSettings();
    if (settings.panelWidth) {
      this.setWidth(settings.panelWidth);
    }
  }

  public setOnOpenQueryCallback(callback: (sql: string) => void): void {
    this.onOpenQueryCallback = callback;
  }

  public refreshViews(): void {
    this.renderViews();
  }

  public refreshSavedQueries(): void {
    this.renderSavedQueries();
  }

  // --- Resize ---

  private handleResizeStart(e: MouseEvent): void {
    e.preventDefault();
    this.isResizing = true;
    this.resizeStartX = e.clientX;
    this.resizeStartWidth = this.panelWidth;
    // Disable CSS transitions during drag for instant feedback
    this.panelElement.style.transition = "none";
    document.addEventListener("mousemove", this.onResizeMove);
    document.addEventListener("mouseup", this.onResizeEnd);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  private handleResizeMove(e: MouseEvent): void {
    if (!this.isResizing) return;
    const newWidth = this.resizeStartWidth + (e.clientX - this.resizeStartX);
    this.setWidth(newWidth);
    this.onToggleCallback?.(this.isMinimized);
  }

  private handleResizeEnd(_e: MouseEvent): void {
    if (!this.isResizing) return;
    this.isResizing = false;
    // Re-enable CSS transitions
    this.panelElement.style.transition = "";
    document.removeEventListener("mousemove", this.onResizeMove);
    document.removeEventListener("mouseup", this.onResizeEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    // Persist width
    if (this.persistenceService) {
      const settings = this.persistenceService.loadAppSettings();
      settings.panelWidth = this.panelWidth;
      this.persistenceService.saveAppSettings(settings);
    }
  }

  // --- Destroy ---

  public destroy(): void {
    document.removeEventListener("mousemove", this.onResizeMove);
    document.removeEventListener("mouseup", this.onResizeEnd);
    this.container.remove();
  }

  // --- Renderers ---

  private renderDatasetList(): void {
    // If tree data exists, use tree renderer
    if (this.fileTree.length > 0) {
      this.renderTree();
      return;
    }

    // Flat list for individually added datasets
    this.datasetListElement.innerHTML = "";

    this.datasets.forEach((datasetInfo) => {
      const itemElement = document.createElement("div");
      itemElement.className = `control-panel__item ${datasetInfo.isLoaded ? "control-panel__item--loaded" : ""}`;

      const textElement = document.createElement("div");
      textElement.className = "control-panel__item-text";

      const nameElement = document.createElement("div");
      nameElement.className = "control-panel__item-name";
      nameElement.textContent = datasetInfo.metadata.name.toUpperCase();

      textElement.appendChild(nameElement);
      itemElement.appendChild(textElement);

      if (!datasetInfo.isLoaded) {
        itemElement.style.cursor = "pointer";
        itemElement.addEventListener("click", async () => {
          await this.loadDataset(datasetInfo);
          this.onSelectCallback?.(datasetInfo.dataset);
        });
      }

      this.datasetListElement.appendChild(itemElement);
    });
  }

  private renderViews(): void {
    if (!this.viewManager) return;

    const views = this.viewManager.listViews();
    this.viewsListElement.innerHTML = "";

    for (const view of views) {
      const item = document.createElement("div");
      item.className = "control-panel__section-item";

      const name = document.createElement("span");
      name.className = "control-panel__section-item-name";
      name.textContent = view.name;
      name.title = view.sql;

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "control-panel__section-item-delete";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete view";
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.viewManager!.dropView(view.name);
      });

      item.appendChild(name);
      item.appendChild(deleteBtn);

      item.addEventListener("click", async () => {
        const provider = this.viewManager!.getViewAsDataProvider(view.name);
        const metadata = await provider.getMetadata();
        await this.multiDatasetVisualizer.addDataset(metadata, provider);
        await this.multiDatasetVisualizer.switchToDataset(view.name);
      });

      this.viewsListElement.appendChild(item);
    }
  }

  private renderSavedQueries(): void {
    if (!this.persistenceService) return;

    const queries = this.persistenceService.loadQueryBookmarks();
    this.queriesListElement.innerHTML = "";

    for (const query of queries) {
      const item = document.createElement("div");
      item.className = "control-panel__section-item";

      const name = document.createElement("span");
      name.className = "control-panel__section-item-name";
      name.textContent = query.name;
      name.title = query.sql;

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "control-panel__section-item-delete";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete query";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.persistenceService!.deleteQueryBookmark(query.name);
        this.renderSavedQueries();
      });

      item.appendChild(name);
      item.appendChild(deleteBtn);

      item.addEventListener("click", () => {
        this.onOpenQueryCallback?.(query.sql);
      });

      this.queriesListElement.appendChild(item);
    }
  }

  private async loadDataset(datasetInfo: DatasetInfo): Promise<void> {
    try {
      await this.multiDatasetVisualizer.addDataset(datasetInfo.metadata, datasetInfo.dataset);
      await this.multiDatasetVisualizer.switchToDataset(datasetInfo.metadata.name);
      this.markDatasetAsLoaded(datasetInfo.metadata.name);
    } catch (error) {
      console.error(`Failed to load dataset ${datasetInfo.metadata.name}:`, error);
      const { message, details } = formatError(error);
      this.onShowMessageCallback?.(
        `Failed to load dataset "${datasetInfo.metadata.name}": ${message}`,
        "error",
        { details },
      );
    }
  }
}
