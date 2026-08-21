import { visibleTerminalText } from "./terminal-text.js";

export const SILENT_AGGREGATE_TOOLS = new Set([
  "read",
  "replace",
  "undo_last_replace",
]);

const LEDGER_HEADER_PATTERN = /Tools\s*\(\s*\d+\s+calls?/;

export function visibleToolLine(line: string): string {
  return visibleTerminalText(line);
}

export function shouldSilenceAggregateTool(toolName: string): boolean {
  return SILENT_AGGREGATE_TOOLS.has(toolName);
}

export function looksLikeAggregateLedger(lines: readonly string[]): boolean {
  return lines.some((line) => LEDGER_HEADER_PATTERN.test(visibleToolLine(line)));
}

function isSilentAggregateDisplayRow(line: string): boolean {
  const visible = visibleToolLine(line);
  if (/^[│└]/.test(visible)) {
    return false;
  }
  const match = /^[✓◐!]\s+(\S+)/.exec(visible);
  const token = match?.[1];
  if (!token || token === "Tools") {
    return false;
  }
  const label = token.replace(/\(.*$/, "");
  return label === "Read" || shouldSilenceAggregateTool(label);
}

export interface SilentAggregateOptions {
  expanded?: boolean;
}

/**
 * Silent tools hide per-call rows, but the aggregate ledger is painted by the
 * group leader. If that leader is `read` / `replace` / `undo_last_replace`,
 * swallowing the whole render also swallows `✓ Tools (...)`.
 *
 * While a phase is still open, display-intent also pins up to three retained
 * done rows *inside* the leader's ledger. Those rows must be stripped even
 * when bash / write hosts the header.
 *
 * Ctrl+O leaves the collapsed ledger and paints one framed summary per call.
 * Those expanded rows must stay visible.
 */
export function resolveSilentAggregateLines(
  toolName: string,
  lines: readonly string[],
  options: SilentAggregateOptions = {},
): string[] {
  if (options.expanded === true) {
    return [...lines];
  }
  if (looksLikeAggregateLedger(lines)) {
    return lines.filter((line) => !isSilentAggregateDisplayRow(line));
  }
  if (!shouldSilenceAggregateTool(toolName)) {
    return [...lines];
  }
  return [];
}
