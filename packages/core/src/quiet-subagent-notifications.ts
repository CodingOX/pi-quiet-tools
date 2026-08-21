import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

interface SubagentNotificationDetails {
  description?: unknown;
  status?: unknown;
  error?: unknown;
  resultPreview?: unknown;
  others?: unknown;
}

const FAILURE_STATUSES = new Set(["error", "stopped", "aborted"]);
const MAX_FAILURE_PREVIEW_LENGTH = 160;
const FORBIDDEN_NOTIFICATION_METADATA = /\b(?:transcript(?:\s*|_)?(?:path|file)?|output(?:\s*|_)?file|result(?:\s*|_)?preview)\b/i;
const PATH_SEPARATOR = /[\\/]/;
const OSC_SEQUENCE = /\x1B\][\s\S]*?(?:\x07|\x1B\\)/g;
const STRING_CONTROL_SEQUENCE = /\x1B[PX^_][\s\S]*?\x1B\\/g;
const CSI_SEQUENCE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const OTHER_CONTROL_CHARACTERS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
function textValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  // 上游详情是未受信任的终端文本；在拼接样式前先移除所有可改变终端状态的控制序列。
  return value
    .replace(OSC_SEQUENCE, "")
    .replace(STRING_CONTROL_SEQUENCE, "")
    .replace(CSI_SEQUENCE, "")
    .replace(OTHER_CONTROL_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeTerminalText(value: unknown): string {
  const text = textValue(value);
  if (!text) {
    return "";
  }

  // 单个可疑片段整体降级，避免路径含空格或平台变体时留下局部敏感内容。
  if (FORBIDDEN_NOTIFICATION_METADATA.test(text)) {
    return "[redacted]";
  }
  if (PATH_SEPARATOR.test(text)) {
    return "[path]";
  }

  return text;
}

function failurePreview(value: unknown): string {
  return safeTerminalText(value).slice(0, MAX_FAILURE_PREVIEW_LENGTH);
}

function detailsList(value: unknown): unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [undefined];
  }

  const details = value as SubagentNotificationDetails;
  if (details.others === undefined) {
    return [details];
  }

  // 分组通知中的每个条目都要经过诊断；不能因上游数据损坏而悄然消失。
  return Array.isArray(details.others)
    ? [details, ...details.others]
    : [details, undefined];
}

/**
 * 将子代理完成通知压缩成仅包含结果状态的单行文本；临时 transcript 路径只应由
 * get_subagent_result 在明确需要完整记录时提供，不能成为常规终端输出的一部分。
 */
export function formatQuietSubagentNotifications(value: unknown): string[] {
  return detailsList(value).map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return "! Agent notification details unavailable";
    }

    const details = value as SubagentNotificationDetails;
    const rawDescription = textValue(details.description);
    const status = typeof details.status === "string" ? details.status : "";
    const description = safeTerminalText(rawDescription);

    if (!description || !status) {
      return "! Agent notification details unavailable";
    }

    if (status === "completed" || status === "steered") {
      const suffix = status === "steered" ? " completed (steered)" : " completed";
      return `✓ ${description}${suffix}`;
    }

    if (FAILURE_STATUSES.has(status)) {
      const preview = failurePreview(details.error) || "No error details.";
      return `✗ ${description} ${status}: ${preview}`;
    }

    return `! ${description} unknown status: ${safeTerminalText(status) || "missing"}`;
  });
}

/**
 * Pi 对相同 customType 使用扩展加载序列中的第一个渲染器。core 位于
 * pi-subagents 前时，此 renderer 会替换上游冗长通知，同时不影响 LLM 上下文中的原始消息。
 */
export function installQuietSubagentNotificationRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer<SubagentNotificationDetails>(
    "subagent-notification",
    (message, _options, theme) => {
      const lines = formatQuietSubagentNotifications(message.details);

      const rendered = lines.map((line) => (
        line.startsWith("✗")
          ? theme.fg("error", line)
          : line.startsWith("!")
            ? theme.fg("warning", line)
            : theme.fg("muted", line)
      ));
      return new Text(rendered.join("\n"), 0, 0);
    },
  );
}
