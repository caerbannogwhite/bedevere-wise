import { FocusableComponent } from "../BrianApp/types";
import { Command, CommandParameter } from "./CommandPalette";

export class ParameterForm implements FocusableComponent {
  public readonly componentId: string;
  public readonly canReceiveFocus: boolean = true;
  public readonly focusableElement: HTMLElement;

  private container!: HTMLElement;
  private parameterValues: Record<string, string> = {};
  private onExecute: (parameters: Record<string, string>) => void;
  private _isFocused: boolean = false;
  private currentOptionsDropdown?: HTMLElement;
  private currentSelectedIndex: number = -1;

  constructor(parent: HTMLElement, componentId: string, onExecute: (parameters: Record<string, string>) => void) {
    this.componentId = componentId;
    this.container = document.createElement("div");
    this.container.className = "command-palette__parameter-form";
    this.container.style.position = "relative";
    this.focusableElement = this.container;

    parent.appendChild(this.container);

    this.onExecute = onExecute;
  }

  public focus(): void {
    this.focusableElement.focus();
    this._isFocused = true;
  }

  public blur(): void {
    this.focusableElement.blur();
    this._isFocused = false;
  }

  public isFocused(): boolean {
    return this._isFocused;
  }

  public destroy(): void {
    this.container.remove();
  }

  public async handleKeyUp(e: KeyboardEvent): Promise<boolean> {
    if (e.key === "Enter") {
      // If there's a dropdown and an item is selected, use that value
      if (this.currentOptionsDropdown && this.currentSelectedIndex >= 0) {
        const selectedOption = this.currentOptionsDropdown.children[this.currentSelectedIndex] as HTMLElement;
        if (selectedOption) {
          const input = e.target as HTMLInputElement;
          const value = selectedOption.textContent || "";
          input.value = value;
          this.parameterValues[input.getAttribute("data-param-name") || ""] = value;
          this.hideOptionsDropdown();
          return true;
        }
      }
      this.executeWithParameters();
      return true;
    }
    
    if (e.key === "ArrowDown" && this.currentOptionsDropdown) {
      this.currentSelectedIndex = Math.min(
        this.currentSelectedIndex + 1, 
        this.currentOptionsDropdown.children.length - 1
      );
      this.updateDropdownSelection();
      return true;
    }
    
    if (e.key === "ArrowUp" && this.currentOptionsDropdown) {
      this.currentSelectedIndex = Math.max(this.currentSelectedIndex - 1, 0);
      this.updateDropdownSelection();
      return true;
    }
    
    if (e.key === "Escape" && this.currentOptionsDropdown) {
      this.hideOptionsDropdown();
      return true;
    }
    
    return false;
  }

  public render(currentCommand: Command): void {
    if (!currentCommand.parameters) return;

    this.container.innerHTML = "";

    // Title section
    const titleSection = document.createElement("div");
    titleSection.className = "command-palette__parameter-title";
    titleSection.innerHTML = `<span class="command-palette__parameter-prompt">&gt;</span> ${currentCommand.title}`;
    this.container.appendChild(titleSection);

    // Parameters section
    const parametersSection = document.createElement("div");
    parametersSection.className = "command-palette__parameters";
    
    currentCommand.parameters.forEach((param) => {
      const parameterWrapper = document.createElement("div");
      parameterWrapper.className = "command-palette__parameter";
      
      // Label
      const label = document.createElement("label");
      label.className = "command-palette__parameter-label";
      label.textContent = `${param.name}${param.required ? ' *' : ''}`;
      if (param.description) {
        label.title = param.description;
      }
      
      // Input container (for positioning dropdown)
      const inputContainer = document.createElement("div");
      inputContainer.className = "command-palette__parameter-input-container";
      inputContainer.style.position = "relative";
      
      // Input field
      const input = document.createElement("input");
      input.type = "text";
      input.className = "command-palette__parameter-input";
      input.setAttribute("data-param-name", param.name);
      
      const placeholder = param.description || param.name;
      input.placeholder = placeholder;
      
      if (param.default) {
        input.value = param.default;
        this.parameterValues[param.name] = param.default;
      }

      // Event listeners
      input.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        this.parameterValues[param.name] = target.value;
        
        // Show/filter options dropdown if available
        const options = this.getParameterOptions(param);
        if (options.length > 0) {
          this.showOptionsDropdown(input, options, target.value);
        }
      });

      input.addEventListener("focus", (e) => {
        const target = e.target as HTMLInputElement;
        const options = this.getParameterOptions(param);
        if (options.length > 0) {
          this.showOptionsDropdown(input, options, target.value);
        }
      });

      input.addEventListener("blur", () => {
        // Hide dropdown after a short delay to allow for clicks
        setTimeout(() => {
          this.hideOptionsDropdown();
        }, 150);
      });

      inputContainer.appendChild(input);
      parameterWrapper.appendChild(label);
      parameterWrapper.appendChild(inputContainer);
      parametersSection.appendChild(parameterWrapper);
    });

    this.container.appendChild(parametersSection);

    // Floating Execute Button
    const executeButton = document.createElement("button");
    executeButton.className = "command-palette__parameter-execute-floating";
    executeButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="2" y="2" width="12" height="12" rx="2" />
      </svg>
    `;
    executeButton.title = "Execute Command";
    executeButton.addEventListener("click", () => this.executeWithParameters());

    this.container.appendChild(executeButton);

    // Set focus to the first input
    const firstInput = this.container.querySelector("input");
    if (firstInput) {
      (firstInput as HTMLInputElement).focus();
    }
  }

  private executeWithParameters(): void {
    this.onExecute(this.parameterValues);
  }

  private getParameterOptions(param: CommandParameter): string[] {
    if (param.type === "boolean") {
      return ["true", "false"];
    }
    if (param.options) {
      return param.options();
    }
    return [];
  }

  private showOptionsDropdown(input: HTMLInputElement, options: string[], currentValue: string): void {
    this.hideOptionsDropdown();

    const filteredOptions = options.filter(option => 
      option.toLowerCase().includes(currentValue.toLowerCase())
    );

    if (filteredOptions.length === 0) {
      input.classList.remove("has-dropdown");
      return;
    }

    const dropdown = document.createElement("div");
    dropdown.className = "command-palette__parameter-dropdown";
    
    filteredOptions.forEach((option) => {
      const optionElement = document.createElement("div");
      optionElement.className = "command-palette__parameter-dropdown-item";
      optionElement.textContent = option;
      optionElement.addEventListener("click", () => {
        input.value = option;
        this.parameterValues[input.getAttribute("data-param-name") || ""] = option;
        this.hideOptionsDropdown();
        input.focus();
      });
      dropdown.appendChild(optionElement);
    });

    // Position dropdown below the input
    const inputContainer = input.parentElement;
    if (inputContainer) {
      inputContainer.appendChild(dropdown);
      this.currentOptionsDropdown = dropdown;
      this.currentSelectedIndex = -1;
      
      // Add visual class to connect input and dropdown
      input.classList.add("has-dropdown");
    }
  }

  private hideOptionsDropdown(): void {
    if (this.currentOptionsDropdown) {
      // Remove the visual connection class from all inputs
      const inputs = this.container.querySelectorAll(".command-palette__parameter-input");
      inputs.forEach(input => input.classList.remove("has-dropdown"));
      
      this.currentOptionsDropdown.remove();
      this.currentOptionsDropdown = undefined;
      this.currentSelectedIndex = -1;
    }
  }

  private updateDropdownSelection(): void {
    if (!this.currentOptionsDropdown) return;

    const items = this.currentOptionsDropdown.children;
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as HTMLElement;
      if (i === this.currentSelectedIndex) {
        item.classList.add("command-palette__parameter-dropdown-item--selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("command-palette__parameter-dropdown-item--selected");
      }
    }
  }
}
