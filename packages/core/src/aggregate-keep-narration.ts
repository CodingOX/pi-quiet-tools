import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import { omitCollapsedLedgerNarration } from "./aggregate-omit-ledger-narration.js";
import { visibleTerminalText } from "./terminal-text.js";

const THINKING_PATCH_KEY = Symbol.for(
  "pi-tool-display-intent.aggregate-thinking-placeholder.v1",
);
const LEGACY_NARRATION_WRAP_KEY = Symbol.for(
  "pi-quiet-tools.aggregate-keep-narration.v2",
);
const NARRATION_WRAP_KEY = Symbol.for("pi-quiet-tools.aggregate-keep-narration.v3");
const PRECEDING_TOOLS_LEDGER_STATE_KEY = Symbol.for(
  "pi-quiet-tools.aggregate-keep-narration.preceding-tools-ledger.v1",
);
const DEFAULT_HIDDEN_THINKING_LABEL = "Thinking...";

type PrecedingToolsLedgerResolver = (message: unknown) => boolean;

interface PrecedingToolsLedgerState {
  resolver: PrecedingToolsLedgerResolver;
}

function precedingToolsLedgerState(): PrecedingToolsLedgerState {
  const host = globalThis as Record<PropertyKey, unknown>;
  const candidate = host[PRECEDING_TOOLS_LEDGER_STATE_KEY];
  if (
    candidate &&
    typeof candidate === "object" &&
    typeof (candidate as Partial<PrecedingToolsLedgerState>).resolver === "function"
  ) {
    return candidate as PrecedingToolsLedgerState;
  }
  const state: PrecedingToolsLedgerState = { resolver: () => false };
  host[PRECEDING_TOOLS_LEDGER_STATE_KEY] = state;
  return state;
}

export function setPrecedingToolsLedgerResolver(
  resolver: PrecedingToolsLedgerResolver,
): void {
  precedingToolsLedgerState().resolver = resolver;
}

function hasPrecedingToolsLedger(message: unknown): boolean {
  return precedingToolsLedgerState().resolver(message);
}
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

interface AssistantMessageProjection extends Record<string, unknown> {
  content?: unknown[];
}

type WrappedRender = ((this: unknown, width: number) => string[]) & {
  [LEGACY_NARRATION_WRAP_KEY]?: true;
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

function isTerminalAssistantMessage(message: unknown): boolean {
  const stopReason = toRecord(message).stopReason;
  return (
    stopReason === "error" ||
    stopReason === "aborted" ||
    stopReason === "length" ||
    stopReason === "stop"
  );
}

function isInterimAssistantNarration(component: unknown): boolean {
  const message = toRecord(toRecord(component).lastMessage);
  if (isTerminalAssistantMessage(message)) {
    return false;
  }
  if (message.stopReason === "toolUse") {
    return true;
  }
  return messageContentBlocks(message).some(
    (blockValue) => toRecord(blockValue).type === "toolCall",
  );
}

const GPT_THINKING_BLOCK_PATTERN = /<thinking\b[^>]*>[\s\S]*?<\/thinking\s*>/gi;
const GPT_UNCLOSED_THINKING_PATTERN = /<thinking\b[^>]*>[\s\S]*$/i;
// Magic Context 为会话编排附加的消息序号只可能出现在首段可见文本。
const SESSION_SEQUENCE_PREFIX_PATTERN = /^\s*§\d+§(?:[ \t]*\r?\n|[ \t]+)?/;

function omitSessionSequencePrefix(
  message: unknown,
): AssistantMessageProjection | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  let changed = false;
  let isFirstTextBlock = true;
  const content = messageContentBlocks(message).map((entry) => {
    const block = toRecord(entry);
    if (block.type !== "text" || typeof block.text !== "string") {
      return entry;
    }
    if (!isFirstTextBlock || !block.text.trim()) {
      return entry;
    }

    isFirstTextBlock = false;
    const text = block.text.replace(SESSION_SEQUENCE_PREFIX_PATTERN, "");
    if (text === block.text) {
      return entry;
    }
    changed = true;
    return { ...block, text };
  });
  return changed ? { ...toRecord(message), content } : toRecord(message);
}

function omitThinkingContentBlocks(
  message: unknown,
): AssistantMessageProjection | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const content = messageContentBlocks(message);
  let changed = false;
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
      const text = block.text
        .replace(GPT_THINKING_BLOCK_PATTERN, "")
        .replace(GPT_UNCLOSED_THINKING_PATTERN, "");
      if (text === block.text) {
        return entry;
      }
      changed = true;
      return { ...block, text };
    });
  const withoutThinking = changed
    ? { ...toRecord(message), content: next }
    : toRecord(message);
  return omitSessionSequencePrefix(withoutThinking);
}

function renderWithTemporaryMessage(
  component: AssistantRenderContext,
  message: unknown,
  render: (this: unknown, width: number) => string[],
  width: number,
): string[] {
  const originalMessage = component.lastMessage;
  if (message === originalMessage || typeof component.updateContent !== "function") {
    return render.call(component, width);
  }

  // 只替换当前组件的渲染投影；Pi 的 updateContent 默认会保留流式状态。
  try {
    component.updateContent(message);
    return render.call(component, width);
  } finally {
    try {
      component.updateContent(originalMessage);
    } catch {
      // Restore must stay fail-open so a later invalidate can rebuild.
    }
  }
}

function visibleText(line: string): string {
  return visibleTerminalText(line);
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

interface RecoveredNarrationLines {
  lines: string[];
  hadLeadingGap: boolean;
}

function stripThinkingPlaceholderLines(
  lines: readonly string[],
  label: string,
): RecoveredNarrationLines {
  const kept = lines.filter((line) => visibleText(line) !== label);
  const hadLeadingGap = visibleText(kept[0] ?? "") === "";
  while (kept.length > 0 && visibleText(kept[0]!) === "") {
    kept.shift();
  }
  while (kept.length > 0 && visibleText(kept[kept.length - 1]!) === "") {
    kept.pop();
  }
  return { lines: kept, hadLeadingGap };
}

/**
 * 已绘制的聚合内容与恢复的 Markdown 连接时只保留一行间隔：
 * ledger 已有尾随空行则复用；两侧都没有时补一行作为 ledger 的尾随间隔。
 */
export function appendRecoveredNarration(
  painted: readonly string[],
  narration: readonly string[],
): string[] {
  if (painted.length === 0 || narration.length === 0) {
    return [...painted, ...narration];
  }
  const paintedEndsWithGap = visibleText(painted[painted.length - 1] ?? "") === "";
  const narrationStartsWithGap = visibleText(narration[0] ?? "") === "";
  if (paintedEndsWithGap && narrationStartsWithGap) {
    return [...painted, ...narration.slice(1)];
  }
  if (!paintedEndsWithGap && !narrationStartsWithGap) {
    return [...painted, "", ...narration];
  }
  return [...painted, ...narration];
}

export function recoverSwallowedNarration(
  component: AssistantRenderContext,
  originalRender: (this: unknown, width: number) => string[],
  width: number,
  precededByToolsLedger = hasPrecedingToolsLedger(component.lastMessage),
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
  const lines = renderWithTemporaryMessage(
    component,
    stripped,
    originalRender,
    width,
  );

  const recovered = stripThinkingPlaceholderLines(
    lines,
    resolveHiddenThinkingLabel(component),
  );
  if (recovered.lines.length === 0) {
    return [];
  }
  // `AssistantMessageComponent` 原本提供一行 Spacer(1)，聚合占位补丁会
  // 将其剥离；只有正文位于 Tools ledger 之前时才需要恢复。
  return recovered.hadLeadingGap && !precededByToolsLedger
    ? ["", ...recovered.lines]
    : recovered.lines;
}

function wrapAssistantRender(): void {
  // SAFETY: Pi 运行时原型提供 render；仅在检测到上游聚合补丁后包装该方法。
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
  const wrapsLegacyNarration = liveRender[LEGACY_NARRATION_WRAP_KEY] === true;

  const wrappedRender = function wrappedKeepNarrationRender(
    this: unknown,
    width: number,
  ): string[] {
    const component = this as AssistantRenderContext;
    const originalMessage = component.lastMessage;
    const renderMessage = isTerminalAssistantMessage(originalMessage)
      ? originalMessage
      : omitSessionSequencePrefix(originalMessage);
    const rendered = omitCollapsedLedgerNarration(
      renderWithTemporaryMessage(component, renderMessage, liveRender, width),
    );
    const painted = removeExpandedNarrationFrame(rendered);
    const removedExpandedNarration = painted.length !== rendered.length;
    if (!removedExpandedNarration && painted.length > 0 && !wrapsLegacyNarration) {
      return painted;
    }
    try {
      const narration = recoverSwallowedNarration(
        component,
        originalRender,
        width,
      );
      if (wrapsLegacyNarration && narration.length > 0) {
        return narration;
      }
      if (removedExpandedNarration && painted.length > 0 && narration.length > 0) {
        return appendRecoveredNarration(painted, narration);
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
