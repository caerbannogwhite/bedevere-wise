export interface CommandParameter {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: string;
  options?: string[];
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

export class CommandPalette {
  private container!: HTMLElement;
  private overlay!: HTMLElement;
  private input!: HTMLInputElement;
  private commandList!: HTMLElement;
  private parameterForm!: HTMLElement;
  private commands: Map<string, Command> = new Map();
  private filteredCommands: Command[] = [];
  private selectedIndex: number = 0;
  private isVisible: boolean = false;
  private showingParameters: boolean = false;
  private currentCommand?: Command;
  private parameterValues: Record<string, any> = {};
  private onHideCallback?: () => void;

  constructor(parent: HTMLElement) {
    this.createElements();
    parent.appendChild(this.container);

    this.setupEventListeners();
    this.registerDefaultCommands();
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
    this.showingParameters = false;
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
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = "none";
    this.overlay.style.display = "none";
    this.input.blur();

    if (this.onHideCallback) {
      this.onHideCallback();
    }
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
    this.input.className = "command-palette__input";
    this.input.placeholder = "Type a command...";

    // Command list
    this.commandList = document.createElement("div");
    this.commandList.className = "command-palette__list";

    // Parameter form
    this.parameterForm = document.createElement("div");
    this.parameterForm.className = "command-palette__parameters";
    this.parameterForm.style.display = "none";

    document.body.appendChild(this.overlay);

    this.container.appendChild(this.input);
    this.container.appendChild(this.commandList);
    this.container.appendChild(this.parameterForm);
  }

  private setupEventListeners(): void {
    // Global keyboard shortcut
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        this.toggle();
      } else if (e.key === "Escape" && this.isVisible) {
        this.hide();
      }
    });

    this.overlay.addEventListener("click", (e) => {
      if (this.isVisible) {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      }
    });

    this.overlay.addEventListener("mousemove", (e) => {
      if (this.isVisible) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    this.container.addEventListener("mousemove", (e) => {
      if (this.isVisible) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    this.input.addEventListener("input", () => this.filterCommands());
    this.input.addEventListener("keydown", (e) => this.handleKeyDown(e));
  }

  private filterCommands(): void {
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

  private handleKeyDown(e: KeyboardEvent): void {
    e.stopPropagation();

    // Handle parameter form navigation
    if (this.showingParameters) {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          this.showCommandList();
          this.filterCommands();
          this.selectedIndex = 0;
          this.updateSelection();
          break;
        case "Enter":
          e.preventDefault();
          this.executeWithParameters();
          break;
      }
      return;
    }

    // Handle command list navigation
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredCommands.length - 1);
        this.updateSelection();
        break;
      case "ArrowUp":
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
        break;
      case "Enter":
        e.preventDefault();
        if (this.filteredCommands[this.selectedIndex]) {
          this.executeCommand(this.filteredCommands[this.selectedIndex]);
        }
        break;
      case "Escape":
        this.hide();
        break;
    }
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
    this.parameterForm.style.display = "none";
    this.input.placeholder = "Type a command...";
    this.showingParameters = false;
  }

  private showParameterForm(): void {
    this.input.style.display = "none";
    this.commandList.style.display = "none";
    this.parameterForm.style.display = "block";
    this.input.placeholder = "Press Escape to go back...";
    this.showingParameters = true;
  }

  private async executeCommand(command: Command): Promise<void> {
    try {
      // Check if command has parameters
      if (command.parameters && command.parameters.length > 0) {
        this.currentCommand = command;
        this.parameterValues = {};
        this.renderParameterForm();
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

  private renderParameterForm(): void {
    if (!this.currentCommand?.parameters) return;

    this.parameterForm.innerHTML = "";

    // Title
    const title = document.createElement("div");
    title.className = "command-palette__parameter-title";
    title.textContent = this.currentCommand.title;
    this.parameterForm.appendChild(title);

    // Parameters
    this.currentCommand.parameters.forEach((param) => {
      const paramContainer = document.createElement("div");
      paramContainer.className = "command-palette__parameter";

      // const label = document.createElement("label");
      // label.className = "command-palette__parameter-label";
      // label.textContent = `${param.name}${param.required ? " *" : ""}`;
      // if (param.description) {
      //   label.title = param.description;
      // }

      let input: HTMLElement;

      if (param.options && param.options.length > 0) {
        // Dropdown for options
        const select = document.createElement("select");
        select.className = "command-palette__parameter-input";

        if (!param.required) {
          const emptyOption = document.createElement("option");
          emptyOption.value = "";
          emptyOption.textContent = "-- Select --";
          select.appendChild(emptyOption);
        }

        param.options.forEach((option) => {
          const optionElement = document.createElement("option");
          optionElement.value = option;
          optionElement.textContent = option;
          if (param.default === option) {
            optionElement.selected = true;
          }
          select.appendChild(optionElement);
        });

        select.addEventListener("change", () => {
          this.parameterValues[param.name] = select.value;
        });

        if (param.default) {
          this.parameterValues[param.name] = param.default;
        }

        input = select;
      } else if (param.type === "boolean") {
        // Checkbox for boolean
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "command-palette__parameter-input";
        checkbox.checked = param.default === "true";

        checkbox.addEventListener("change", () => {
          this.parameterValues[param.name] = checkbox.checked;
        });

        this.parameterValues[param.name] = checkbox.checked;
        input = checkbox;
      } else {
        // Text input for other types
        const textInput = document.createElement("input");
        textInput.type = param.type === "number" ? "number" : "text";
        textInput.className = "command-palette__parameter-input";
        textInput.placeholder = param.description || "";
        textInput.value = param.default || "";

        textInput.addEventListener("input", () => {
          const value = param.type === "number" ? (textInput.value ? parseFloat(textInput.value) : undefined) : textInput.value;
          this.parameterValues[param.name] = value;
        });

        if (param.default) {
          const value = param.type === "number" ? parseFloat(param.default) : param.default;
          this.parameterValues[param.name] = value;
        }

        input = textInput;
      }

      // paramContainer.appendChild(label);
      paramContainer.appendChild(input);
      this.parameterForm.appendChild(paramContainer);
    });

    // Focus on the first parameter
    const firstParam = this.parameterForm.querySelector(".command-palette__parameter-input");
    if (firstParam) {
      (firstParam as HTMLInputElement).focus();
    }

    // Buttons
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "command-palette__parameter-buttons";

    const executeButton = document.createElement("button");
    executeButton.className = "command-palette__parameter-button command-palette__parameter-button--execute";
    executeButton.textContent = "Execute";
    executeButton.addEventListener("click", () => this.executeWithParameters());

    const cancelButton = document.createElement("button");
    cancelButton.className = "command-palette__parameter-button command-palette__parameter-button--cancel";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => this.showCommandList());

    buttonContainer.appendChild(executeButton);
    buttonContainer.appendChild(cancelButton);
    this.parameterForm.appendChild(buttonContainer);
  }

  private async executeWithParameters(): Promise<void> {
    if (!this.currentCommand) return;

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
          options: ["info", "warning", "error", "success"],
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
