import { SpreadsheetVisualizer } from "../SpreadsheetVisualizer/SpreadsheetVisualizer";
import { Column } from "../../data/types";

const BIN_NUMBER = 100;

interface ColumnStats {
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
  valueCounts?: Map<string, number>;
  totalCount: number;
  nullCount: number;
}

export class ColumnStatsVisualizer {
  private container: HTMLElement;
  private spreadsheetVisualizer: SpreadsheetVisualizer | null = null;
  private currentColumn: Column | null = null;
  private stats: ColumnStats | null = null;
  private numbers: number[] = [];
  private numbersSorted: number[] = [];

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
    await this.calculateStats();
    await this.render();
  }

  public hide() {
    this.container.style.display = "none";
    this.container.classList.remove("visible");
    this.currentColumn = null;
    this.stats = null;
  }

  private async calculateStats() {
    if (!this.currentColumn || !this.spreadsheetVisualizer) return;
    const values = await this.spreadsheetVisualizer.getColumnValues(this.currentColumn!.name);
    this.stats = {
      totalCount: values.length,
      nullCount: values.filter((v) => v.raw === null).length,
      valueCounts: new Map<string, number>(),
    };

    if (
      this.currentColumn.dataType === "INTEGER" ||
      this.currentColumn.dataType === "FLOAT" ||
      this.currentColumn.dataType === "BIGINT" ||
      this.currentColumn.dataType === "DOUBLE"
    ) {
      this.numbers = values.map((v) => Number(v.raw)).filter((v) => v !== null && !isNaN(v));
      if (this.numbers.length > 0) {
        this.stats.min = Math.min(...this.numbers);
        this.stats.max = Math.max(...this.numbers);
        this.stats.mean = this.numbers.reduce((a, b) => a + b, 0) / this.numbers.length;

        // Calculate median
        this.numbersSorted = [...this.numbers].sort((a, b) => a - b);
        const mid = Math.floor(this.numbersSorted.length / 2);
        this.stats.median =
          this.numbersSorted.length % 2 === 0 ? (this.numbersSorted[mid - 1] + this.numbersSorted[mid]) / 2 : this.numbersSorted[mid];

        // Calculate standard deviation
        const mean = this.stats.mean;
        const squareDiffs = this.numbers.map((value) => {
          const diff = value - mean;
          return diff * diff;
        });
        this.stats.stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / this.numbers.length);
      }
    } else {
      // For categorical data, count occurrences
      values.forEach((value) => {
        if (value.raw !== null) {
          const key = value.formatted;
          this.stats!.valueCounts!.set(key, (this.stats!.valueCounts!.get(key) || 0) + 1);
        }
      });
    }
  }

  private computeHistogram() {
    if (this.numbers.length === 0) return { bins: [], maxCount: 0 };
    if (this.stats!.max! <= this.stats!.min!) return { bins: [], maxCount: 0 };

    const binWidth = (this.stats!.max! - this.stats!.min!) / BIN_NUMBER;

    // Create bins
    const bins = Array.from({ length: BIN_NUMBER }, (_, i) => ({
      start: this.stats!.min! + i * binWidth,
      end: this.stats!.min! + (i + 1) * binWidth,
      count: 0,
    }));

    // Count values in each bin
    this.numbers.forEach((value) => {
      const binIndex = Math.min(Math.floor((value - this.stats!.min!) / binWidth), BIN_NUMBER - 1);
      bins[binIndex].count++;
    });

    const maxCount = Math.max(...bins.map((bin) => bin.count));

    return { bins, maxCount };
  }

  public getContainer(): HTMLElement {
    return this.container;
  }

  private async render() {
    if (!this.currentColumn || !this.stats) return;

    this.container.innerHTML = `
      <div class="column-stats">
        <div class="column-stats__header">
          <h3>${this.currentColumn.name}</h3>
          ${this.currentColumn.label ? `<div class="column-stats__label">${this.currentColumn.label}</div>` : ""}
          <div class="column-stats__type">${this.currentColumn.dataType}</div>
        </div>
        <div class="column-stats__container">
          ${await this.renderStats()}
        </div>
        ${await this.renderVisualization()}
      </div>
    `;
  }

  private renderStats() {
    if (!this.stats) return "";

    const stats = [];

    // Common stats for all types
    stats.push(`
      <div class="column-stats__item">
        <div class="column-stats__label">Total Count</div>
        <div class="column-stats__value">${this.stats.totalCount.toLocaleString()}</div>
      </div>
      <div class="column-stats__item">
        <div class="column-stats__label">Null Count</div>
        <div class="column-stats__value">${this.stats.nullCount.toLocaleString()}</div>
      </div>
    `);

    // Numeric stats
    if (
      this.currentColumn?.dataType === "INTEGER" ||
      this.currentColumn?.dataType === "FLOAT" ||
      this.currentColumn?.dataType === "BIGINT" ||
      this.currentColumn?.dataType === "DOUBLE"
    ) {
      stats.push(`
        <div class="column-stats__item">
          <div class="column-stats__label">Min</div>
          <div class="column-stats__value">${this.stats.min!.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</div>
        </div>
        <div class="column-stats__item">
          <div class="column-stats__label">Mean</div>
          <div class="column-stats__value">${this.stats.mean!.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</div>
        </div>
        <div class="column-stats__item">
          <div class="column-stats__label">Std Dev</div>
          <div class="column-stats__value">${this.stats.stdDev!.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</div>
        </div>
        <div class="column-stats__item">
        <div class="column-stats__label">Median</div>
          <div class="column-stats__value">${this.stats.median!.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</div>
        </div>
        <div class="column-stats__item">
          <div class="column-stats__label">Max</div>
          <div class="column-stats__value">${this.stats.max!.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}</div>
        </div>
      `);
    }

    return stats.join("");
  }

  private async renderVisualization() {
    if (!this.stats) return "";

    // For numerical data, show distribution histogram
    if (
      this.currentColumn?.dataType === "INTEGER" ||
      this.currentColumn?.dataType === "FLOAT" ||
      this.currentColumn?.dataType === "BIGINT" ||
      this.currentColumn?.dataType === "DOUBLE"
    ) {
      return await this.renderNumericalHistogram();
    }

    // For categorical data, show horizontal histogram of top 10 values
    if (this.stats.valueCounts) {
      const sortedCounts = Array.from(this.stats.valueCounts.entries()).sort((a, b) => b[1] - a[1]);
      const top10 = sortedCounts.slice(0, 10);

      const maxCount = Math.max(...sortedCounts.map(([_, count]) => count));
      const totalValidValues = this.stats.totalCount - this.stats.nullCount;

      const categoriesNumber = sortedCounts.length;

      return `
        <div class="histogram__container">
          <div class="histogram__title">Top ${categoriesNumber > 10 ? 10 : categoriesNumber} Most Frequent Values</div>
          <div class="histogram__chart">
            ${top10
              .map(([value, count]) => {
                const percentage = ((count / totalValidValues) * 100).toFixed(1);
                const displayValue = value.length > 15 ? value.substring(0, 15) + "..." : value;
                return `
                <div class="histogram__bar-container">
                  <div class="histogram__label" title="${value}">${displayValue}</div>
                  <div class="histogram__bar">
                    <div class="histogram__bar-fill" style="width: ${(count / maxCount) * 100}%"></div>
                  </div>
                  <div class="histogram__count">${count.toLocaleString()} (${percentage}%)</div>
                </div>
              `;
              })
              .join("")}
          </div>
          ${categoriesNumber > 10 ? `<div class="histogram__title">${(categoriesNumber - 10).toLocaleString()} more categories.</div>` : ""}
        </div>
      `;
    }

    return "";
  }

  private async renderNumericalHistogram() {
    const { bins, maxCount } = this.computeHistogram();

    if (maxCount === 0) return "";

    return `
      <div class="histogram__container">
        <div class="histogram__title">Distribution</div>
        <div class="histogram__chart histogram__chart--numerical">
          ${bins
            .map((bin) => {
              const height = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;
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
