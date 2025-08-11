import { ICellSelection } from "../SpreadsheetVisualizer";

export const exportAsText = async (
  selection: ICellSelection,
  includeHeader: boolean,
  includeIndex: boolean,
  separator: string = ",",
  eol: string = "\n"
) => {
  const { rows, columns, formatted } = selection;

  const headers = columns.map((column) => column.name);
  if (includeIndex) {
    headers.unshift("Index");
  }

  // Add the header if requested
  const csvContent: string[] = [];
  if (includeHeader) {
    csvContent.push(headers.join(separator));
  }

  // Add the rows
  csvContent.push(
    ...formatted.map((row, i) => {
      const val = includeIndex ? `${rows[i]}${separator}` : "";
      return (
        val +
        row
          .map((formattedCell) => {
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (formattedCell.includes(separator) || formattedCell.includes('"') || formattedCell.includes(eol)) {
              return `"${formattedCell.replace(/"/g, '""')}"`;
            }
            return formattedCell;
          })
          .join(separator)
      );
    })
  );

  try {
    await navigator.clipboard.writeText(csvContent.join(eol));
  } catch (err) {
    console.error("Failed to copy text to clipboard:", err);
  }
};

export const exportAsHTML = async (selection: ICellSelection, includeHeader: boolean, includeIndex: boolean) => {
  const { rows, columns, formatted } = selection;

  const headers = columns.map((column) => column.name);
  if (includeIndex) {
    headers.unshift("Index");
  }

  const header = headers.map((header) => `<th style="background-color: #f2f2f2; padding: 8px; text-align: left;">${header}</th>`).join("");
  const thead = `<thead><tr>${header}</tr></thead>`;

  // Create HTML table
  const htmlContent = `
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif;">
      ${includeHeader ? thead : ""}
      <tbody>
        ${formatted
          .map((row, i) => {
            const val = includeIndex ? `<td>${rows[i]}</td>` : "";
            return `<tr>${val}${row.map((cell) => `<td style="padding: 8px;">${cell}</td>`).join("")}</tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
  try {
    await navigator.clipboard.writeText(htmlContent);
  } catch (err) {
    console.error("Failed to copy HTML to clipboard:", err);
  }
};

export const exportAsMarkdown = async (selection: ICellSelection, _: boolean, includeIndex: boolean, eol: string = "\n") => {
  const { rows, columns, formatted } = selection;

  const headers = columns.map((column) => column.name);
  if (includeIndex) {
    headers.unshift("Index");
  }

  // Create markdown table
  const markdownContent = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...formatted.map((row, i) => {
      const val = includeIndex ? `${rows[i]} | ` : "";
      return `| ${val}${row.map((cell) => cell).join(" | ")} |`;
    }),
  ].join(eol);

  try {
    await navigator.clipboard.writeText(markdownContent);
  } catch (err) {
    console.error("Failed to copy Markdown to clipboard:", err);
  }
};
