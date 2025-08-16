import { DataProvider } from "../../data/types";
import { DuckDBService } from "@/data/DuckDBService";

export interface DragDropZoneOptions {
  onFileDropped?: (dataset: DataProvider) => void;
  onError?: (error: string) => void;
}

export class DragDropZone {
  private container: HTMLElement;
  private dropZone!: HTMLElement;
  private duckDBService: DuckDBService;
  private options: DragDropZoneOptions;
  private isDragOver: boolean = false;

  constructor(parent: HTMLElement, duckDBService: DuckDBService, options: DragDropZoneOptions = {}) {
    this.duckDBService = duckDBService;
    this.options = options;
    this.container = document.createElement("div");
    this.container.className = "drag-drop-zone";

    this.createDropZone();
    this.setupEventListeners();

    parent.appendChild(this.container);
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
    description.innerHTML = `
      Drop a CSV or TSV file here to automatically add it as a dataset<br>
      <small>Supported formats: ${this.duckDBService.getSupportedFileTypes().join(", ")}</small>
    `;

    // Create alternative action
    const alternative = document.createElement("div");
    alternative.className = "drag-drop-zone__alternative";

    const browseButton = document.createElement("button");
    browseButton.className = "drag-drop-zone__browse-button";
    browseButton.textContent = "Browse Files";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = this.duckDBService.getSupportedFileTypes().join(",");
    fileInput.style.display = "none";
    fileInput.multiple = false;

    alternative.appendChild(browseButton);
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
        this._handleFiles([files[0]]);
      }
    });

    // Setup browse button event
    browseButton.addEventListener("click", () => {
      fileInput.click();
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
      if (!this.duckDBService.isSupportedFileType(file)) {
        this.showError(`Unsupported file type: ${file.type || "unknown"}. Please use CSV or TSV files.`);
        return;
      }

      try {
        this.showLoading();

        // const result = await parseFile(file);
        const tableName = file.name.replace(/\.[^/.]+$/, "");
        const result = await this.duckDBService.importFile(file, tableName, {
          fileType: "csv",
          hasHeader: true,
          delimiter: ",",
        });

        this.hideLoading();

        if (this.options.onFileDropped) {
          this.options.onFileDropped(result);
        }
      } catch (error) {
        this.hideLoading();
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        this.showError(`Failed to parse file: ${errorMessage}`);
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
