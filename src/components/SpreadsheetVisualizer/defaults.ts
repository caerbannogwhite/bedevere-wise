import { getThemeColors } from "./utils/theme";

export const DEFAULT_CONTAINER_WIDTH = 1200;
export const DEFAULT_CONTAINER_HEIGHT = 800;

export const DEFAULT_MAX_HEIGHT = Number.MAX_SAFE_INTEGER;
export const DEFAULT_MAX_WIDTH = Number.MAX_SAFE_INTEGER;

export const DEFAULT_MIN_HEIGHT = 400;
export const DEFAULT_MIN_WIDTH = 600;

export const DEFAULT_HEIGHT = DEFAULT_CONTAINER_HEIGHT;
export const DEFAULT_WIDTH = DEFAULT_CONTAINER_WIDTH;

export const DEFAULT_CELL_HEIGHT = 24;
export const DEFAULT_MIN_CELL_WIDTH = 50;
export const DEFAULT_MAX_CELL_WIDTH = 1000;

export const DEFAULT_CELL_PADDING = 8;
export const DEFAULT_ROW_HEADER_WIDTH = 60;

// Rendering options
export const DEFAULT_TEXT_RENDERING = "geometricPrecision";
export const DEFAULT_LETTER_SPACING = "1px";
export const DEFAULT_IMAGE_SMOOTHING_ENABLED = true;
export const DEFAULT_IMAGE_SMOOTHING_QUALITY = "high";

export const DEFAULT_BORDER_WIDTH = 1;
export const DEFAULT_FONT_FAMILY = "Consolas, 'Courier New', monospace";
export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_HEADER_FONT_SIZE = 14;

export const DEFAULT_SCROLLBAR_WIDTH = 12;

export const DEFAULT_NA_TEXT = "NA";
export const DEFAULT_TRUE_TEXT = "TRUE";
export const DEFAULT_FALSE_TEXT = "FALSE";
export const DEFAULT_TEXT_ALIGN = "left" as const;
export const DEFAULT_DATE_FORMAT = "yyyy-MM-dd";
export const DEFAULT_DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss";
export const DEFAULT_NUMBER_FORMAT = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
export const DEFAULT_DATETIME_LOCALE = new Intl.Locale("en-UK");

export const DEFAULT_MAX_FORMAT_GUESS_LENGTH = 200; // same as cache chunk size
export const DEFAULT_PERCENT_FORMAT_GUESS_FIT = 0.8;

// Cache options
export const DEFAULT_INITIAL_CACHE_SIZE = 200;
export const DEFAULT_CACHE_CHUNK_SIZE = 50;
export const DEFAULT_MAX_CACHE_SIZE = 1000;
export const DEFAULT_CACHE_TIME_TO_LIVE = 1000 * 60 * 1; // 5 minutes

// Get theme-aware colors
function getDefaultColors() {
  return getThemeColors();
}

// Export functions that return theme-aware defaults
export function getDefaultHeaderBackgroundColor(): string {
  return getDefaultColors().headerBackgroundColor;
}

export function getDefaultHeaderTextColor(): string {
  return getDefaultColors().headerTextColor;
}

export function getDefaultCellBackgroundColor(): string {
  return getDefaultColors().cellBackgroundColor;
}

export function getDefaultCellTextColor(): string {
  return getDefaultColors().cellTextColor;
}

export function getDefaultBorderColor(): string {
  return getDefaultColors().borderColor;
}

export function getDefaultSelectionColor(): string {
  return getDefaultColors().selectionColor;
}

export function getDefaultSelectionBorderColor(): string {
  return getDefaultColors().selectionBorderColor;
}

export function getDefaultHoverColor(): string {
  return getDefaultColors().hoverColor;
}

export function getDefaultHoverBorderColor(): string {
  return getDefaultColors().hoverBorderColor;
}

export function getDefaultScrollbarColor(): string {
  return getDefaultColors().scrollbarColor;
}

export function getDefaultScrollbarThumbColor(): string {
  return getDefaultColors().scrollbarThumbColor;
}

export function getDefaultScrollbarHoverColor(): string {
  return getDefaultColors().scrollbarHoverColor;
}

export function getDefaultBooleanStyle() {
  return getDefaultColors().booleanStyle;
}

export function getDefaultNumericStyle() {
  return getDefaultColors().numericStyle;
}

export function getDefaultStringStyle() {
  return getDefaultColors().stringStyle;
}

export function getDefaultDateStyle() {
  return getDefaultColors().dateStyle;
}

export function getDefaultDatetimeStyle() {
  return getDefaultColors().datetimeStyle;
}

export function getDefaultNullStyle() {
  return getDefaultColors().nullStyle;
}
