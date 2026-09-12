import { HASHLINE_TOOL_NAME_SET } from "./hashline-tools.js";
import { visibleTerminalText } from "./terminal-text.js";

/**
 * 静默工具集合。名字来自 hashline-tools.ts 这一唯一事实来源，
 * 同时包含当前名字与被上游淘汰的旧名字（旧配置兼容）。
 */
export const SILENT_AGGREGATE_TOOLS = HASHLINE_TOOL_NAME_SET;

const LEDGER_HEADER_PATTERN = /Tools\s*\(\s*\d+\s+calls?/;

export function visibleToolLine(line: string): string {
  return visibleTerminalText(line);
}

export function shouldSilenceAggregateTool(toolName: string): boolean {
  return SILENT_AGGREGATE_TOOLS.has(toolName);
}

export function looksLikeAggregateLedger(lines: readonly string[]): boolean {
  return lines.some((line) =>
    LEDGER_HEADER_PATTERN.test(visibleToolLine(line)),
  );
}

export interface SilentAggregateOptions {
  expanded?: boolean;
}

/**
 * 静默工具的逐条 hashline 渲染要吞掉，否则会和 Tools 账本叠在一起。
 * 折叠账本本身由上游画 Open rows（最多 3 行），glue 原样透传，不再剥静默完成行、
 * 也不把静默 live 裁成 1 条。Ctrl+O 展开后的逐条概要必须可见。
 */
export function resolveSilentAggregateLines(
  toolName: string,
  lines: readonly string[],
  options: SilentAggregateOptions = {},
): string[] {
  if (options.expanded === true) {
    return [...lines];
  }
  // 折叠账本：3 行窗口归上游，quiet 让路
  if (looksLikeAggregateLedger(lines)) {
    return [...lines];
  }
  if (!shouldSilenceAggregateTool(toolName)) {
    return [...lines];
  }
  return [];
}
