import { FocusableComponent } from "../BrianApp/types";
import { Command } from "./CommandPalette";

export class ParameterForm implements FocusableComponent {
  public readonly componentId: string;
  public readonly canReceiveFocus: boolean = true;
  public readonly focusableElement: HTMLElement;

  private container!: HTMLElement;
  private parameterValues: Record<string, string> = {};
  private onExecute: (parameters: Record<string, string>) => void;
  private _isFocused: boolean = false;

  constructor(parent: HTMLElement, componentId: string, onExecute: (parameters: Record<string, string>) => void) {
    this.componentId = componentId;
    this.container = document.createElement("div");
    this.container.className = "command-palette__parameter-form";
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
      this.executeWithParameters();
      return true;
    }
    return false;
  }

  public render(currentCommand: Command): void {
    if (!currentCommand.parameters) return;

    this.container.innerHTML = "";

    const parameterCommandLine = document.createElement("div");
    parameterCommandLine.className = "command-palette__parameter-line";

    const parameterOptions = document.createElement("div");
    parameterOptions.className = "command-palette__parameter-options";

    const innerHTML = `<span class="command-palette__parameter-prompt">&gt;</span>
    <span class="command-palette__parameter-title">${currentCommand.title}</span>${currentCommand.parameters
      .map((param) => {
        const paramContainer = document.createElement("span");
        paramContainer.className = `command-palette__parameter${param.required ? "" : "-optional"}`;

        const placeholder = `${param.name || ""}${param.default ? `: ${param.default}` : ""}`;
        const paramInput = document.createElement("input");
        paramInput.type = param.type;
        paramInput.className = "command-palette__parameter-input";
        paramInput.placeholder = placeholder;

        // Event listeners

        paramInput.addEventListener("focus", (e) => {
          e.stopPropagation();
          // Dropdown for options
          console.log("focus", param.options?.());
          if (param.options) {
            const options = param.options?.();
            if (options.length > 0) {
              param.options().forEach((option) => {
                const optionElement = document.createElement("option");
                optionElement.value = option;
                optionElement.textContent = option;
                if (param.default === option) {
                  optionElement.selected = true;
                }
                parameterOptions.appendChild(optionElement);
              });
              if (param.default) {
                this.parameterValues[param.name] = param.default;
              }
            }
          }
        });
        paramInput.addEventListener("change", () => {
          console.log("change", paramInput.value);
          this.parameterValues[param.name] = paramInput.value;
        });
        paramInput.addEventListener("input", () => {
          console.log("input", paramInput.value);
          this.parameterValues[param.name] = paramInput.value;
        });

        paramContainer.appendChild(paramInput);
        return paramContainer.outerHTML;
      })
      .join("")}`;

    parameterCommandLine.innerHTML = innerHTML;
    this.container.appendChild(parameterCommandLine);
    this.container.appendChild(parameterOptions);

    // Buttons
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "command-palette__parameter-buttons";

    const executeButton = document.createElement("button");
    executeButton.className = "command-palette__parameter-button command-palette__parameter-button--execute";
    executeButton.textContent = "Execute";
    executeButton.addEventListener("click", () => this.executeWithParameters());

    buttonContainer.appendChild(executeButton);
    this.container.appendChild(buttonContainer);

    // set focus to the first input
    const firstInput = this.container.querySelector("input");
    if (firstInput) {
      firstInput.focus();
    }
  }

  private executeWithParameters(): void {
    this.onExecute(this.parameterValues);
  }
}
