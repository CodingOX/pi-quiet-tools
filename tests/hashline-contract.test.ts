import assert from "node:assert/strict";
import test from "node:test";
import hashlineExtension from "pi-hashline-edit-pro";
import { HASHLINE_TOOLS, HASHLINE_TOOL_NAME_SET } from "../packages/core/src/hashline-tools.js";

test("hashline registers exactly the tool names glue knows about", () => {
  const registered: string[] = [];
  const pi = {
    registerTool: (tool: { name: string }) => { registered.push(tool.name); },
    on: () => {}, registerCommand: () => {},
    getActiveTools: () => [], setActiveTools: () => {}, getAllTools: () => [],
  };
  hashlineExtension(pi as never);
  assert.deepEqual([...registered].sort(), [...HASHLINE_TOOLS].sort());
});

test("matching set covers current names plus retired", () => {
  for (const n of HASHLINE_TOOLS) assert.equal(HASHLINE_TOOL_NAME_SET.has(n), true, n);
  assert.equal(HASHLINE_TOOL_NAME_SET.has("undo_last_replace"), true);
});
