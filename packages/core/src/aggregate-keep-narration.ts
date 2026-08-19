import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";

const THINKING_PATCH_KEY = Symbol.for(
  "pi-tool-display-intent.aggregate-thinking-placeholder.v1",
);
const NARRATION_WRAP_KEY = Symbol.for("pi-quiet-tools.aggregate-keep-narration.v1");

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

function omitThinkingContentBlocks(message: unknown): unknown {
  if (!message || typeof message !== "object") {
    return message;
  }
  const content = messageContentBlocks(message);
  const next = content.filter((entry) => toRecord(entry).type !== "thinking");
  if (next.length === content.length) {
    return message;
  }
  return { ...toRecord(message), content: next };
}

function visibleText(line: string): string {
  return line
    .replace(OSC_SEQUENCE_PATTERN, "")
    .replace(ANSI_SEQUENCE_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
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

function recoverSwallowedNarration(
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
  if (!messageHasNarrationText(component.lastMessage)) {
    return [];
  }

  const originalMessage = component.lastMessage;
  const stripped = omitThinkingContentBlocks(originalMessage);
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
  return visibleText(trimmed[0] ?? "") === "" ? trimmed : ["", ...trimmed];
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
    const painted = liveRender.call(this, width);
    if (painted.length > 0) {
      return painted;
    }
    try {
      return recoverSwallowedNarration(
        this as AssistantRenderContext,
        originalRender,
        width,
      );
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
