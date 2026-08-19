export const SILENT_AGGREGATE_TOOLS = new Set([
  "read",
  "replace",
  "undo_last_replace",
]);

const OSC_SEQUENCE_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ANSI_SEQUENCE_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;
const LEDGER_HEADER_PATTERN = /Tools\s*\(\s*\d+\s+calls?/;

export function visibleToolLine(line: string): string {
  return line
    .replace(OSC_SEQUENCE_PATTERN, "")
    .replace(ANSI_SEQUENCE_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldSilenceAggregateTool(toolName: string): boolean {
  return SILENT_AGGREGATE_TOOLS.has(toolName);
}

export function looksLikeAggregateLedger(lines: readonly string[]): boolean {
  return lines.some((line) => LEDGER_HEADER_PATTERN.test(visibleToolLine(line)));
}

/**
 * Silent tools hide per-call rows, but the aggregate ledger is painted by the
 * group leader. If that leader is `read` / `replace` / `undo_last_replace`,
 * swallowing the whole render also swallows `✓ Tools (...)`.
 */
export function resolveSilentAggregateLines(
  toolName: string,
  lines: readonly string[],
): string[] {
  if (!shouldSilenceAggregateTool(toolName)) {
    return [...lines];
  }
  if (looksLikeAggregateLedger(lines)) {
    return [...lines];
  }
  return [];
}
