import { DataProvider } from "../../data/types";
import { DuckDBService } from "@/data/DuckDBService";
import { FileImportService } from "@/data/FileImportService";

export interface DragDropZoneOptions {
  onFileDropped?: (dataset: DataProvider) => void;
  onError?: (error: string) => void;
}

export class DragDropZone {
  private container: HTMLElement;
  private dropZone!: HTMLElement;
  private duckDBService: DuckDBService;
  private fileImportService: FileImportService | null = null;
  private options: DragDropZoneOptions;
  private isDragOver: boolean = false;
  private onBrowseFolderCallback?: () => void;

  constructor(parent: HTMLElement, duckDBService: DuckDBService, options: DragDropZoneOptions = {}) {
    this.duckDBService = duckDBService;
    this.options = options;
    this.container = document.createElement("div");
    this.container.className = "drag-drop-zone";

    this.createDropZone();
    this.setupEventListeners();

    parent.appendChild(this.container);
  }

  public setFileImportService(service: FileImportService): void {
    this.fileImportService = service;
  }

  public setOnBrowseFolderCallback(callback: () => void): void {
    this.onBrowseFolderCallback = callback;
  }

  public show(): void {
    this.container.style.display = "flex";
  }

  public hide(): void {
    this.container.style.display = "none";
  }

  public destroy(): void {
    // Clean up event listeners
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      document.body.removeEventListener(eventName, this.preventDefaults, false);
    });

    // Remove from DOM
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  // Accessor methods for wrapper
  public getContainer(): HTMLElement {
    return this.container;
  }

  public setOnFileDroppedCallback(callback: (dataset: DataProvider) => void): void {
    this.options.onFileDropped = callback;
  }

  private createDropZone(): void {
    this.dropZone = document.createElement("div");
    this.dropZone.className = "drag-drop-zone__area";

    // Create icon
    const icon = document.createElement("div");
    icon.className = "drag-drop-zone__icon";
    icon.innerHTML = `
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7,10 12,15 17,10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `;

    // Create title
    const title = document.createElement("h3");
    title.className = "drag-drop-zone__title";
    title.textContent = "Drag & Drop Your Data File";

    // Create description
    const description = document.createElement("p");
    description.className = "drag-drop-zone__description";
    const formats = this.fileImportService
      ? this.fileImportService.getSupportedExtensions().join(", ")
      : this.duckDBService.getSupportedFileTypes().join(", ");
    description.innerHTML = `
      Drop a file here to automatically add it as a dataset<br>
      <small>Supported formats: ${formats}</small>
    `;

    // Create alternative action — split button: main "Browse" + dropdown arrow for folder
    const alternative = document.createElement("div");
    alternative.className = "drag-drop-zone__alternative";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = this.fileImportService
      ? this.fileImportService.getSupportedExtensions().join(",")
      : this.duckDBService.getSupportedFileTypes().join(",");
    fileInput.style.display = "none";
    fileInput.multiple = true;

    const splitButton = document.createElement("div");
    splitButton.className = "drag-drop-zone__split-button";

    const mainButton = document.createElement("button");
    mainButton.className = "drag-drop-zone__browse-button";
    mainButton.textContent = "Browse Files";
    mainButton.addEventListener("click", () => fileInput.click());

    const dropdownButton = document.createElement("button");
    dropdownButton.className = "drag-drop-zone__browse-dropdown";
    dropdownButton.textContent = "▾";
    dropdownButton.title = "Browse Folder";

    const dropdownMenu = document.createElement("div");
    dropdownMenu.className = "drag-drop-zone__dropdown-menu";
    dropdownMenu.style.display = "none";

    const folderOption = document.createElement("div");
    folderOption.className = "drag-drop-zone__dropdown-item";
    folderOption.textContent = "Browse Folder";
    folderOption.addEventListener("click", () => {
      dropdownMenu.style.display = "none";
      this.onBrowseFolderCallback?.();
    });
    dropdownMenu.appendChild(folderOption);

    dropdownButton.addEventListener("click", () => {
      dropdownMenu.style.display = dropdownMenu.style.display === "none" ? "block" : "none";
    });

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
      if (!splitButton.contains(e.target as Node)) {
        dropdownMenu.style.display = "none";
      }
    });

    splitButton.appendChild(mainButton);
    splitButton.appendChild(dropdownButton);
    splitButton.appendChild(dropdownMenu);
    alternative.appendChild(splitButton);
    alternative.appendChild(fileInput);

    // Assemble drop zone
    this.dropZone.appendChild(icon);
    this.dropZone.appendChild(title);
    this.dropZone.appendChild(description);
    this.dropZone.appendChild(alternative);

    this.container.appendChild(this.dropZone);

    // Setup file input event
    fileInput.addEventListener("change", (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this._handleFiles(Array.from(files));
      }
    });

  }

  private setupEventListeners(): void {
    // Prevent default browser drag and drop behavior
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      this.dropZone.addEventListener(eventName, this.preventDefaults, false);
      document.body.addEventListener(eventName, this.preventDefaults, false);
    });

    // Handle drag events
    ["dragenter", "dragover"].forEach((eventName) => {
      this.dropZone.addEventListener(eventName, () => this._handleDragEnter(), false);
    });

    ["dragleave", "drop"].forEach((eventName) => {
      this.dropZone.addEventListener(eventName, () => this._handleDragLeave(), false);
    });

    // Handle file drop
    this.dropZone.addEventListener("drop", (e) => this._handleDrop(e), false);
  }

  private preventDefaults(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
  }

  private _handleDragEnter(): void {
    if (!this.isDragOver) {
      this.isDragOver = true;
      this.dropZone.classList.add("drag-drop-zone__area--active");
    }
  }

  private _handleDragLeave(): void {
    this.isDragOver = false;
    this.dropZone.classList.remove("drag-drop-zone__area--active");
  }

  private _handleDrop(e: DragEvent): void {
    this._handleDragLeave();

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      this._handleFiles(files);
    }
  }

  private async _handleFiles(files: File[]): Promise<void> {
    for (const file of files) {
      // Use FileImportService if available, fallback to old CSV-only path
      if (this.fileImportService) {
        if (!this.fileImportService.canImport(file.name)) {
          this.showError(`Unsupported file type: ${file.name.split(".").pop() || "unknown"}`);
          return;
        }

        try {
          this.showLoading();
          const result = await this.fileImportService.importFile(file);
          this.hideLoading();
          this.options.onFileDropped?.(result);
        } catch (error) {
          this.hideLoading();
          this.showError(`Failed to import file: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      } else {
        // Legacy fallback
        if (!this.duckDBService.isSupportedFileType(file)) {
          this.showError(`Unsupported file type: ${file.type || "unknown"}. Please use CSV or TSV files.`);
          return;
        }

        try {
          this.showLoading();
          const tableName = file.name.replace(/\.[^/.]+$/, "");
          const result = await this.duckDBService.importFile(file, tableName, {
            fileType: "csv",
            hasHeader: true,
            delimiter: ",",
          });
          this.hideLoading();
          this.options.onFileDropped?.(result);
        } catch (error) {
          this.hideLoading();
          this.showError(`Failed to parse file: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }
  }

  private showLoading(): void {
    this.dropZone.classList.add("drag-drop-zone__area--loading");

    // Update content to show loading state
    const existingContent = this.dropZone.innerHTML;
    this.dropZone.setAttribute("data-original-content", existingContent);

    this.dropZone.innerHTML = `
      <div class="drag-drop-zone__loading">
        <div class="drag-drop-zone__spinner"></div>
        <h3>Processing File...</h3>
        <p>Please wait while we parse your data</p>
      </div>
    `;
  }

  private hideLoading(): void {
    this.dropZone.classList.remove("drag-drop-zone__area--loading");

    // Restore original content
    const originalContent = this.dropZone.getAttribute("data-original-content");
    if (originalContent) {
      this.dropZone.innerHTML = originalContent;
      this.dropZone.removeAttribute("data-original-content");
    }
  }

  private showError(message: string): void {
    if (this.options.onError) {
      this.options.onError(message);
    } else {
      // Fallback: show error in console and update UI temporarily
      console.error("DragDropZone Error:", message);

      const originalContent = this.dropZone.innerHTML;
      this.dropZone.innerHTML = `
        <div class="drag-drop-zone__error">
          <div class="drag-drop-zone__icon drag-drop-zone__icon--error">⚠️</div>
          <h3>Error</h3>
          <p>${message}</p>
          <button class="drag-drop-zone__retry-button">Try Again</button>
        </div>
      `;

      // Auto-restore after 5 seconds or on retry button click
      const retryButton = this.dropZone.querySelector(".drag-drop-zone__retry-button");
      const restore = () => {
        this.dropZone.innerHTML = originalContent;
      };

      retryButton?.addEventListener("click", restore);
      setTimeout(restore, 5000);
    }
  }
}
