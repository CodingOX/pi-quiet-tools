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

test("does not recover GPT-style thinking tags as interim narration", () => {
  const thinking = "Inspecting version test coverage before implementation";
  const lines = recoverSwallowedNarration(
    {
      lastMessage: {
        stopReason: "toolUse",
        content: [{ type: "text", text: `<thinking>${thinking}</thinking>` }],
      },
    },
    () => {
      throw new Error("thinking-only narration must not be rendered");
    },
    80,
  );

  assert.deepEqual(lines, []);
});

test("keeps narration beside GPT-style thinking tags and removes an unclosed tag", () => {
  const originalMessage = {
    stopReason: "toolUse",
    content: [
      {
        type: "text",
        text: "<thinking>Inspecting coverage</thinking>\n实施前的正常说明<thinking>streaming",
      },
    ],
  };
  let renderedMessage = originalMessage;
  const component = {
    lastMessage: originalMessage,
    updateContent(message: unknown) {
      renderedMessage = message as typeof originalMessage;
    },
  };
  const lines = recoverSwallowedNarration(
    component,
    () => ["", renderedMessage.content[0]!.text.trim(), ""],
    80,
  );

  assert.deepEqual(lines, ["实施前的正常说明"]);
  assert.equal(renderedMessage, originalMessage);
});
