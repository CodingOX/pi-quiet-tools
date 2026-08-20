import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recoverSwallowedNarration,
  removeExpandedNarrationFrame,
} from "./aggregate-keep-narration.ts";

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

test("strips a session sequence after a thinking-only text block", () => {
  const originalMessage = {
    stopReason: "toolUse",
    content: [
      { type: "text", text: "<thinking>Inspecting coverage</thinking>" },
      { type: "text", text: "§191§ 正常说明" },
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
    () => renderedMessage.content.map((block) => block.text.trim()),
    80,
  );

  assert.deepEqual(lines, ["正常说明"]);
  assert.equal(renderedMessage, originalMessage);
});

test("removes a session sequence prefix from recovered interim narration", () => {
  const originalMessage = {
    stopReason: "toolUse",
    content: [{ type: "text", text: "§191§ 已把风险面缩到两个具体位置" }],
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
    () => [renderedMessage.content[0]!.text.trim()],
    80,
  );

  assert.deepEqual(lines, ["已把风险面缩到两个具体位置"]);
  assert.equal(renderedMessage, originalMessage);
});

test("keeps sequence-like text outside the first interim prefix", () => {
  const originalMessage = {
    stopReason: "toolUse",
    content: [
      { type: "text", text: "正文中的 §191§ 保留" },
      { type: "text", text: "第二段仍含 §192§" },
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
    () => renderedMessage.content.map((block) => block.text),
    80,
  );

  assert.deepEqual(lines, ["正文中的 §191§ 保留", "第二段仍含 §192§"]);
  assert.equal(renderedMessage, originalMessage);
});

test("does not recover a final answer with a session sequence prefix", () => {
  let updated = false;
  const lines = recoverSwallowedNarration(
    {
      lastMessage: {
        stopReason: "stop",
        content: [{ type: "text", text: "§191§ 最终回答" }],
      },
      updateContent() {
        updated = true;
      },
    },
    () => {
      throw new Error("final answers must not use interim recovery");
    },
    80,
  );

  assert.deepEqual(lines, []);
  assert.equal(updated, false);
});

test("keeps an expanded Tools ledger but removes its framed narration", () => {
  const lines = removeExpandedNarrationFrame([
    "",
    "✓ Tools (2 calls · 1 turn) · read ×1 · bash ×1",
    "  │ › 先读取会话导出，再确认未决改动。",
    "  │   正文续行不能留在工具时间线内。",
    "  │ ✓ Read(session.html)",
    "  └ 仍是同一段正文。",
    "  │",
  ]);

  assert.deepEqual(lines, [
    "",
    "✓ Tools (2 calls · 1 turn) · read ×1 · bash ×1",
    "  │ ✓ Read(session.html)",
  ]);
});
