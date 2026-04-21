import { describe, it, expect, beforeEach } from "vitest";
import { commandRegistry, Command } from "../CommandRegistry";

// The registry is a module-level singleton shared across tests. Each test
// registers under a unique id prefix and unregisters after itself to avoid
// leaking state into neighbouring specs.
const PREFIX = "test_registry__";

function cleanup(): void {
  for (const cmd of commandRegistry.list()) {
    if (cmd.id.startsWith(PREFIX)) commandRegistry.unregister(cmd.id);
  }
}

function makeCmd(id: string, overrides: Partial<Command> = {}): Command {
  return {
    id: PREFIX + id,
    title: "Test " + id,
    execute: () => {},
    ...overrides,
  };
}

describe("CommandRegistry", () => {
  beforeEach(cleanup);

  it("registers and retrieves commands by id", () => {
    commandRegistry.register(makeCmd("one"));
    expect(commandRegistry.has(PREFIX + "one")).toBe(true);
    expect(commandRegistry.get(PREFIX + "one")?.title).toBe("Test one");
  });

  it("retrieves by shellName", () => {
    commandRegistry.register(makeCmd("open", { shellName: "open" }));
    expect(commandRegistry.getByShellName("open")?.id).toBe(PREFIX + "open");
  });

  it("retrieves by alias", () => {
    commandRegistry.register(makeCmd("open", { shellName: "open", aliases: ["o"] }));
    expect(commandRegistry.getByShellName("o")?.id).toBe(PREFIX + "open");
  });

  it("unregister drops the id, shellName, and aliases from the index", () => {
    commandRegistry.register(makeCmd("open", { shellName: "open", aliases: ["o"] }));
    commandRegistry.unregister(PREFIX + "open");
    expect(commandRegistry.has(PREFIX + "open")).toBe(false);
    expect(commandRegistry.getByShellName("open")).toBeUndefined();
    expect(commandRegistry.getByShellName("o")).toBeUndefined();
  });

  it("run() invokes the command's execute with params", async () => {
    let seen: any = null;
    commandRegistry.register(
      makeCmd("echo", { execute: (params) => { seen = params; } }),
    );
    await commandRegistry.run(PREFIX + "echo", { x: 1 });
    expect(seen).toEqual({ x: 1 });
  });

  it("run() rejects when the command id is unknown", async () => {
    await expect(commandRegistry.run(PREFIX + "missing")).rejects.toThrow(/Unknown command/);
  });

  it("run() enforces the when predicate", async () => {
    commandRegistry.register(makeCmd("guarded", { when: () => false }));
    await expect(commandRegistry.run(PREFIX + "guarded")).rejects.toThrow(/not available/);
  });

  it("list({ shellOnly: true }) filters to commands with a shellName", () => {
    commandRegistry.register(makeCmd("invisible")); // no shellName
    commandRegistry.register(makeCmd("visible", { shellName: "vis" }));
    const shellCmds = commandRegistry.list({ shellOnly: true }).filter((c) => c.id.startsWith(PREFIX));
    expect(shellCmds.map((c) => c.id)).toEqual([PREFIX + "visible"]);
  });

  it("list({ scope }) filters by scope", () => {
    commandRegistry.register(makeCmd("g", { scope: "global" }));
    commandRegistry.register(makeCmd("s", { scope: "spreadsheet" }));
    const globals = commandRegistry.list({ scope: "global" }).filter((c) => c.id.startsWith(PREFIX));
    expect(globals.map((c) => c.id)).toEqual([PREFIX + "g"]);
  });

  it("onChange fires for register and unregister", () => {
    let calls = 0;
    const unsubscribe = commandRegistry.onChange(() => { calls++; });
    commandRegistry.register(makeCmd("watched"));
    commandRegistry.unregister(PREFIX + "watched");
    expect(calls).toBe(2);
    unsubscribe();
    commandRegistry.register(makeCmd("after-unsub"));
    expect(calls).toBe(2); // no further calls after unsubscribe
  });
});
