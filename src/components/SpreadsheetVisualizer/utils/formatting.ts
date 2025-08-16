import { DEFAULT_FALSE_TEXT, DEFAULT_NA_TEXT, DEFAULT_TRUE_TEXT } from "../defaults";
import {
  getDefaultBooleanStyle,
  getDefaultNumericStyle,
  getDefaultStringStyle,
  getDefaultDateStyle,
  getDefaultDatetimeStyle,
  getDefaultNullStyle,
} from "../defaults";
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
    case "DOUBLE":
      const numberFormatOptions = column.guessedFormat || getFormatOptions(column, options);
      return numberFormatOptions
        ? { raw: value, formatted: new Intl.NumberFormat(options.datetimeLocale, numberFormatOptions).format(value) }
        : { raw: value, formatted: value.toLocaleString() };
    case "DATE":
      const dateFormatOptions = column.guessedFormat || getFormatOptions(column, options);
      return dateFormatOptions
        ? { raw: value, formatted: new Intl.DateTimeFormat(options.datetimeLocale, dateFormatOptions).format(value) }
        : { raw: value, formatted: value.toLocaleDateString() };
    case "TIMESTAMP":
      const datetimeFormatOptions = column.guessedFormat || getFormatOptions(column, options);
      return datetimeFormatOptions
        ? { raw: value, formatted: new Intl.DateTimeFormat(options.datetimeLocale, datetimeFormatOptions).format(value) }
        : { raw: value, formatted: value.toLocaleString() };
    case "VARCHAR":
      return { raw: value, formatted: value };
    default:
      return { raw: value, formatted: String(value) };
  }
};

export function getFormattedValueAndStyle(
  value: any,
  column: ColumnInternal,
  options: SpreadsheetOptions
): { raw: any; formatted: string; style: Partial<CellStyle> } {
  // Convert to date or number if needed
  if (column.dataType === "DATE" || column.dataType === "TIMESTAMP") {
    value = new Date(value);
  }

  if (column.dataType === "INTEGER" || column.dataType === "FLOAT" || column.dataType === "BIGINT" || column.dataType === "DOUBLE") {
    value = Number(value);
  }

  // Handle null/undefined values
  if (value === null || value === undefined || (column.dataType !== "VARCHAR" && isNaN(value))) {
    const nullStyle = getDefaultNullStyle();
    return {
      raw: null,
      formatted: formatValue(value, column, options).formatted,
      style: {
        textAlign: "left",
        textColor: nullStyle.textColor,
        backgroundColor: nullStyle.backgroundColor,
      },
    };
  }

  // Handle different data types with theme-aware styling
  switch (column.dataType) {
    case "BOOLEAN":
      const booleanStyle = getDefaultBooleanStyle();
      return {
        raw: value,
        formatted: formatValue(value, column, options).formatted,
        style: {
          textAlign: "center",
          textColor: booleanStyle.textColor,
          backgroundColor: booleanStyle.backgroundColor,
        },
      };

    case "INTEGER":
    case "FLOAT":
    case "BIGINT":
    case "DOUBLE":
      const numericStyle = getDefaultNumericStyle();
      return {
        raw: value,
        formatted: formatValue(value, column, options).formatted,
        style: {
          textAlign: "right",
          textColor: numericStyle.textColor,
          backgroundColor: numericStyle.backgroundColor,
        },
      };

    case "DATE":
      const dateStyle = getDefaultDateStyle();
      return {
        raw: value,
        formatted: formatValue(new Date(value), column, options).formatted,
        style: {
          textAlign: "left",
          textColor: dateStyle.textColor,
          backgroundColor: dateStyle.backgroundColor,
        },
      };

    case "TIMESTAMP":
      const datetimeStyle = getDefaultDatetimeStyle();
      return {
        raw: value,
        formatted: formatValue(new Date(value), column, options).formatted,
        style: {
          textAlign: "left",
          textColor: datetimeStyle.textColor,
          backgroundColor: datetimeStyle.backgroundColor,
        },
      };

    case "VARCHAR":
    default:
      const stringStyle = getDefaultStringStyle();
      return {
        raw: value,
        formatted: formatValue(value, column, options).formatted,
        style: {
          textAlign: "left",
          textColor: stringStyle.textColor,
          backgroundColor: stringStyle.backgroundColor,
        },
      };
  }
}
