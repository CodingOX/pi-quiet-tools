import assert from "node:assert/strict";
import { test } from "node:test";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { buildEditToolSchema } from "pi-hashline-edit-pro/src/payload-contract.ts";
import { buildInsertToolSchema } from "pi-hashline-edit-pro/src/insert.ts";
import { lockHashlineEditSchema } from "./hashline-edit-schema.ts";

function replaceTool(requirePath = false): ToolDefinition {
  return {
    name: "replace",
    label: "replace",
    description: "hashline replace",
    parameters: buildEditToolSchema(requirePath),
    prepareArguments: (args: unknown) => {
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        return args;
      }
      return { ...(args as Record<string, unknown>) };
    },
    async execute() {
      return { content: [] };
    },
  } as ToolDefinition;
}

function schemaOf(tool: ToolDefinition): {
  additionalProperties?: unknown;
  properties?: Record<string, unknown>;
} {
  return tool.parameters as {
    additionalProperties?: unknown;
    properties?: Record<string, unknown>;
  };
}

test("locked replace schema forbids extra fields like path", () => {
  const original = replaceTool(false);
  const locked = lockHashlineEditSchema(original);
  assert.equal(schemaOf(locked).additionalProperties, false);
  assert.equal("path" in (schemaOf(locked).properties ?? {}), false);
  assert.equal(schemaOf(original).additionalProperties, true);
});

test("prepareArguments drops path when hashline is anchor-only", () => {
  const locked = lockHashlineEditSchema(replaceTool(false));
  assert.ok(locked.prepareArguments);
  const prepared = locked.prepareArguments({
    path: { not: "a string" },
    file_path: "probe.tmp",
    remove_from: "heRG",
    remove_to: "MXGH",
    replacement_lines: ["line 2"],
  });
  assert.deepEqual(prepared, {
    remove_from: "heRG",
    remove_to: "MXGH",
    replacement_lines: ["line 2"],
  });
});

test("prepareArguments({path, remove_from}) drops string path in anchor mode", () => {
  const locked = lockHashlineEditSchema(replaceTool(false));
  const prepared = locked.prepareArguments?.({
    path: "/tmp/pi-quiet-path-probe.txt",
    remove_from: "YPQt",
    remove_to: "YPQt",
    replacement_lines: ["line-two-with-path-forced"],
  }) as Record<string, unknown>;
  assert.equal("path" in prepared, false);
  assert.equal("file_path" in prepared, false);
  assert.deepEqual(prepared, {
    remove_from: "YPQt",
    remove_to: "YPQt",
    replacement_lines: ["line-two-with-path-forced"],
  });
});

test("prepareArguments keeps path when schema requires it", () => {
  const locked = lockHashlineEditSchema(replaceTool(true));
  assert.equal(schemaOf(locked).additionalProperties, false);
  assert.equal("path" in (schemaOf(locked).properties ?? {}), true);
  const prepared = locked.prepareArguments?.({
    path: "probe.tmp",
    remove_from: "heRG",
    remove_to: "MXGH",
    replacement_lines: ["line 2"],
  });
  assert.deepEqual(prepared, {
    path: "probe.tmp",
    remove_from: "heRG",
    remove_to: "MXGH",
    replacement_lines: ["line 2"],
  });
});

test("locked insert schema also forbids extra fields", () => {
  const locked = lockHashlineEditSchema({
    name: "insert",
    label: "insert",
    description: "hashline insert",
    parameters: buildInsertToolSchema(false),
    async execute() {
      return { content: [] };
    },
  } as ToolDefinition);
  assert.equal(schemaOf(locked).additionalProperties, false);
  const prepared = locked.prepareArguments?.({
    path: "probe.tmp",
    anchor: "waKr",
    direction: "after",
    lines: ["line 5"],
  });
  assert.deepEqual(prepared, {
    anchor: "waKr",
    direction: "after",
    lines: ["line 5"],
  });
});
