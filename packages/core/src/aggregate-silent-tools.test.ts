import assert from "node:assert/strict";
import { test } from "node:test";
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { installAggregateSilentToolsPatch } from "./aggregate-silent-tools.ts";

const AGGREGATE_PATCH_KEY = Symbol.for(
  "pi-tool-display-intent.aggregate-tool-execution.v1",
);
const SILENT_WRAP_KEY = Symbol.for("pi-tools.aggregate-silent-wrap.v3");
const SILENT_INNER_KEY = Symbol.for("pi-tools.aggregate-silent-inner.v2");

type RenderFn = ((this: unknown, width: number) => string[]) & {
  [SILENT_WRAP_KEY]?: true;
  [SILENT_INNER_KEY]?: (this: unknown, width: number) => string[];
};

function ledgerRender(): string[] {
  return ["", "✓ Tools (2 calls · 1 turn) · read ×2", ""];
}

function silentOriginal(): string[] {
  return [];
}

test("reattaches the Tools ledger when live render was restored to the empty hashline renderer", () => {
  const prototype = ToolExecutionComponent.prototype as unknown as {
    render: RenderFn;
    [AGGREGATE_PATCH_KEY]?: {
      patchedRender?: RenderFn;
      projection?: unknown;
    };
  };
  const originalRender = prototype.render;
  const wrap = function wrappedStale(): string[] {
    return ledgerRender();
  } as RenderFn;
  wrap[SILENT_WRAP_KEY] = true;
  wrap[SILENT_INNER_KEY] = ledgerRender;

  prototype[AGGREGATE_PATCH_KEY] = {
    patchedRender: wrap,
    projection: {},
  };
  prototype.render = silentOriginal as RenderFn;

  try {
    installAggregateSilentToolsPatch();
    const lines = prototype.render.call({ toolName: "read", expanded: false }, 120);
    assert.match(lines.join("\n"), /Tools \(2 calls · 1 turn\) · read ×2/);
  } finally {
    prototype.render = originalRender;
    delete prototype[AGGREGATE_PATCH_KEY];
  }
});
