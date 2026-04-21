/**
 * psql-style dot-command shell. Parses a single line of input; dispatches
 * commands through {@link commandRegistry}. SQL (no leading dot) is not
 * handled here — callers receive `null` from {@link parseShellLine} and send
 * the line to DuckDB themselves.
 *
 * Grammar (0.8, intentionally small):
 *
 *   input      ::= WS? '.' name (WS+ arg)*
 *   name       ::= identifier                    (e.g. "open", "help")
 *   arg        ::= flag | named | positional
 *   flag       ::= '--' identifier               (e.g. --folder)
 *              |   '-'  [a-zA-Z]+                (e.g. -d, -df)
 *   named      ::= identifier '=' value
 *   positional ::= value
 *   value      ::= quoted-string | bare-token
 *
 * Quoting: single or double quotes; `\` escapes the next char.
 */

import { Command, commandRegistry } from "./CommandRegistry";

export interface ParsedCommand {
  name: string;
  positional: string[];
  flags: Set<string>;
  named: Map<string, string>;
}

export interface ShellResult {
  kind: "text" | "table" | "error";
  /** Plain-text output for `text`/`error`. Empty string means "silent success". */
  text?: string;
  /** Optional longer detail for click-to-expand (e.g. error stack). */
  details?: string;
  /** For `table` results — the SQL that produced the rows. The caller opens it as a new tab. */
  sql?: string;
  /** Original error, if any. */
  error?: Error;
}

/**
 * Split a shell line into tokens. Whitespace-separated; single/double quotes
 * produce a single token; `\` inside a quoted string escapes the next char.
 */
function tokenize(input: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) break;
    const q = input[i];
    let tok = "";
    if (q === '"' || q === "'") {
      i++;
      while (i < input.length && input[i] !== q) {
        if (input[i] === "\\" && i + 1 < input.length) {
          tok += input[i + 1];
          i += 2;
        } else {
          tok += input[i];
          i++;
        }
      }
      if (i < input.length) i++; // consume closing quote
    } else {
      while (i < input.length && !/\s/.test(input[i])) {
        tok += input[i];
        i++;
      }
    }
    out.push(tok);
  }
  return out;
}

/**
 * Parse a shell line. Returns null for lines that aren't dot-commands so the
 * caller can fall back to SQL execution.
 */
export function parseShellLine(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith(".")) return null;
  const body = trimmed.slice(1);
  const tokens = tokenize(body);
  if (tokens.length === 0) return null;

  const [name, ...rest] = tokens;
  const positional: string[] = [];
  const flags = new Set<string>();
  const named = new Map<string, string>();

  for (const tok of rest) {
    if (tok.startsWith("--") && tok.length > 2) {
      const eq = tok.indexOf("=");
      if (eq >= 0) {
        named.set(tok.slice(2, eq), tok.slice(eq + 1));
      } else {
        flags.add(tok.slice(2));
      }
    } else if (tok.startsWith("-") && tok.length > 1 && /^[a-zA-Z]+$/.test(tok.slice(1))) {
      for (const c of tok.slice(1)) flags.add(c);
    } else if (tok.includes("=") && !tok.startsWith("=")) {
      const eq = tok.indexOf("=");
      named.set(tok.slice(0, eq), tok.slice(eq + 1));
    } else {
      positional.push(tok);
    }
  }

  return { name, positional, flags, named };
}

/**
 * Build the `params` object passed to a Command's `execute(params)` from a
 * parsed shell line. The mapping is:
 *   - every entry in `named` becomes `params[key] = value`
 *   - every entry in `flags` becomes `params[name] = true`
 *   - positional args fill the command's declared `parameters` by position
 *     (so `.open penguins` → `params.dataset = "penguins"` when the command
 *      declares `parameters: [{name: "dataset", ...}]`)
 *   - the raw positional list is always available as `params._args`.
 */
function buildParams(parsed: ParsedCommand, cmd: Command): Record<string, any> {
  const params: Record<string, any> = {};
  for (const [k, v] of parsed.named) params[k] = v;
  for (const f of parsed.flags) params[f] = true;
  if (cmd.parameters) {
    for (let i = 0; i < parsed.positional.length && i < cmd.parameters.length; i++) {
      const name = cmd.parameters[i].name;
      if (!(name in params)) params[name] = parsed.positional[i];
    }
  }
  params._args = parsed.positional;
  return params;
}

/**
 * Execute a shell line. The caller renders the returned {@link ShellResult}.
 */
export async function runShellLine(input: string): Promise<ShellResult> {
  const parsed = parseShellLine(input);
  if (!parsed) return { kind: "error", text: "Not a shell command (line must start with '.')" };

  // Built-in: .help. Everything else dispatches through the registry.
  if (parsed.name === "help") return buildHelp(parsed.positional[0]);

  const cmd = commandRegistry.getByShellName(parsed.name);
  if (!cmd) {
    return { kind: "error", text: `Unknown command '.${parsed.name}'. Try .help` };
  }

  try {
    await cmd.execute(buildParams(parsed, cmd));
    // Silent success — commands with user-visible side effects (toast,
    // new tab, theme flip) surface their own feedback. The shell doesn't
    // add a confirmation toast per line because it'd drown out the actual
    // result in most cases.
    return { kind: "text", text: "" };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { kind: "error", text: error.message, details: error.stack, error };
  }
}

// ---------------------------------------------------------------------------
// .help rendering
// ---------------------------------------------------------------------------

function buildHelp(specific?: string): ShellResult {
  if (specific) {
    const cmd = commandRegistry.getByShellName(specific) || commandRegistry.get(specific);
    if (!cmd) return { kind: "error", text: `Unknown command: ${specific}. Try .help` };
    const full = formatCommandHelp(cmd);
    const firstLine = full.split("\n", 1)[0];
    const rest = full.slice(firstLine.length + 1);
    return { kind: "text", text: firstLine, details: rest.length > 0 ? rest : undefined };
  }

  const all = commandRegistry
    .list({ shellOnly: true })
    .sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.shellName || "").localeCompare(b.shellName || ""));

  const lines: string[] = [];
  let lastCat: string | undefined;
  for (const cmd of all) {
    const cat = cmd.category || "Other";
    if (cat !== lastCat) {
      if (lastCat !== undefined) lines.push("");
      lines.push(`[${cat}]`);
      lastCat = cat;
    }
    const aliasSuffix = cmd.aliases?.length ? ` (.${cmd.aliases.join(", .")})` : "";
    const desc = cmd.description || cmd.title;
    lines.push(`  .${cmd.shellName}${aliasSuffix} — ${desc}`);
  }
  lines.push("");
  lines.push("Lines not starting with '.' run as DuckDB SQL.");
  lines.push("Type .help <name> for per-command details.");

  return {
    kind: "text",
    text: `Shell reference — ${all.length} commands (click to expand)`,
    details: lines.join("\n"),
  };
}

function formatCommandHelp(cmd: Command): string {
  const lines: string[] = [];
  const token = cmd.shellName ? `.${cmd.shellName}` : cmd.id;
  lines.push(`${token} — ${cmd.title}`);
  if (cmd.description && cmd.description !== cmd.title) lines.push(cmd.description);
  if (cmd.keybinding) lines.push(`Keybinding: ${cmd.keybinding}`);
  if (cmd.aliases?.length) lines.push(`Aliases: ${cmd.aliases.map((a) => "." + a).join(", ")}`);
  if (cmd.parameters && cmd.parameters.length > 0) {
    lines.push("");
    lines.push("Parameters:");
    for (const p of cmd.parameters) {
      const req = p.required ? " (required)" : "";
      const type = p.type ? ` [${p.type}]` : "";
      const desc = p.description ? `  — ${p.description}` : "";
      lines.push(`  ${p.name}${type}${req}${desc}`);
    }
  }
  return lines.join("\n");
}
