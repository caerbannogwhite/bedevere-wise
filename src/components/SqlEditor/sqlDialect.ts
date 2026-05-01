import { SQLDialect, PostgreSQL } from "@codemirror/lang-sql";

/**
 * Function names contributed by the-stats-duck DuckDB extension. Listed here
 * so the editor can highlight them as builtins; SqlAutoComplete also fetches
 * `duckdb_functions()` at runtime and merges that result, which catches any
 * names we missed (or any new ones from future versions of the extension).
 */
export const STATS_DUCK_FUNCTIONS = [
  "summary_stats",
  "ttest_2samp",
  "mann_whitney_u",
];

/**
 * Top-level keywords contributed by the stats_duck `ggsql` parser extension.
 * The mark names that follow `DRAW` (`point`, `line`, `bar`, `area`, …) are
 * argument values rather than keywords, so they don't belong here.
 */
const GGSQL_KEYWORDS = ["visualize", "draw"];

/**
 * PostgreSQL with VISUALIZE/DRAW recognised as keywords and stats_duck
 * functions added to the builtin list. Used by the SQL editor for parsing
 * and for the keyword/builtin completion sources.
 */
export const BedevereSqlDialect = SQLDialect.define({
  ...PostgreSQL.spec,
  keywords: `${PostgreSQL.spec.keywords ?? ""} ${GGSQL_KEYWORDS.join(" ")}`,
  builtin: `${PostgreSQL.spec.builtin ?? ""} ${STATS_DUCK_FUNCTIONS.join(" ")}`,
});
