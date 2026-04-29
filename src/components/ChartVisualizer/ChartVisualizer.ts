import vegaEmbed, { type Result, type VisualizationSpec } from "vega-embed";
import { listenForThemeChanges, detectCurrentTheme } from "../SpreadsheetVisualizer/utils/theme";

/**
 * Renders a Vega-Lite spec produced by stats_duck's `VISUALIZE … DRAW <mark>`
 * extension, with per-layer datasets supplied by the caller (each layer is a
 * SQL string that bedevere-wise has already executed against DuckDB-WASM).
 *
 * Keeps lifecycle parity with SpreadsheetVisualizer: subscribe to theme
 * changes on mount, tear down on destroy. The chart re-embeds on theme flip
 * with a fresh Tokyonight-flavoured `config` block so axes / labels / grids
 * blend with the rest of the UI.
 */
export class ChartVisualizer {
  private host: HTMLElement;
  private currentSpec: VisualizationSpec | null = null;
  private currentDatasets: Record<string, unknown[]> = {};
  private currentResult: Result | null = null;
  private themeCleanup: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    this.host.classList.add("chart-visualizer");
    this.themeCleanup = listenForThemeChanges(() => this.reembed());
  }

  /**
   * Mount or replace the rendered chart. Called once per VISUALIZE result;
   * theme flips reuse the cached spec + datasets via {@link reembed}.
   */
  public async setSpec(spec: VisualizationSpec, datasets: Record<string, unknown[]>): Promise<void> {
    this.currentSpec = spec;
    this.currentDatasets = datasets;
    await this.reembed();
  }

  public destroy(): void {
    if (this.themeCleanup) {
      this.themeCleanup();
      this.themeCleanup = null;
    }
    if (this.currentResult) {
      this.currentResult.finalize();
      this.currentResult = null;
    }
    this.host.innerHTML = "";
  }

  private async reembed(): Promise<void> {
    if (!this.currentSpec) return;
    if (this.currentResult) {
      this.currentResult.finalize();
      this.currentResult = null;
    }
    // Vega-Lite supports a top-level `datasets` block ({name: rows[]}) that
    // is referenced by `data: { name }` inside the spec. stats_duck's spec
    // already references `layer_0`, `layer_1`, … so we just inline the rows
    // there alongside the theme config.
    //
    // `width: "container"` / `height: "container"` make the chart fill the
    // host element; we only set them when the spec doesn't already specify
    // sizes, so a future stats_duck spec that wants explicit dimensions
    // wins. `autosize: "fit"` re-layouts axes/legends to fit instead of
    // overflowing.
    const themedSpec = this.applyTheme(this.currentSpec);
    const sized = themedSpec as Record<string, unknown>;
    const fullSpec = {
      ...themedSpec,
      width: sized.width ?? "container",
      height: sized.height ?? "container",
      autosize: sized.autosize ?? { type: "fit", contains: "padding" },
      datasets: this.currentDatasets,
    } as VisualizationSpec;
    this.currentResult = await vegaEmbed(this.host, fullSpec, {
      actions: { export: true, source: true, compiled: true, editor: true },
      renderer: "canvas",
    });
  }

  /**
   * Inject a Tokyonight-flavoured `config` block (background, axis, view…)
   * built from the active CSS custom properties. Reads computed styles
   * once per re-embed; values match what the spreadsheet uses.
   */
  private applyTheme(spec: VisualizationSpec): VisualizationSpec {
    const css = getComputedStyle(document.body);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const isLight = detectCurrentTheme() === "light";

    const themeConfig = {
      background: v("--bg") || (isLight ? "#e1e2e7" : "#1a1b26"),
      view: { stroke: v("--border") || "#3b4261" },
      axis: {
        domainColor: v("--border") || "#3b4261",
        gridColor:   v("--border") || "#292e42",
        labelColor:  v("--fg-dark") || "#a9b1d6",
        titleColor:  v("--fg") || "#c0caf5",
        tickColor:   v("--border") || "#3b4261",
      },
      legend: {
        labelColor: v("--fg-dark") || "#a9b1d6",
        titleColor: v("--fg") || "#c0caf5",
      },
      title: { color: v("--fg") || "#c0caf5" },
    };

    // Merge with any user-provided config in the spec; user wins.
    const existing = (spec as { config?: Record<string, unknown> }).config ?? {};
    return { ...spec, config: { ...themeConfig, ...existing } } as VisualizationSpec;
  }
}
