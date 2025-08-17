import { SpreadsheetVisualizer } from "../SpreadsheetVisualizer/SpreadsheetVisualizer";
import { Column, ColumnStats } from "../../data/types";

export class ColumnStatsVisualizer {
  private container: HTMLElement;
  private spreadsheetVisualizer: SpreadsheetVisualizer | null = null;
  private currentColumn: Column | null = null;

  constructor(parent: HTMLElement, spreadsheetVisualizer: SpreadsheetVisualizer | null, statsPanelWidth: number) {
    this.container = document.createElement("div");
    this.spreadsheetVisualizer = spreadsheetVisualizer;

    this.container.id = "column-stats-container";
    this.container.style.width = `${statsPanelWidth}px`;

    parent.appendChild(this.container);
  }

  public async setSpreadsheetVisualizer(spreadsheetVisualizer: SpreadsheetVisualizer) {
    this.spreadsheetVisualizer = spreadsheetVisualizer;

    // Handle the data provider change with the selected columns from the new dataset
    if (this.spreadsheetVisualizer.getSelectedColumns().length > 0) {
      // Show stats for the first selected column (assuming single column selection mode)
      await this.showStats(this.spreadsheetVisualizer.getSelectedColumns()[0]);
    } else {
      // No columns selected in the new dataset, hide the stats panel
      this.hide();
    }
  }

  public async showStats(column: Column) {
    this.currentColumn = column;
    this.container.style.display = "block";
    this.container.classList.add("visible");

    const stats = await this.spreadsheetVisualizer!.getDataProvider().getColumnStats(column);
    this.render(stats);
  }

  public hide() {
    this.container.style.display = "none";
    this.container.classList.remove("visible");
    this.currentColumn = null;
  }

  public getContainer(): HTMLElement {
    return this.container;
  }

  private render(stats: ColumnStats | null) {
    if (!this.currentColumn || !stats) return;

    this.container.innerHTML = `
      <div class="column-stats">
        <div class="column-stats__header">
          <h3>${this.currentColumn.name}</h3>
          ${this.currentColumn.label ? `<div class="column-stats__label">${this.currentColumn.label}</div>` : ""}
          <div class="column-stats__type">${this.currentColumn.dataType}</div>
        </div>
        <div class="column-stats__container">
          ${this.renderStats(stats)}
        </div>
        ${this.renderVisualization(stats)}
      </div>
    `;
  }

  private renderStats(stats: ColumnStats) {
    if (!stats) return "";

    const statsHtml = [];

    // Common stats for all types
    statsHtml.push(`
      <div class="column-stats__item">
        <div class="column-stats__label">Total Count</div>
        <div class="column-stats__value">${stats.totalCount.toLocaleString()}</div>
      </div>
      <div class="column-stats__item">
        <div class="column-stats__label">Null Count</div>
        <div class="column-stats__value">${stats.nullCount.toLocaleString()}</div>
      </div>
    `);

    // Numeric stats
    if (!stats.isCategorical) {
      statsHtml.push(`
        <div class="column-stats__item">
          <div class="column-stats__label">Min</div>
          <div class="column-stats__value">${stats.numericStats!.min.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</div>
        </div>
        <div class="column-stats__item">
          <div class="column-stats__label">Mean</div>
          <div class="column-stats__value">${stats.numericStats!.mean.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</div>
        </div>
        <div class="column-stats__item">
          <div class="column-stats__label">Std Dev</div>
          <div class="column-stats__value">${stats.numericStats!.stdDev.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</div>
        </div>
        <div class="column-stats__item">
        <div class="column-stats__label">Median</div>
          <div class="column-stats__value">${stats.numericStats!.median.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</div>
        </div>
        <div class="column-stats__item">
          <div class="column-stats__label">Max</div>
          <div class="column-stats__value">${stats.numericStats!.max.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</div>
        </div>
      `);
    }

    return statsHtml.join("");
  }

  private renderVisualization(stats: ColumnStats) {
    // For numerical data, show distribution histogram
    if (!stats.isCategorical) {
      return this.renderNumericalHistogram(stats);
    }

    // For categorical data, show horizontal histogram of top 10 values
    if (stats.valueCounts) {
      const categoriesNumber = stats.valueCounts.size;

      return `
        <div class="histogram__container">
          <div class="histogram__title">Top ${categoriesNumber > 10 ? 10 : categoriesNumber} Most Frequent Values</div>
          <div class="histogram__chart">
            ${Array.from(stats.valueCounts.entries())
              .map(([value, count]: [string, number]) => {
                const percentage = ((count / stats.totalCount) * 100).toFixed(1);
                const displayValue = value.length > 15 ? value.substring(0, 15) + "..." : value;
                return `
                <div class="histogram__bar-container">
                  <div class="histogram__label" title="${value}">${displayValue}</div>
                  <div class="histogram__bar">
                    <div class="histogram__bar-fill" style="width: ${(count / stats.totalCount) * 100}%"></div>
                  </div>
                  <div class="histogram__count">${count.toLocaleString()} (${percentage}%)</div>
                </div>
              `;
              })
              .join("")}
          </div>
          ${categoriesNumber > 10 ? `<div class="histogram__title">${(categoriesNumber - 10).toLocaleString()} more values.</div>` : ""}
        </div>
      `;
    }

    return "";
  }

  private renderNumericalHistogram(stats: ColumnStats) {
    const maxCount = Math.max(...Array.from(stats.valueCounts!.values()));
    return `
      <div class="histogram__container">
        <div class="histogram__title">Distribution</div>
        <div class="histogram__chart histogram__chart--numerical">
          ${Array.from(stats.valueCounts!.entries())
            .map(([_, count]: [string, number]) => {
              const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
              return `
              <div class="histogram__numerical-bar">
                <div class="histogram__numerical-bar-fill" style="height: ${height}%"></div>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
    `;
  }
}
