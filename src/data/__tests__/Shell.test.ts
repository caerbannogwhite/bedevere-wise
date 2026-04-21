import { describe, it, expect } from "vitest";
import { parseShellLine } from "../Shell";

describe("parseShellLine", () => {
  it("returns null for non-dot input", () => {
    expect(parseShellLine("SELECT * FROM t")).toBeNull();
    expect(parseShellLine("")).toBeNull();
    expect(parseShellLine("   ")).toBeNull();
  });

  it("parses a bare command with no arguments", () => {
    const p = parseShellLine(".help");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("help");
    expect(p!.positional).toEqual([]);
    expect(p!.flags.size).toBe(0);
    expect(p!.named.size).toBe(0);
  });

  it("trims leading whitespace before the dot", () => {
    expect(parseShellLine("   .help")!.name).toBe("help");
  });

  it("collects positional arguments in order", () => {
    const p = parseShellLine(".open penguins extra")!;
    expect(p.positional).toEqual(["penguins", "extra"]);
  });

  it("recognises long flags", () => {
    const p = parseShellLine(".open --folder")!;
    expect(p.flags.has("folder")).toBe(true);
    expect(p.positional).toEqual([]);
  });

  it("expands clustered short flags", () => {
    const p = parseShellLine(".open -df")!;
    expect(p.flags.has("d")).toBe(true);
    expect(p.flags.has("f")).toBe(true);
  });

  it("parses key=value named args", () => {
    const p = parseShellLine(".settings set date=yyyy-MM-dd theme=dark")!;
    expect(p.positional).toEqual(["set"]);
    expect(p.named.get("date")).toBe("yyyy-MM-dd");
    expect(p.named.get("theme")).toBe("dark");
  });

  it("parses --long=value as a named arg, not a flag", () => {
    const p = parseShellLine(".theme --value=dark")!;
    expect(p.named.get("value")).toBe("dark");
    expect(p.flags.has("value")).toBe(false);
  });

  it("keeps quoted strings whole, including spaces", () => {
    const p = parseShellLine('.open "My dataset.csv"')!;
    expect(p.positional).toEqual(["My dataset.csv"]);
  });

  it("supports single-quoted strings", () => {
    const p = parseShellLine(".open 'another file.csv'")!;
    expect(p.positional).toEqual(["another file.csv"]);
  });

  it("honors backslash escapes inside quotes", () => {
    const p = parseShellLine('.echo "line with \\"quotes\\""')!;
    expect(p.positional).toEqual(['line with "quotes"']);
  });

  it("ignores leading '=' tokens rather than parsing them as named args", () => {
    const p = parseShellLine(".foo =bare")!;
    expect(p.positional).toEqual(["=bare"]);
    expect(p.named.size).toBe(0);
  });
});
