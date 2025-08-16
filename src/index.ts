// Main components
export { BrianApp } from "./components/BrianApp";
export { MultiDatasetVisualizer } from "./components/MultiDatasetVisualizer";
export { DatasetPanel } from "./components/DatasetPanel";
export { SpreadsheetVisualizer } from "./components/SpreadsheetVisualizer";
export { ColumnStatsVisualizer } from "./components/ColumnStatsVisualizer/ColumnStatsVisualizer";
export { StatusBar } from "./components/StatusBar";
export { CommandPalette } from "./components/CommandPalette";
export { DragDropZone } from "./components/DragDropZone";
export { CellValueBar } from "./components/CellValueBar";

// Data types and utilities
export type { DataProvider } from "./data/types";

// New component types
export type { BrianAppOptions } from "./components/BrianApp";
export type { StatusBarItem } from "./components/StatusBar";
export type { Command } from "./components/CommandPalette";
export type { DragDropZoneOptions } from "./components/DragDropZone";
export type { CellValueBarOptions, CellInfo } from "./components/CellValueBar";

// SpreadsheetVisualizer types
export type { SpreadsheetOptions } from "./components/SpreadsheetVisualizer/types";

// Import styles
import "./styles/main.scss";
