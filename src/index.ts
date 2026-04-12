// Main components
export { BrianApp } from "./components/BrianApp";
export { MultiDatasetVisualizer } from "./components/MultiDatasetVisualizer";
export { ControlPanel } from "./components/ControlPanel";
export { SpreadsheetVisualizer } from "./components/SpreadsheetVisualizer";
export { ColumnStatsVisualizer } from "./components/ColumnStatsVisualizer/ColumnStatsVisualizer";
export { StatusBar } from "./components/StatusBar";
export { CommandPalette } from "./components/CommandPalette";
export { DragDropZone } from "./components/DragDropZone";
export { CommandBar } from "./components/CommandBar";

// Data types and utilities
export type { DataProvider } from "./data/types";

// New component types
export type { BrianAppOptions } from "./components/BrianApp";
export type { StatusBarItem } from "./components/StatusBar";
export type { Command } from "./components/CommandPalette";
export type { DragDropZoneOptions } from "./components/DragDropZone";
export type { CommandBarOptions, CellInfo } from "./components/CommandBar";

// SpreadsheetVisualizer types
export type { SpreadsheetOptions } from "./components/SpreadsheetVisualizer/types";

// Import styles
import "./styles/main.scss";
