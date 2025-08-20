import { SpreadsheetOptions } from "./types";
import { DataProvider } from "../../data/types";
import { ColumnStatsVisualizer } from "../ColumnStatsVisualizer/ColumnStatsVisualizer";
import { SpreadsheetVisualizerFocusable } from "./SpreadsheetVisualizerFocusable";

export class SpreadsheetVisualizer extends SpreadsheetVisualizerFocusable {
  constructor(
    container: HTMLElement,
    dataProvider: DataProvider,
    options: Partial<SpreadsheetOptions> = {},
    statsVisualizer?: ColumnStatsVisualizer,
    componentId?: string
  ) {
    super(container, dataProvider, options, statsVisualizer, componentId ?? "spreadsheet-visualizer");
  }
}
