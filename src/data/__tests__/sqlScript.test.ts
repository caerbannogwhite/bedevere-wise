import { describe, it, expect } from "vitest";
import { parseScript, classifyStatement, firstSqlKeyword } from "../sqlScript";

describe("parseScript", () => {
  it("returns [] for empty / whitespace / comment-only input", () => {
    expect(parseScript("")).toEqual([]);
    expect(parseScript("   ")).toEqual([]);
    expect(parseScript("-- just a comment\n")).toEqual([]);
    expect(parseScript("/* block */\n   ")).toEqual([]);
  });

  it("captures a single statement with or without trailing semicolon", () => {
    expect(parseScript("SELECT 1")).toEqual([{ sql: "SELECT 1", directives: [] }]);
    expect(parseScript("SELECT 1;")).toEqual([{ sql: "SELECT 1", directives: [] }]);
    expect(parseScript("  SELECT 1 ;  ")).toEqual([{ sql: "SELECT 1", directives: [] }]);
  });

  it("splits multiple statements on top-level semicolons", () => {
    const out = parseScript("SELECT 1; SELECT 2; SELECT 3");
    expect(out.map((s) => s.sql)).toEqual(["SELECT 1", "SELECT 2", "SELECT 3"]);
  });

  it("does not split on semicolons inside string literals", () => {
    const out = parseScript("SELECT 'a;b;c'; SELECT 2");
    expect(out.map((s) => s.sql)).toEqual(["SELECT 'a;b;c'", "SELECT 2"]);
  });

  it("honors SQL doubled-quote escapes inside strings", () => {
    const out = parseScript("SELECT 'It''s a;test'; SELECT 2");
    expect(out.map((s) => s.sql)).toEqual(["SELECT 'It''s a;test'", "SELECT 2"]);
  });

  it("honors backslash escapes inside strings", () => {
    const out = parseScript("SELECT 'a\\';b' ; SELECT 2");
    expect(out).toHaveLength(2);
    expect(out[1].sql).toBe("SELECT 2");
  });

  it("does not split on semicolons inside double-quoted identifiers", () => {
    const out = parseScript('SELECT "weird;name" FROM t; SELECT 2');
    expect(out.map((s) => s.sql)).toEqual(['SELECT "weird;name" FROM t', "SELECT 2"]);
  });

  it("does not split on semicolons inside line / block comments", () => {
    expect(parseScript("SELECT 1 -- a;b\nFROM t; SELECT 2").map((s) => s.sql)).toEqual([
      "SELECT 1 -- a;b\nFROM t",
      "SELECT 2",
    ]);
    expect(parseScript("SELECT 1 /* a;b */ FROM t; SELECT 2").map((s) => s.sql)).toEqual([
      "SELECT 1 /* a;b */ FROM t",
      "SELECT 2",
    ]);
  });

  it("does not split on semicolons inside dollar-quoted strings", () => {
    const out = parseScript("SELECT $$has;semis$$; SELECT 2");
    expect(out.map((s) => s.sql)).toEqual(["SELECT $$has;semis$$", "SELECT 2"]);
  });

  it("supports tagged dollar quotes", () => {
    const out = parseScript("SELECT $tag$nested $$ ; still in$tag$; SELECT 2");
    expect(out).toHaveLength(2);
    expect(out[0].sql).toBe("SELECT $tag$nested $$ ; still in$tag$");
  });

  it("attaches a leading directive to the next statement", () => {
    const out = parseScript(".no-output\nCREATE TABLE t AS SELECT 1;");
    expect(out).toEqual([
      { sql: "CREATE TABLE t AS SELECT 1", directives: [".no-output"] },
    ]);
  });

  it("queues multiple directives for the same statement", () => {
    const out = parseScript(".one\n.two\nSELECT 1;");
    expect(out[0].directives).toEqual([".one", ".two"]);
  });

  it("resets directives after the statement they modify", () => {
    const out = parseScript(".no-output\nCREATE TABLE t AS SELECT 1;\nSELECT * FROM t;");
    expect(out).toHaveLength(2);
    expect(out[0].directives).toEqual([".no-output"]);
    expect(out[1].directives).toEqual([]);
  });

  it("handles the user's headline mixed-script example", () => {
    const out = parseScript(
      ".no-output\n" +
        "CREATE TABLE penguins_clean AS SELECT * FROM penguins;\n" +
        "VISUALIZE bill_depth_mm AS x FROM penguins_clean DRAW point;",
    );
    expect(out).toHaveLength(2);
    expect(out[0].directives).toEqual([".no-output"]);
    expect(out[0].sql.startsWith("CREATE TABLE")).toBe(true);
    expect(out[1].directives).toEqual([]);
    expect(out[1].sql.startsWith("VISUALIZE")).toBe(true);
  });
});

describe("classifyStatement", () => {
  it("recognises VISUALIZE as the chart kind", () => {
    expect(classifyStatement("VISUALIZE x AS y FROM t DRAW point")).toBe("visualize");
    expect(classifyStatement("  visualize x AS y FROM t DRAW point")).toBe("visualize");
  });
  it("treats SELECT and WITH as query kinds", () => {
    expect(classifyStatement("SELECT 1")).toBe("query");
    expect(classifyStatement("WITH x AS (SELECT 1) SELECT * FROM x")).toBe("query");
  });
  it("treats CREATE / INSERT / DROP as side-effects", () => {
    expect(classifyStatement("CREATE TABLE t AS SELECT 1")).toBe("side-effect");
    expect(classifyStatement("INSERT INTO t VALUES (1)")).toBe("side-effect");
    expect(classifyStatement("DROP TABLE t")).toBe("side-effect");
  });
  it("skips leading comments before reading the keyword", () => {
    expect(classifyStatement("-- header\nSELECT 1")).toBe("query");
    expect(classifyStatement("/* header */ SELECT 1")).toBe("query");
  });
});

describe("firstSqlKeyword", () => {
  it("returns the uppercase first keyword", () => {
    expect(firstSqlKeyword("select 1")).toBe("SELECT");
    expect(firstSqlKeyword("  CREATE TABLE t")).toBe("CREATE");
  });
  it("skips line comments and block comments", () => {
    expect(firstSqlKeyword("-- skip\nSELECT 1")).toBe("SELECT");
    expect(firstSqlKeyword("/* skip */ SELECT 1")).toBe("SELECT");
  });
  it("returns '' when the input has no alphabetic prefix", () => {
    expect(firstSqlKeyword("")).toBe("");
    expect(firstSqlKeyword("   ")).toBe("");
    expect(firstSqlKeyword(";")).toBe("");
  });
});
