import assert from "node:assert/strict";
import { test } from "node:test";
import { recoverSwallowedNarration } from "./aggregate-keep-narration.ts";

test("recovered narration follows an aggregate ledger without an extra blank row", () => {
  const lines = recoverSwallowedNarration(
    {
      lastMessage: {
        stopReason: "toolUse",
        content: [{ type: "text", text: "继续核对渲染边界" }],
      },
    },
    () => ["", "继续核对渲染边界", ""],
    80,
  );

  assert.deepEqual(lines, ["继续核对渲染边界"]);
});
