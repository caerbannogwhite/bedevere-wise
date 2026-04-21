import { FocusableComponent } from "../BedevereApp/types";
import { SpreadsheetVisualizer } from "../SpreadsheetVisualizer/SpreadsheetVisualizer";
import { ColumnStatsVisualizer } from "./ColumnStatsVisualizer";

export class ColumnStatsVisualizerFocusable extends ColumnStatsVisualizer implements FocusableComponent {
  public readonly componentId: string;
  public readonly canReceiveFocus: boolean = true;
  public readonly focusableElement: HTMLElement;

  constructor(parent: HTMLElement, spreadsheetVisualizer: SpreadsheetVisualizer | null) {
    super(parent, spreadsheetVisualizer);

    this.focusableElement = this.getContainer();
    this.componentId = "column-stats-visualizer";
  }

  public focus(): void {
    this.focusableElement.focus();
  }

  public blur(): void {
    this.focusableElement.blur();
  }

  public isFocused(): boolean {
    return this.focusableElement.contains(document.activeElement);
  }
}
