import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendRecoveredNarration,
  installAggregateKeepNarrationPatch,
  recoverSwallowedNarration,
  removeExpandedNarrationFrame,
} from "./aggregate-keep-narration.ts";

test("recovered narration preserves Pi's leading spacer", () => {
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

  assert.deepEqual(lines, ["", "继续核对渲染边界"]);
});

test("recovered narration does not duplicate a preceding Tools ledger gap", () => {
  const lines = recoverSwallowedNarration(
    {
      lastMessage: {
        stopReason: "toolUse",
        content: [{ type: "text", text: "继续核对渲染边界" }],
      },
    },
    () => ["", "继续核对渲染边界", ""],
    80,
    true,
  );

  assert.deepEqual(lines, ["继续核对渲染边界"]);
});

test("Tools ledger and recovered narration share exactly one blank row", () => {
  const lines = appendRecoveredNarration(
    ["", "✓ Tools (2 calls · 1 turn) · read ×1 · bash ×1", ""],
    ["", "继续核对渲染边界"],
  );

  assert.deepEqual(lines, [
    "",
    "✓ Tools (2 calls · 1 turn) · read ×1 · bash ×1",
    "",
    "继续核对渲染边界",
  ]);
});

test("expanded ledger supplies a separator when no rendered spacer exists", () => {
  const lines = appendRecoveredNarration(["ledger"], ["narration"]);

  assert.deepEqual(lines, ["ledger", "", "narration"]);
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

  assert.deepEqual(lines, ["", "实施前的正常说明"]);
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

  assert.deepEqual(lines, ["", "正常说明"]);
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

test("strips a session sequence across text-only and tool-use streaming frames", async () => {
  const { AssistantMessageComponent } = await import(
    "@earendil-works/pi-coding-agent"
  );
  type FixtureMessage = {
    stopReason?: string;
    content: Array<{ type: string; text?: string }>;
  };
  type FixtureComponent = {
    lastMessage: FixtureMessage;
    updateContent(message: unknown): void;
  };
  type PatchablePrototype = Record<PropertyKey, unknown> & {
    render(this: unknown, width: number): string[];
  };

  const thinkingPatchKey = Symbol.for(
    "pi-tool-display-intent.aggregate-thinking-placeholder.v1",
  );
  const prototype =
    AssistantMessageComponent.prototype as unknown as PatchablePrototype;
  const previousRender = prototype.render;
  const previousThinkingState = prototype[thinkingPatchKey];
  const originalRender = function originalRender(
    this: FixtureComponent,
    _width: number,
  ): string[] {
    return this.lastMessage.content.flatMap((block) =>
      block.type === "text" && block.text ? [block.text] : [],
    );
  };
  const aggregateRender = function aggregateRender(
    this: FixtureComponent,
    width: number,
  ): string[] {
    const hasToolCall = this.lastMessage.content.some(
      (block) => block.type === "toolCall",
    );
    return hasToolCall ? [] : originalRender.call(this, width);
  };

  prototype.render = aggregateRender as PatchablePrototype["render"];
  prototype[thinkingPatchKey] = {
    originalRender,
    patchedRender: aggregateRender,
  };

  try {
    installAggregateKeepNarrationPatch();
    const render = prototype.render;
    const component: FixtureComponent = {
      lastMessage: {
        content: [{ type: "text", text: "§26§ 额外发现一个关键点" }],
      },
      updateContent(message: unknown) {
        this.lastMessage = message as FixtureMessage;
      },
    };
    const textOnlyMessage = component.lastMessage;

    assert.deepEqual(render.call(component, 80), ["额外发现一个关键点"]);
    assert.equal(component.lastMessage, textOnlyMessage);

    component.lastMessage = {
      stopReason: "toolUse",
      content: [
        { type: "text", text: "§26§ 额外发现一个关键点" },
        { type: "toolCall" },
      ],
    };
    const toolUseMessage = component.lastMessage;

    assert.deepEqual(render.call(component, 80), ["额外发现一个关键点"]);
    assert.equal(component.lastMessage, toolUseMessage);
  } finally {
    prototype.render = previousRender;
    if (previousThinkingState === undefined) {
      delete prototype[thinkingPatchKey];
    } else {
      prototype[thinkingPatchKey] = previousThinkingState;
    }
  }
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
