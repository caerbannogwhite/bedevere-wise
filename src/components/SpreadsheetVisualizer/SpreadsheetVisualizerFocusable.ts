import { DataProvider, SpreadsheetOptions } from "@/index";
import { FocusableComponent } from "../BrianApp/types";
import { SpreadsheetVisualizer } from "./SpreadsheetVisualizer";

export class SpreadsheetVisualizerFocusable extends SpreadsheetVisualizer implements FocusableComponent {
  private _isFocused: boolean = false;

  public readonly componentId: string;
  public readonly canReceiveFocus: boolean = true;
  public readonly focusableElement: HTMLElement;

  constructor(parent: HTMLElement, dataProvider: DataProvider, options: SpreadsheetOptions = {}, componentId: string) {
    super(parent, dataProvider, options);
    this.componentId = componentId;
    this.focusableElement = this.getContainer();
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

  // Event handler methods that delegate to SpreadsheetVisualizer
  public async handleMouseDown(event: MouseEvent): Promise<boolean> {
    if (!this._isFocused) return false;
    return await this._handleMouseDown(event);
  }

  public async handleMouseMove(event: MouseEvent): Promise<boolean> {
    if (!this._isFocused) return false;
    return await this._handleMouseMove(event);
  }

  public async handleMouseUp(event: MouseEvent): Promise<boolean> {
    if (!this._isFocused) return false;
    return await this._handleMouseUp(event);
  }

  public async handleMouseLeave(event: MouseEvent): Promise<boolean> {
    if (!this._isFocused) return false;
    return await this._handleMouseLeave(event);
  }

  public async handleWheel(event: WheelEvent): Promise<boolean> {
    if (!this._isFocused) return false;
    return await this._handleWheel(event);
  }

  public async handleKeyDown(event: KeyboardEvent): Promise<boolean> {
    if (!this._isFocused) return false;
    return await this._handleKeyDown(event);
  }

  public async handleResize(_: Event): Promise<boolean> {
    return await this._handleResize();
  }
}
