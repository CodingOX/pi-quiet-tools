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

function isCollapsedNarrationContinuation(line: string): boolean {
  const plain = stripRenderSequences(line);
  if (!plain.startsWith("    ")) {
    return false;
  }
  const trimmed = plain.trim();
  if (!trimmed) {
    return false;
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
 * Drop display-intent's in-progress › pin (and wrapped continuations) from
 * the Tools ledger so the same prose is not shown twice.
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
