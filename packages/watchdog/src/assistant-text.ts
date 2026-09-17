/**
 * 「助手消息里有没有人能看见的正文」——纯函数原语，零 Pi / 零 display-intent 依赖。
 *
 * 为什么单独成模块：
 * 这个判断有两个互不相干的消费者 ——
 * 1) 看门狗要判断「模型是否开口了」，据此决定要不要清零 bash 账（host 清零、child 不清）；
 * 2) core 的旁白恢复要判断「这条消息该不该被当作正式正文渲染」。
 * 原先它长在 core 的 aggregate-keep-narration.ts 里，而那个文件是 display-intent 的
 * 补丁模块。看门狗从那里 import，就等于被间接绑在 display-intent 上，无法独立发布。
 * 提到 watchdog 包之后：watchdog 自足，core 反向依赖 watchdog。
 *
 * 三个「噪声」来源都在这里剥掉，因为它们都不是人能看见的正文：
 * - Pi 的结构化 thinking block
 * - 部分 GPT 兼容网关把推理塞进普通 text 的 <thinking> 标签
 * - Magic Context 附加的 §N§ 会话序号前缀
 */

export interface AssistantMessageProjection extends Record<string, unknown> {
  content?: unknown[];
}

export function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function messageContentBlocks(message: unknown): unknown[] {
  const content = toRecord(message).content;
  return Array.isArray(content) ? content : [];
}

export function messageHasNarrationText(message: unknown): boolean {
  return messageContentBlocks(message).some((entry) => {
    const block = toRecord(entry);
    return (
      block.type === "text" &&
      typeof block.text === "string" &&
      Boolean(block.text.trim())
    );
  });
}

const GPT_THINKING_BLOCK_PATTERN = /<thinking\b[^>]*>[\s\S]*?<\/thinking\s*>/gi;
const GPT_UNCLOSED_THINKING_PATTERN = /<thinking\b[^>]*>[\s\S]*$/i;
// Magic Context 为会话编排附加的消息序号只可能出现在首段可见文本。
const SESSION_SEQUENCE_PREFIX_PATTERN = /^\s*§\d+§(?:[ \t]*\r?\n|[ \t]+)?/;

export function omitSessionSequencePrefix(
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

/**
 * 剥掉 thinking 投影，只留人能读的正文。
 *
 * Some GPT-compatible gateways serialize reasoning as ordinary text rather
 * than Pi's structured `thinking` blocks. This render-only recovery path
 * handles assistant messages between tool phases, so suppress both complete
 * tags and a trailing unclosed tag while the response is still streaming.
 */
export function omitThinkingContentBlocks(
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

/** 人能看见的助手正文：剥掉 thinking / 会话序号之后还有字。 */
export function hasOfficialAssistantText(message: unknown): boolean {
  const role = toRecord(message).role;
  if (role !== undefined && role !== "assistant") {
    return false;
  }
  return messageHasNarrationText(omitThinkingContentBlocks(message));
}
