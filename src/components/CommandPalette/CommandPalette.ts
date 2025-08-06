import { EventDispatcher, FocusableComponent } from "../BrianApp/types";
import { ParameterForm } from "./ParameterForm";

export interface CommandParameter {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: string;
  options?: () => string[];
}

export interface Command {
  id: string;
  title: string;
  parameters?: CommandParameter[];
  description?: string;
  category?: string;
  keybinding?: string;
  icon?: string;
  when?: () => boolean;
  execute: (params?: Record<string, any>) => void | Promise<void>;
}

export class CommandPalette implements FocusableComponent {
  public readonly componentId: string;
  public readonly canReceiveFocus: boolean = true;
  public readonly focusableElement: HTMLElement;

  private container!: HTMLElement;
  private overlay!: HTMLElement;
  private input!: HTMLInputElement;
  private commandList!: HTMLElement;
  private commands: Map<string, Command> = new Map();
  private filteredCommands: Command[] = [];
  private selectedIndex: number = 0;
  private isVisible: boolean = false;
  private showingParameterForm: boolean = false;
  private currentCommand?: Command;
  private parameterValues: Record<string, any> = {};
  private eventDispatcher?: EventDispatcher;
  private _isFocused: boolean = false;
  private onHideCallback?: () => void;

  private parameterForm?: ParameterForm;

  constructor(parent: HTMLElement, componentId: string) {
    this.componentId = componentId;

    this.createElements();
    parent.appendChild(this.container);
    this.focusableElement = this.container;

    this.registerDefaultCommands();
  }

  // FocusableComponent interface methods
  public focus(): void {
    this._isFocused = true;
    this.focusableElement.focus();
  }

  public blur(): void {
    this._isFocused = false;
    this.focusableElement.blur();
  }

  public isFocused(): boolean {
    return this._isFocused;
  }

  public setEventDispatcher(eventDispatcher: EventDispatcher): void {
    this.eventDispatcher = eventDispatcher;
  }

  public async handleMouseDown(event: MouseEvent): Promise<boolean> {
    if (!this._isFocused) return false;

    // check if the mouse clicked the overlay
    if (this.overlay.contains(event.target as Node)) {
      this.hide();
      return true;
    }

    // check if the mouse clicked the input
    if (this.input.contains(event.target as Node)) {
      this.input.focus();
      return true;
    }

    return false;
  }

  public async handleMouseMove(_: MouseEvent): Promise<boolean> {
    if (!this._isFocused) return false;
    return true;
  }

  public async handleKeyUp(e: KeyboardEvent): Promise<boolean> {
    if (!this._isFocused) return false;

    switch (e.key) {
      case "Escape":
      case "Enter":
      case "ArrowDown":
      case "ArrowUp":
        return true;

      default:
        return this.filterCommands(e);
    }
  }

  public async handleKeyDown(e: KeyboardEvent): Promise<boolean> {
    if (!this._isFocused) return false;

    // Handle parameter form navigation
    if (this.showingParameterForm) {
      switch (e.key) {
        case "Escape":
          this.showCommandList();
          this.filterCommands();
          this.selectedIndex = 0;
          this.updateSelection();
          break;

        case "Enter":
          this.executeWithParameters();
          break;
      }
      return true;
    }

    // Handle command list navigation
    switch (e.key) {
      case "ArrowDown":
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredCommands.length - 1);
        this.updateSelection();
        return true;

      case "ArrowUp":
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
        return true;

      case "Enter":
        if (this.filteredCommands[this.selectedIndex]) {
          this.executeCommand(this.filteredCommands[this.selectedIndex]);
        }
        return true;

      case "Escape":
        this.hide();
        return true;

      default:
        return this.filterCommands(e);
    }
  }

  public registerCommand(command: Command): void {
    this.commands.set(command.id, command);
    if (this.isVisible) {
      this.filterCommands();
    }
  }

  public unregisterCommand(id: string): void {
    this.commands.delete(id);
    if (this.isVisible) {
      this.filterCommands();
    }
  }

  public show(): void {
    this.isVisible = true;
    this.showingParameterForm = false;
    this.currentCommand = undefined;
    this.parameterValues = {};
    this.container.style.display = "block";
    this.overlay.style.display = "block";
    this.input.value = "";
    this.input.focus();
    this.showCommandList();
    this.filterCommands();
    this.selectedIndex = 0;
    this.updateSelection();

    this.eventDispatcher?.setFocus(this.componentId);
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = "none";
    this.overlay.style.display = "none";
    this.input.blur();

    if (this.onHideCallback) {
      this.onHideCallback();
    }

    this.eventDispatcher?.popFocus();
  }

  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public setOnHideCallback(callback: () => void): void {
    this.onHideCallback = callback;
  }

  public isVisibleState(): boolean {
    return this.isVisible;
  }

  public destroy(): void {
    this.container.remove();
  }

  // Accessor methods for wrapper
  public getContainer(): HTMLElement {
    return this.container;
  }

  private createElements(): void {
    // Overlay
    this.overlay = document.createElement("div");
    this.overlay.className = "command-palette-overlay";
    this.overlay.style.display = "none";

    // Container
    this.container = document.createElement("div");
    this.container.className = "command-palette";
    this.container.style.display = "none";

    // Input
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.id = "command-palette-input-main";
    this.input.className = "command-palette__input";
    this.input.placeholder = "Type a command...";

    // Command list
    this.commandList = document.createElement("div");
    this.commandList.className = "command-palette__list";

    document.body.appendChild(this.overlay);

    this.container.appendChild(this.input);
    this.container.appendChild(this.commandList);
  }

  private filterCommands(e?: KeyboardEvent): boolean {
    if (e?.target !== this.input) return false;

    const query = this.input.value.toLowerCase();
    this.filteredCommands = Array.from(this.commands.values())
      .filter((command) => {
        // Check if command should be shown (when condition)
        if (command.when && !command.when()) {
          return false;
        }

        // Filter by search query
        if (query === "") {
          return true;
        }

        return (
          command.title.toLowerCase().includes(query) ||
          command.description?.toLowerCase().includes(query) ||
          command.category?.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        // Sort by relevance (title matches first, then description, then category)
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();

        if (aTitle.startsWith(query) && !bTitle.startsWith(query)) return -1;
        if (!aTitle.startsWith(query) && bTitle.startsWith(query)) return 1;
        if (aTitle.includes(query) && !bTitle.includes(query)) return -1;
        if (!aTitle.includes(query) && bTitle.includes(query)) return 1;

        return a.title.localeCompare(b.title);
      });

    this.renderCommands();
    this.selectedIndex = 0;
    this.updateSelection();

    return true;
  }

  private renderCommands(): void {
    this.commandList.innerHTML = "";

    if (this.filteredCommands.length === 0) {
      const noResults = document.createElement("div");
      noResults.className = "command-palette__no-results";
      noResults.textContent = "No commands found";
      this.commandList.appendChild(noResults);
      return;
    }

    this.filteredCommands.forEach((command) => {
      const item = document.createElement("div");
      item.className = "command-palette__item";
      item.addEventListener("click", () => this.executeCommand(command));

      const titleElement = document.createElement("div");
      titleElement.className = "command-palette__item-title";
      titleElement.textContent = command.title;

      const detailsElement = document.createElement("div");
      detailsElement.className = "command-palette__item-details";

      if (command.description) {
        const descElement = document.createElement("span");
        descElement.className = "command-palette__item-description";
        descElement.textContent = command.description;
        detailsElement.appendChild(descElement);
      }

      if (command.keybinding) {
        const keybindingElement = document.createElement("span");
        keybindingElement.className = "command-palette__item-keybinding";
        keybindingElement.textContent = command.keybinding;
        detailsElement.appendChild(keybindingElement);
      }

      item.appendChild(titleElement);
      if (detailsElement.hasChildNodes()) {
        item.appendChild(detailsElement);
      }

      this.commandList.appendChild(item);
    });
  }

  private updateSelection(): void {
    const items = this.commandList.querySelectorAll(".command-palette__item");
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.classList.add("command-palette__item--selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("command-palette__item--selected");
      }
    });
  }

  private showCommandList(): void {
    this.input.style.display = "block";
    this.input.focus();
    this.commandList.style.display = "block";
    this.input.placeholder = "Type a command...";
    this.showingParameterForm = false;

    this.parameterForm?.blur();
    this.parameterForm?.destroy();
  }

  private showParameterForm(): void {
    this.input.style.display = "none";
    this.commandList.style.display = "none";
    this.showingParameterForm = true;

    this.parameterForm = new ParameterForm(this.container, this.componentId, this.executeWithParameters.bind(this));
    this.parameterForm?.render(this.currentCommand!);
    this.parameterForm?.focus();
  }

  private async executeCommand(command: Command): Promise<void> {
    try {
      // Check if command has parameters
      if (command.parameters && command.parameters.length > 0) {
        this.currentCommand = command;
        this.parameterValues = {};
        this.showParameterForm();
        return;
      }

      // Execute command without parameters
      await command.execute();
      this.hide();
    } catch (error) {
      console.error("Error executing command:", error);
    }
  }

  private async executeWithParameters(): Promise<void> {
    if (!this.currentCommand) return;

    console.log(this.parameterValues);

    try {
      // Validate required parameters
      const missingRequired = this.currentCommand.parameters?.filter(
        (param) => param.required && (this.parameterValues[param.name] === undefined || this.parameterValues[param.name] === "")
      );

      if (missingRequired && missingRequired.length > 0) {
        alert(`Please fill in required parameters: ${missingRequired.map((p) => p.name).join(", ")}`);
        return;
      }

      await this.currentCommand.execute(this.parameterValues);
      this.hide();
    } catch (error) {
      console.error("Error executing command with parameters:", error);
    }
  }

  private registerDefaultCommands(): void {
    this.registerCommand({
      id: "workbench.action.showCommands",
      title: "Show All Commands",
      description: "Show command palette",
      category: "View",
      keybinding: "Ctrl+P",
      execute: () => {
        // This command shows the palette itself, so we don't need to do anything
      },
    });

    this.registerCommand({
      id: "workbench.action.reload",
      title: "Reload Window",
      description: "Reload the current window",
      category: "Developer",
      keybinding: "Ctrl+R",
      execute: () => {
        window.location.reload();
      },
    });

    this.registerCommand({
      id: "workbench.action.toggleFullScreen",
      title: "Toggle Full Screen",
      description: "Toggle full screen mode",
      category: "View",
      keybinding: "F11",
      execute: () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
      },
    });

    // Example command with parameters for testing
    this.registerCommand({
      id: "developer.action.showAlert",
      title: "Show Alert",
      description: "Show a custom alert message with various options",
      category: "Developer",
      parameters: [
        {
          name: "message",
          type: "string",
          description: "The message to display",
          required: true,
        },
        {
          name: "title",
          type: "string",
          description: "Optional title for the alert",
          required: false,
          default: "Alert",
        },
        {
          name: "type",
          type: "string",
          description: "Type of alert to show",
          required: false,
          default: "info",
          options: () => ["info", "warning", "error", "success"],
        },
        {
          name: "showConfirm",
          type: "boolean",
          description: "Show a confirmation button",
          required: false,
          default: "false",
        },
        {
          name: "timeout",
          type: "number",
          description: "Auto-hide timeout in seconds",
          required: false,
        },
      ],
      execute: (params) => {
        const { message, title, type, showConfirm, timeout } = params || {};

        let alertMessage = `${title || "Alert"}: ${message || "No message"}`;
        if (type) {
          alertMessage = `[${type.toUpperCase()}] ${alertMessage}`;
        }
        if (showConfirm) {
          alertMessage += "\n\nPress OK to continue.";
        }
        if (timeout) {
          alertMessage += `\n\nThis alert will auto-close in ${timeout} seconds.`;
          setTimeout(() => {
            console.log("Alert auto-closed after timeout");
          }, timeout * 1000);
        }

        alert(alertMessage);
      },
    });
  }
}
