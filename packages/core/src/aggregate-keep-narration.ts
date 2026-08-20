import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import { omitCollapsedLedgerNarration } from "./aggregate-omit-ledger-narration.js";

const THINKING_PATCH_KEY = Symbol.for(
  "pi-tool-display-intent.aggregate-thinking-placeholder.v1",
);
const NARRATION_WRAP_KEY = Symbol.for("pi-quiet-tools.aggregate-keep-narration.v2");

const OSC_SEQUENCE_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ANSI_SEQUENCE_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;
const DEFAULT_HIDDEN_THINKING_LABEL = "Thinking...";

interface ThinkingPatchState {
  originalRender?: (this: unknown, width: number) => string[];
  patchedRender?: (this: unknown, width: number) => string[];
}

interface PatchableAssistantPrototype {
  render(width: number): string[];
  [THINKING_PATCH_KEY]?: ThinkingPatchState;
}

interface AssistantRenderContext {
  lastMessage?: unknown;
  hiddenThinkingLabel?: unknown;
  updateContent?: (message: unknown, isStreaming?: boolean) => void;
}

type WrappedRender = ((this: unknown, width: number) => string[]) & {
  [NARRATION_WRAP_KEY]?: true;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function messageContentBlocks(message: unknown): unknown[] {
  const content = toRecord(message).content;
  return Array.isArray(content) ? content : [];
}

function messageHasNarrationText(message: unknown): boolean {
  return messageContentBlocks(message).some((entry) => {
    const block = toRecord(entry);
    return (
      block.type === "text" &&
      typeof block.text === "string" &&
      Boolean(block.text.trim())
    );
  });
}

function isInterimAssistantNarration(component: unknown): boolean {
  const message = toRecord(toRecord(component).lastMessage);
  const stopReason = message.stopReason;
  if (
    stopReason === "error" ||
    stopReason === "aborted" ||
    stopReason === "length" ||
    stopReason === "stop"
  ) {
    return false;
  }
  if (stopReason === "toolUse") {
    return true;
  }
  return messageContentBlocks(message).some(
    (blockValue) => toRecord(blockValue).type === "toolCall",
  );
}

const GPT_THINKING_BLOCK_PATTERN = /<thinking\b[^>]*>[\s\S]*?<\/thinking\s*>/gi;
const GPT_UNCLOSED_THINKING_PATTERN = /<thinking\b[^>]*>[\s\S]*$/i;
// Magic Context 为会话编排附加的消息序号只可能出现在恢复路径的首段文本。
const SESSION_SEQUENCE_PREFIX_PATTERN = /^\s*§\d+§(?:[ \t]*\r?\n|[ \t]+)?/;

function omitThinkingContentBlocks(message: unknown): unknown {
  if (!message || typeof message !== "object") {
    return message;
  }
  const content = messageContentBlocks(message);
  let changed = false;
  let isFirstTextBlock = true;
  const next = content
    .filter((entry) => {
      const keep = toRecord(entry).type !== "thinking";
      changed ||= !keep;
      return keep;
    })
    .map((entry) => {
      const block = toRecord(entry);
      if (block.type !== "text" || typeof block.text !== "string") {
        return entry;
      }

      // Some GPT-compatible gateways serialize reasoning as ordinary text rather
      // than Pi's structured `thinking` blocks. This render-only recovery path
      // handles assistant messages between tool phases, so suppress both complete
      // tags and a trailing unclosed tag while the response is still streaming.
      let text = block.text
        .replace(GPT_THINKING_BLOCK_PATTERN, "")
        .replace(GPT_UNCLOSED_THINKING_PATTERN, "");
      if (isFirstTextBlock && text.trim()) {
        isFirstTextBlock = false;
        text = text.replace(SESSION_SEQUENCE_PREFIX_PATTERN, "");
      }
      if (text === block.text) {
        return entry;
      }
      changed = true;
      return { ...block, text };
    });
  return changed ? { ...toRecord(message), content: next } : message;
}

function visibleText(line: string): string {
  return line
    .replace(OSC_SEQUENCE_PATTERN, "")
    .replace(ANSI_SEQUENCE_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ctrl+O frames interim assistant prose as `│ › ...` beside the expanded
 * tool timeline. Quiet-tools owns prose presentation, so preserve the actual
 * tool rows and let the normal Markdown recovery path render the prose.
 */
export function removeExpandedNarrationFrame(lines: readonly string[]): string[] {
  let foundNarrationFrame = false;
  const preserved: string[] = [];

  for (const line of lines) {
    const visible = visibleText(line);
    if (/^[│└]\s*›(?:\s|$)/.test(visible)) {
      foundNarrationFrame = true;
      continue;
    }
    const isFramedLine = /^[│└](?:\s|$)/.test(visible);
    const isToolOrSteerLine = /^[│└]\s+[✓◐!↳…]/.test(visible);
    if (foundNarrationFrame && isFramedLine && !isToolOrSteerLine) {
      continue;
    }
    preserved.push(line);
  }

  return preserved;
}
function resolveHiddenThinkingLabel(component: AssistantRenderContext): string {
  const label = component.hiddenThinkingLabel;
  if (typeof label !== "string") {
    return DEFAULT_HIDDEN_THINKING_LABEL;
  }
  const normalized = label.replace(/\s+/g, " ").trim();
  return normalized || DEFAULT_HIDDEN_THINKING_LABEL;
}

function stripThinkingPlaceholderLines(
  lines: readonly string[],
  label: string,
): string[] {
  const kept = lines.filter((line) => visibleText(line) !== label);
  while (kept.length > 0 && visibleText(kept[0]!) === "") {
    kept.shift();
  }
  while (kept.length > 0 && visibleText(kept[kept.length - 1]!) === "") {
    kept.pop();
  }
  return kept;
}

export function recoverSwallowedNarration(
  component: AssistantRenderContext,
  originalRender: (this: unknown, width: number) => string[],
  width: number,
): string[] {
  if (!Number.isFinite(width) || width <= 0) {
    return [];
  }
  if (!isInterimAssistantNarration(component)) {
    return [];
  }
  const originalMessage = component.lastMessage;
  const stripped = omitThinkingContentBlocks(originalMessage);
  if (!messageHasNarrationText(stripped)) {
    return [];
  }
  let lines: string[];
  if (stripped !== originalMessage && typeof component.updateContent === "function") {
    try {
      component.updateContent(stripped);
      lines = originalRender.call(component, width);
    } finally {
      try {
        component.updateContent(originalMessage);
      } catch {
        // Restore must stay fail-open so a later invalidate can rebuild.
      }
    }
  } else {
    lines = originalRender.call(component, width);
  }

  const trimmed = stripThinkingPlaceholderLines(
    lines,
    resolveHiddenThinkingLabel(component),
  );
  if (trimmed.length === 0) {
    return [];
  }
  // The aggregate ledger owns the preceding separation. Do not add another blank
  // row here, or resumed narration is pushed two lines away from its tool activity.
  return trimmed;
}

function wrapAssistantRender(): void {
  const prototype =
    AssistantMessageComponent.prototype as unknown as PatchableAssistantPrototype;
  const thinkingState = prototype[THINKING_PATCH_KEY];
  const originalRender = thinkingState?.originalRender;
  if (!thinkingState || typeof originalRender !== "function") {
    return;
  }

  const liveRender = prototype.render as WrappedRender;
  if (liveRender[NARRATION_WRAP_KEY]) {
    return;
  }

  const wrappedRender = function wrappedKeepNarrationRender(
    this: unknown,
    width: number,
  ): string[] {
    const rendered = omitCollapsedLedgerNarration(liveRender.call(this, width));
    const painted = removeExpandedNarrationFrame(rendered);
    const removedExpandedNarration = painted.length !== rendered.length;
    if (!removedExpandedNarration && painted.length > 0) {
      return painted;
    }
    try {
      const narration = recoverSwallowedNarration(
        this as AssistantRenderContext,
        originalRender,
        width,
      );
      if (removedExpandedNarration && painted.length > 0 && narration.length > 0) {
        return [...painted, "", ...narration];
      }
      return narration.length > 0 ? narration : painted;
    } catch {
      return painted;
    }
  } as WrappedRender;
  wrappedRender[NARRATION_WRAP_KEY] = true;

  prototype.render = wrappedRender;
  if (thinkingState.patchedRender === liveRender) {
    thinkingState.patchedRender = wrappedRender;
  }
}

export function installAggregateKeepNarrationPatch(): void {
  wrapAssistantRender();
}
