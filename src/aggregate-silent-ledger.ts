import { HASHLINE_SILENT_TOOL_NAME_SET } from "./hashline-tools.js";
import { visibleTerminalText } from "./terminal-text.js";

/**
 * 静默判定直接用 hashline-tools 的集合。
 *
 * 只含读 / 搜索 / 撤销（含旧名）。replace / insert 是可见编辑，不能进这里，
 * 否则截短 diff 会被聚合补丁当成逐条静默行吞掉。
 */
const LEDGER_HEADER_PATTERN = /Tools\s*\(\s*\d+\s+calls?/;

export function looksLikeAggregateLedger(lines: readonly string[]): boolean {
 return lines.some((line) =>
  LEDGER_HEADER_PATTERN.test(visibleTerminalText(line)),
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
 if (!HASHLINE_SILENT_TOOL_NAME_SET.has(toolName)) {
  return [...lines];
 }
 return [];
}
