import { looksLikeAggregateLedger } from "./aggregate-silent-ledger.js";
import { stripTerminalSequences as stripRenderSequences } from "./terminal-text.js";

const COLLAPSED_NARRATION_MARK = "›";
const TOOL_OR_STEER_MARKER_PATTERN = /^[✓◐!↳…]/;
const LEDGER_HEADER_PATTERN = /^Tools\s*\(\s*\d+\s+calls?/;

function isCollapsedNarrationStart(line: string): boolean {
  const plain = stripRenderSequences(line);
  const trimmed = plain.trimStart();
  // Ctrl+O 时间线是框线在前：`│ ›` / `└ …`
  // 折叠钉是 › 在前。助手 Markdown 自带的 `│` 会变成 `› │ …`，那仍是折叠钉。
  if (trimmed.startsWith("│") || trimmed.startsWith("└")) {
    return false;
  }
  return trimmed.startsWith(`${COLLAPSED_NARRATION_MARK} `);
}

/**
 * 旁白钉的续行判据：固定 4 空格前缀 + 非工具行内容。
 *
 * 注意「整行空白」也算续行：display-intent 的 `renderCollapsedAssistantNarration`
 * 走 Markdown 渲染，而 Markdown **把每一行补齐到整行宽度**，所以旁白里的段落
 * 分隔行到达这里时是 `    ` + 一整行空格，`trim()` 后为空但并不是空字符串。
 *
 * 为什么必须认它：漏掉这一行会留下两个可见后果 ——
 * 1. 该行原样留在表头与首个工具行之间，终端上就是一条凭空的宽间距（无内容可读）；
 * 2. 它还会中断下面的跳过链（`skipContinuations` 被重置），把旁白的后续段落也一起漏出来。
 */
function isCollapsedNarrationContinuation(line: string): boolean {
  const plain = stripRenderSequences(line);
  if (!plain.startsWith("    ")) {
    return false;
  }
  const trimmed = plain.trim();
  if (!trimmed) {
    return true;
  }
  if (TOOL_OR_STEER_MARKER_PATTERN.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith("took ")) {
    return false;
  }
  return !LEDGER_HEADER_PATTERN.test(trimmed);
}

/**
 * quiet-tools already restores mid-turn Markdown as the assistant body.
 * Drop display-intent's in-progress › pin (wrapped continuations included, and the
 * full-width padded separator rows Markdown rendering leaves behind) from the Tools
 * ledger so the same prose is not shown twice — nor as a stray blank gap.
 *
 * Ctrl+O framed rows (`│ ›` / `└`) stay in the expanded timeline.
 * Collapsed pins that copied assistant markdown (`› │ …`) are still dropped.
 */
export function omitCollapsedLedgerNarration(lines: readonly string[]): string[] {
  if (!looksLikeAggregateLedger(lines)) {
    return [...lines];
  }

  const next: string[] = [];
  let skipContinuations = false;
  for (const line of lines) {
    if (isCollapsedNarrationStart(line)) {
      skipContinuations = true;
      continue;
    }
    if (skipContinuations && isCollapsedNarrationContinuation(line)) {
      continue;
    }
    skipContinuations = false;
    next.push(line);
  }
  return next;
}
