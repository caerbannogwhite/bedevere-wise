import { DuckDBService } from "@/data/DuckDBService";
import { FileImportService } from "@/data/FileImportService";

export interface DragDropZoneOptions {
  onFilesReceived?: (files: File[]) => void | Promise<void>;
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
  private descriptionElement: HTMLElement | null = null;
  private fileInput: HTMLInputElement | null = null;

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
    // createDropZone ran before this service was wired in, so the
    // "Supported formats" line and file input's accept list both reflect
    // the DuckDB-only fallback. Refresh them now that the real list
    // (xlsx/xpt/sav/dta/sas7bdat etc.) is available.
    this.refreshSupportedFormats();
  }

  private refreshSupportedFormats(): void {
    const formats = this.fileImportService
      ? this.fileImportService.getSupportedExtensions()
      : this.duckDBService.getSupportedFileTypes();
    if (this.descriptionElement) {
      this.descriptionElement.innerHTML = `
        Drop a file here to automatically add it as a dataset<br>
        <small>Supported formats: ${formats.join(", ")}</small>
      `;
    }
    if (this.fileInput) {
      this.fileInput.accept = formats.join(",");
    }
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

  public setOnFilesReceivedCallback(callback: (files: File[]) => void | Promise<void>): void {
    this.options.onFilesReceived = callback;
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
    this.descriptionElement = description;

    // Create alternative action — split button: main "Browse" + dropdown arrow for folder
    const alternative = document.createElement("div");
    alternative.className = "drag-drop-zone__alternative";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.style.display = "none";
    fileInput.multiple = true;
    this.fileInput = fileInput;

    // Populate description + accept from whichever service is available now.
    this.refreshSupportedFormats();

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
    // Validate every file before handing off, so the caller gets a clean batch.
    const supported: File[] = [];
    for (const file of files) {
      if (this.fileImportService) {
        if (!this.fileImportService.canImport(file.name)) {
          this.showError(`Unsupported file type: ${file.name.split(".").pop() || "unknown"}`);
          return;
        }
      } else if (!this.duckDBService.isSupportedFileType(file)) {
        this.showError(`Unsupported file type: ${file.type || "unknown"}.`);
        return;
      }
      supported.push(file);
    }

    if (supported.length === 0) return;
    if (!this.options.onFilesReceived) return;

    try {
      this.showLoading();
      await this.options.onFilesReceived(supported);
      this.hideLoading();
    } catch (error) {
      this.hideLoading();
      this.showError(`Failed to handle files: ${error instanceof Error ? error.message : "Unknown error"}`);
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
