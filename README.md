# Bedevere Wise

**Open SAS, SPSS, Stata, Parquet, and Excel files in your browser. Query them with SQL — no install, no upload.**

Drop a `.sas7bdat`, `.sav`, `.dta`, `.xpt`, `.parquet`, `.xlsx`, `.csv`, or `.tsv` and start querying. Runs entirely in your browser via [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview) — your data never leaves your machine.

[**Live app · bedeverewise.app**](https://bedeverewise.app/) · [Changelog](CHANGELOG.md)

## Why this exists

Most SQL clients (DBeaver, TablePlus, DataGrip) speak to database servers and won't open `.sas7bdat`. Most "open my SAS file" tools (the SAS Universal Viewer, IBM SPSS Statistics) are vendor-locked desktop apps without SQL. Pandas can do it but needs a Python install plus boilerplate per file. Bedevere Wise sits in the gap: drop the file, get a spreadsheet view, and run SQL against it in seconds.

## Features

- **Stats-software file formats** — `.sas7bdat`, `.sav` (SPSS), `.dta` (Stata), `.xpt` (SAS Transport)
- **General data formats** — CSV, TSV, JSON, Parquet, Excel (.xlsx / .xls)
- **SQL editor** — CodeMirror 6 with schema-aware autocomplete; results open in their own tabs
- **Inline column statistics** — per-type summaries, histograms, and value filters next to the table
- **High-performance grid** — canvas-rendered, virtually scrolled, HiDPI-sharp
- **Dot-command shell** — `.import`, `.open`, `.export`, `.tables`, `.columns`, `.help`, plus argument autocomplete
- **Persistent workspace** — saved views, query bookmarks, and settings survive page reloads
- **Fully client-side** — no server, no uploads; data stays in your browser

## License

MIT — see [LICENSE](LICENSE) for details.
