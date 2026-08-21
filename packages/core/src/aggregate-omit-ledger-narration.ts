import { looksLikeAggregateLedger } from "./aggregate-silent-ledger.js";
import { stripTerminalSequences as stripRenderSequences } from "./terminal-text.js";

const COLLAPSED_NARRATION_MARK = "›";
const FRAME_EDGE_PATTERN = /[│└]/;
const TOOL_OR_STEER_MARKER_PATTERN = /^[✓◐!↳…]/;
const LEDGER_HEADER_PATTERN = /^Tools\s*\(\s*\d+\s+calls?/;

function isCollapsedNarrationStart(line: string): boolean {
  const plain = stripRenderSequences(line);
  if (FRAME_EDGE_PATTERN.test(plain)) {
    return false;
  }
  return plain.trimStart().startsWith(`${COLLAPSED_NARRATION_MARK} `);
}

function isCollapsedNarrationContinuation(line: string): boolean {
  const plain = stripRenderSequences(line);
  if (!plain.startsWith("    ")) {
    return false;
  }
  if (FRAME_EDGE_PATTERN.test(plain)) {
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
