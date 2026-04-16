import { DuckDBService } from "../DuckDBService";
import { DuckDBExtensionLoader } from "../DuckDBExtensionLoader";
import { SupportedFileType } from "../FileTreeTypes";
import { FormatHandler, ImportFileOptions } from "./FormatHandler";

export class ExcelFormatHandler implements FormatHandler {
  private extensionLoader: DuckDBExtensionLoader;

  constructor(extensionLoader: DuckDBExtensionLoader) {
    this.extensionLoader = extensionLoader;
  }

  canHandle(fileType: SupportedFileType): boolean {
    return (fileType === "xlsx" || fileType === "xls") && this.extensionLoader.isLoaded("excel");
  }

  async import(file: File, tableName: string, duckDBService: DuckDBService, options?: ImportFileOptions): Promise<void> {
    const buffer = new Uint8Array(await file.arrayBuffer());
    await duckDBService.registerFileBuffer(file.name, buffer);

    const sheet = options?.sheetName ? `, sheet = '${options.sheetName.replace(/'/g, "''")}'` : "";

    // Try read_xlsx first (DuckDB >= 1.2), fall back to st_read
    const queries = [
      `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_xlsx('${file.name}'${sheet})`,
      `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM st_read('${file.name}'${sheet})`,
    ];

    for (const query of queries) {
      try {
        await duckDBService.executeQuery(query);
        return;
      } catch {
        // Try next approach
      }
    }

    throw new Error("Failed to read Excel file — no compatible read function available");
  }

  async getSheetNames(file: File, duckDBService: DuckDBService): Promise<string[]> {
    // Primary: parse the XLSX workbook.xml directly — reliable across DuckDB
    // extension versions. XLSX is a ZIP containing xl/workbook.xml which lists
    // every sheet with its real name.
    try {
      const names = await extractSheetNamesFromXlsx(file);
      if (names && names.length > 0) return names;
    } catch {
      // fall through to SQL probes
    }

    // Fallback: DuckDB-side probes in case the ZIP parse fails (e.g. .xls
    // binary-format files, which are not ZIPs and have no workbook.xml).
    const buffer = new Uint8Array(await file.arrayBuffer());
    await duckDBService.registerFileBuffer(file.name, buffer);

    const queries = [
      `SELECT name FROM read_xlsx_names('${file.name}')`,
      `SELECT DISTINCT sheet_name as name FROM read_xlsx('${file.name}', all_varchar=true, sheet='*') LIMIT 0`,
    ];

    for (const query of queries) {
      try {
        const result = await duckDBService.executeQuery(query);
        const names = result.map((row: any) => row.name).filter(Boolean);
        if (names.length > 0) return names;
      } catch {
        // Try next approach
      }
    }

    // Last-ditch: probe read_xlsx with no sheet arg. If DuckDB accepts it,
    // at least one sheet exists — return a single-entry sentinel so the UI
    // shows something rather than lying with "Sheet1".
    throw new Error("Unable to enumerate sheets for this workbook");
  }
}

/**
 * Extract sheet names from an .xlsx file by reading the embedded
 * xl/workbook.xml entry from the ZIP container. Uses the browser's native
 * DecompressionStream for DEFLATE and DOMParser for XML — no dependencies.
 * Returns null if the structure doesn't match (not a valid XLSX, .xls binary,
 * corrupt archive, etc.).
 */
async function extractSheetNamesFromXlsx(file: File): Promise<string[] | null> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();

  // Find End of Central Directory (EOCD) record: signature 0x06054b50 ("PK\5\6").
  // EOCD sits near the end of the file; max-back window is 65557 bytes (22-byte
  // fixed record + up to 65535 bytes of trailing comment).
  const windowStart = Math.max(0, bytes.length - 65557);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= windowStart; i--) {
    if (
      bytes[i] === 0x50 && bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const numEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  // Walk the central directory, looking for xl/workbook.xml.
  let cdPos = cdOffset;
  let entry: { lhOffset: number; method: number; compSize: number } | null = null;

  for (let i = 0; i < numEntries; i++) {
    if (
      bytes[cdPos] !== 0x50 || bytes[cdPos + 1] !== 0x4b ||
      bytes[cdPos + 2] !== 0x01 || bytes[cdPos + 3] !== 0x02
    ) break;

    const method = view.getUint16(cdPos + 10, true);
    const compSize = view.getUint32(cdPos + 20, true);
    const nameLen = view.getUint16(cdPos + 28, true);
    const extraLen = view.getUint16(cdPos + 30, true);
    const commentLen = view.getUint16(cdPos + 32, true);
    const lhOffset = view.getUint32(cdPos + 42, true);
    const fileName = decoder.decode(bytes.subarray(cdPos + 46, cdPos + 46 + nameLen));

    if (fileName === "xl/workbook.xml") {
      entry = { lhOffset, method, compSize };
      break;
    }

    cdPos += 46 + nameLen + extraLen + commentLen;
  }

  if (!entry) return null;

  // Read the local file header; the actual compressed payload starts after
  // the header + variable-length name/extra fields.
  const lhPos = entry.lhOffset;
  if (
    bytes[lhPos] !== 0x50 || bytes[lhPos + 1] !== 0x4b ||
    bytes[lhPos + 2] !== 0x03 || bytes[lhPos + 3] !== 0x04
  ) return null;

  const lhNameLen = view.getUint16(lhPos + 26, true);
  const lhExtraLen = view.getUint16(lhPos + 28, true);
  const dataStart = lhPos + 30 + lhNameLen + lhExtraLen;
  const payload = bytes.subarray(dataStart, dataStart + entry.compSize);

  let xmlBytes: Uint8Array;
  if (entry.method === 0) {
    xmlBytes = payload;
  } else if (entry.method === 8) {
    const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const decompressed = await new Response(stream).arrayBuffer();
    xmlBytes = new Uint8Array(decompressed);
  } else {
    return null;
  }

  const xml = decoder.decode(xmlBytes);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return null;

  // Sheet elements live under <workbook><sheets><sheet name="..."/>. They may
  // appear in the default namespace (so a plain querySelectorAll still works)
  // or under a prefix — iterate elementsByTagName to cover both.
  const sheetEls = Array.from(doc.getElementsByTagName("sheet"));
  const names: string[] = [];
  for (const el of sheetEls) {
    // Only consider elements whose parent is <sheets>; skip <sheetView>,
    // <sheetPr>, etc. that share the "sheet" token.
    const parent = el.parentElement;
    if (!parent) continue;
    const parentTag = parent.tagName.toLowerCase().replace(/^.*:/, "");
    if (parentTag !== "sheets") continue;
    const name = el.getAttribute("name");
    if (name) names.push(name);
  }

  return names.length > 0 ? names : null;
}
