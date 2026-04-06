import { DEFAULT_FALSE_TEXT, DEFAULT_NA_TEXT, DEFAULT_TRUE_TEXT } from "../defaults";
import { getThemeColors } from "./theme";
import { SpreadsheetOptions } from "../types";
import { DataType } from "../../../data/types";
import { ColumnInternal, CellStyle } from "../internals";

export function parseFormat(format: string | undefined, type: DataType): any {
  if (!format) return undefined;

  try {
    return JSON.parse(format);
  } catch (e) {
    if (type === "DATE" || type === "TIMESTAMP") {
      const formatMap: { [key: string]: Intl.DateTimeFormatOptions } = {
        "yyyy-MM-dd": { year: "numeric", month: "2-digit", day: "2-digit" },
        "dd/MM/yyyy": { day: "2-digit", month: "2-digit", year: "numeric" },
        "MM/dd/yyyy": { month: "2-digit", day: "2-digit", year: "numeric" },
        "yyyy/MM/dd": { year: "numeric", month: "2-digit", day: "2-digit" },
        "dd-MM-yyyy": { day: "2-digit", month: "2-digit", year: "numeric" },
        "MM-dd-yyyy": { month: "2-digit", day: "2-digit", year: "numeric" },
        yyyyMMdd: { year: "numeric", month: "2-digit", day: "2-digit" },
        ddMMyyyy: { day: "2-digit", month: "2-digit", year: "numeric" },
        MMddyyyy: { month: "2-digit", day: "2-digit", year: "numeric" },
        "yyyy-MM-dd HH:mm:ss": {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        },
        "dd/MM/yyyy HH:mm:ss": {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        },
      };

      const matchedFormat = formatMap[format];
      if (matchedFormat) {
        return matchedFormat;
      }

      if (format.includes("yyyy") || format.includes("MM") || format.includes("dd")) {
        return {
          year: format.includes("yyyy") ? "numeric" : undefined,
          month: format.includes("MM") ? "2-digit" : undefined,
          day: format.includes("dd") ? "2-digit" : undefined,
          hour: format.includes("HH") ? "2-digit" : undefined,
          minute: format.includes("mm") ? "2-digit" : undefined,
          second: format.includes("ss") ? "2-digit" : undefined,
        };
      }
    }
    return undefined;
  }
}

export function getFormatOptions(column: ColumnInternal, options: SpreadsheetOptions): any {
  if (column.format) {
    const parsedFormat = parseFormat(column.format.toString(), column.dataType);
    if (parsedFormat) return parsedFormat;
  }

  switch (column.dataType) {
    case "INTEGER":
    case "BIGINT":
    case "FLOAT":
    case "DOUBLE":
      return parseFormat(options.numberFormat?.toString(), column.dataType);
    case "DATE":
      return parseFormat(options.dateFormat?.toString(), column.dataType);
    case "TIMESTAMP":
      return parseFormat(options.datetimeFormat?.toString(), column.dataType);
    default:
      return undefined;
  }
}

/**
 * Lazily build and cache an {@link Intl.NumberFormat} or {@link Intl.DateTimeFormat}
 * on the column itself. These constructors are measurably expensive — before
 * memoization they were called on every cell render.
 */
function getColumnFormatter(column: ColumnInternal, options: SpreadsheetOptions): Intl.NumberFormat | Intl.DateTimeFormat | null {
  if (column.cachedFormatter) return column.cachedFormatter;

  const formatOptions = column.guessedFormat || getFormatOptions(column, options);
  if (!formatOptions) return null;

  const locale = options.datetimeLocale;
  switch (column.dataType) {
    case "INTEGER":
    case "FLOAT":
    case "BIGINT":
    case "DOUBLE":
      column.cachedFormatter = new Intl.NumberFormat(locale, formatOptions);
      return column.cachedFormatter;
    case "DATE":
    case "TIMESTAMP":
      column.cachedFormatter = new Intl.DateTimeFormat(locale, formatOptions);
      return column.cachedFormatter;
    default:
      return null;
  }
}

export const formatValue = (value: any, column: ColumnInternal, options: SpreadsheetOptions): { raw: any; formatted: string } => {
  // Convert to date or number if needed
  if (column.dataType === "INTEGER" || column.dataType === "FLOAT" || column.dataType === "BIGINT" || column.dataType === "DOUBLE") {
    value = Number(value);
  }

  if (column.dataType === "DATE" || column.dataType === "TIMESTAMP") {
    value = new Date(value);
  }

  // Handle null/undefined values
  if (value === null || value === undefined || (column.dataType !== "VARCHAR" && isNaN(value))) {
    return { raw: null, formatted: options.naText || DEFAULT_NA_TEXT };
  }

  // Handle different data types
  switch (column.dataType) {
    case "BOOLEAN":
      return { raw: value, formatted: value ? options.trueText || DEFAULT_TRUE_TEXT : options.falseText || DEFAULT_FALSE_TEXT };
    case "INTEGER":
    case "FLOAT":
    case "BIGINT":
    case "DOUBLE": {
      const formatter = getColumnFormatter(column, options) as Intl.NumberFormat | null;
      return formatter ? { raw: value, formatted: formatter.format(value) } : { raw: value, formatted: value.toLocaleString() };
    }
    case "DATE": {
      const formatter = getColumnFormatter(column, options) as Intl.DateTimeFormat | null;
      return formatter ? { raw: value, formatted: formatter.format(value) } : { raw: value, formatted: value.toLocaleDateString() };
    }
    case "TIMESTAMP": {
      const formatter = getColumnFormatter(column, options) as Intl.DateTimeFormat | null;
      return formatter ? { raw: value, formatted: formatter.format(value) } : { raw: value, formatted: value.toLocaleString() };
    }
    case "VARCHAR":
      return { raw: value, formatted: value };
    default:
      return { raw: value, formatted: String(value) };
  }
};

export function getFormattedValueAndStyle(
  value: any,
  column: ColumnInternal,
  options: SpreadsheetOptions,
): { raw: any; formatted: string; style: Partial<CellStyle> } {
  // Convert to date or number if needed
  if (column.dataType === "DATE" || column.dataType === "TIMESTAMP") {
    value = new Date(value);
  }

  if (column.dataType === "INTEGER" || column.dataType === "FLOAT" || column.dataType === "BIGINT" || column.dataType === "DOUBLE") {
    value = Number(value);
  }

  // Single cached theme lookup for this call (instead of per-branch calls)
  const theme = getThemeColors();

  // Handle null/undefined values
  if (value === null || value === undefined || (column.dataType !== "VARCHAR" && isNaN(value))) {
    return {
      raw: null,
      formatted: formatValue(value, column, options).formatted,
      style: {
        textAlign: "left",
        textColor: theme.nullStyle.textColor,
        backgroundColor: theme.nullStyle.backgroundColor,
      },
    };
  }

  // Handle different data types with theme-aware styling
  switch (column.dataType) {
    case "BOOLEAN":
      return {
        raw: value,
        formatted: formatValue(value, column, options).formatted,
        style: {
          textAlign: "center",
          textColor: theme.booleanStyle.textColor,
          backgroundColor: theme.booleanStyle.backgroundColor,
        },
      };

    case "INTEGER":
    case "FLOAT":
    case "BIGINT":
    case "DOUBLE":
      return {
        raw: value,
        formatted: formatValue(value, column, options).formatted,
        style: {
          textAlign: "right",
          textColor: theme.numericStyle.textColor,
          backgroundColor: theme.numericStyle.backgroundColor,
        },
      };

    case "DATE":
      return {
        raw: value,
        formatted: formatValue(new Date(value), column, options).formatted,
        style: {
          textAlign: "left",
          textColor: theme.dateStyle.textColor,
          backgroundColor: theme.dateStyle.backgroundColor,
        },
      };

    case "TIMESTAMP":
      return {
        raw: value,
        formatted: formatValue(new Date(value), column, options).formatted,
        style: {
          textAlign: "left",
          textColor: theme.datetimeStyle.textColor,
          backgroundColor: theme.datetimeStyle.backgroundColor,
        },
      };

    case "VARCHAR":
    default:
      return {
        raw: value,
        formatted: formatValue(value, column, options).formatted,
        style: {
          textAlign: "left",
          textColor: theme.stringStyle.textColor,
          backgroundColor: theme.stringStyle.backgroundColor,
        },
      };
  }
}
