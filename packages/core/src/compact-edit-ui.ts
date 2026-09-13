import { basename, isAbsolute, relative } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { HASHLINE_VISIBLE_EDIT_TOOL_NAME_SET } from "./hashline-tools.js";
import { tryResolveEditTarget } from "pi-hashline-edit-pro/src/edit-common.ts";

/**
 * 折叠态最多画出的变更行数。
 *
 * 选 6 是 4～8 的中位：够看出改了什么，一轮多次编辑也不会刷成 diff 墙。
 * Ctrl+O 展开时走 hashline 原 renderer，不受这个上限约束。
 */
export const EDIT_PREVIEW_MAX_LINES = 6;

const DIFF_CONTENT_MAX_CHARS = 120;

const HASHLINE_DIFF_LINE = /^([+ -])(?:[A-Za-z0-9]{4}| {4})│(.*)$/;

const compactedTools = new WeakSet<object>();

export type CompactEditTheme = {
  fg: (color: string, text: string) => string;
  bold?: (text: string) => string;
};

type CompactRenderContext = {
  expanded?: boolean;
  isError?: boolean;
  args?: unknown;
  cwd?: string;
  state?: { resolvedPath?: string };
};

type CompactRenderOptions = {
  isPartial?: boolean;
  expanded?: boolean;
};
function paint(
  theme: CompactEditTheme | undefined,
  color: string,
  text: string,
): string {
  return theme?.fg ? theme.fg(color, text) : text;
}

function title(theme: CompactEditTheme | undefined, text: string): string {
  const bold = theme?.bold ? theme.bold(text) : text;
  return paint(theme, "toolTitle", bold);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/**
 * 标题只给人看：仓库相对路径，绝不把绝对目录甩到终端上。
 * 文件在 cwd 外时退回 basename，避免 `../` 或 `/Users/...`。
 */
function toDisplayPath(path: string, cwd?: string): string {
  if (!isAbsolute(path)) {
    return path.replace(/\\/g, "/").replace(/^\.\//, "");
  }
  if (typeof cwd === "string" && cwd.length > 0) {
    const rel = relative(cwd, path).replace(/\\/g, "/");
    if (rel.length > 0 && rel !== ".." && !rel.startsWith("../")) {
      return rel;
    }
  }
  return basename(path);
}

/**
 * 折叠态标题用的目标：path → 已解析路径 → 注册表反查 → 锚点范围 → 单锚点。
 *
 * hashline 默认不强制 path，insert 经常只有 anchor。只认 path 会变成 `insert ...`。
 * 有文件路径时显示相对路径，不再把锚点范围当标题。
 * 注册表反查是同步 Map.get，不碰磁盘；查不到再退回锚点给模型看的身份。
 */
function editTarget(
  args: unknown,
  context?: CompactRenderContext,
): string | undefined {
  const record = asRecord(args);
  const path = stringField(record, "path");
  if (path) {
    return toDisplayPath(path, context?.cwd);
  }
  const resolved = stringField(asRecord(context?.state), "resolvedPath");
  if (resolved) {
    return toDisplayPath(resolved, context?.cwd);
  }
  const from = stringField(record, "remove_from");
  const to = stringField(record, "remove_to");
  const anchor = stringField(record, "anchor");
  // 自己查 hashline 会话注册表，不赌原 renderCall 把 resolvedPath 写回来。
  // replace 执行后会释放旧锚点，标题还会再画一次，所以第一次查到就要写进 state。
  const owned =
    (from ? tryResolveEditTarget(from, to) : undefined) ??
    (anchor ? tryResolveEditTarget(anchor) : undefined);
  if (owned) {
    if (context?.state) {
      context.state.resolvedPath = owned;
    }
    return toDisplayPath(owned, context?.cwd);
  }
  if (from && to) {
    return `${from}→${to}`;
  }
  if (anchor) {
    return anchor;
  }
  return undefined;
}

function stringField(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function resultText(result: unknown): string | undefined {
  const content = asRecord(result)?.content;
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const entry of content) {
    const record = asRecord(entry);
    if (record?.type === "text" && typeof record.text === "string") {
      return record.text;
    }
  }
  return undefined;
}

function detailsOf(result: unknown): Record<string, unknown> | undefined {
  return asRecord(asRecord(result)?.details);
}

function metricsOf(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return asRecord(details?.metrics);
}

/**
 * 从 hashline / unified diff 里抽出 +/- 行，丢掉上下文、锚点和 dedup。
 *
 * 折叠态只需要「改了哪几行」。锚点是给模型用的，人眼看终端时是噪声。
 */
export function compactDiffLines(
  diff: string,
  maxLines: number = EDIT_PREVIEW_MAX_LINES,
): { shown: string[]; hidden: number } {
  const changes: string[] = [];
  for (const rawLine of diff.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.length === 0) {
      continue;
    }
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("@@") ||
      line.startsWith("dedup│")
    ) {
      continue;
    }
    const hashline = HASHLINE_DIFF_LINE.exec(line);
    const prefix =
      hashline?.[1] ??
      (line.startsWith("+") || line.startsWith("-") ? line[0] : undefined);
    const content = hashline ? hashline[2] : prefix ? line.slice(1) : undefined;
    if (prefix !== "+" && prefix !== "-") {
      continue;
    }
    if (content === undefined) {
      continue;
    }
    const clipped =
      content.length > DIFF_CONTENT_MAX_CHARS
        ? `${content.slice(0, DIFF_CONTENT_MAX_CHARS)}…`
        : content;
    changes.push(`${prefix}${clipped}`);
  }
  const shown = changes.slice(0, Math.max(0, maxLines));
  return { shown, hidden: Math.max(0, changes.length - shown.length) };
}

function compactStats(
  metrics: Record<string, unknown> | undefined,
  theme: CompactEditTheme | undefined,
): string {
  if (!metrics) {
    return "";
  }
  if (metrics.classification === "noop") {
    return paint(theme, "muted", "noop");
  }
  const added =
    typeof metrics.added_lines === "number" ? metrics.added_lines : undefined;
  const removed =
    typeof metrics.removed_lines === "number"
      ? metrics.removed_lines
      : undefined;
  if (added === undefined && removed === undefined) {
    return "";
  }
  const addedText = paint(theme, "success", `+${added ?? 0}`);
  const removedText = paint(theme, "error", `-${removed ?? 0}`);
  return `${addedText} ${removedText}`;
}

export function formatCompactEditCall(
  toolName: string,
  args: unknown,
  theme?: CompactEditTheme,
  context?: CompactRenderContext,
): string {
  const target = editTarget(args, context);
  const targetText = paint(
    theme,
    "accent",
    target ?? paint(theme, "toolOutput", "..."),
  );
  return `${title(theme, toolName)} ${targetText}`;
}

/**
 * 完成态结果末尾留一行空，让后面的助手正文跟 diff 分开。
 * 不要用 Text paddingY：那会把标题和 diff 也撕开。
 */
function withTrailingGap(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function formatCompactEditResult(
  toolName: string,
  args: unknown,
  result: unknown,
  options: CompactRenderOptions = {},
  theme?: CompactEditTheme,
  context?: CompactRenderContext,
): string {
  if (options.isPartial === true) {
    return paint(theme, "warning", "Editing...");
  }

  // 身份已经在 renderCall 那一行。结果只补统计和 diff，避免叠两行同名标题。
  void toolName;
  void args;
  const details = detailsOf(result);
  const metrics = metricsOf(details);
  const stats = compactStats(metrics, theme);

  const isError =
    context?.isError === true || asRecord(result)?.isError === true;
  if (isError) {
    const message = resultText(result)?.trim();
    return withTrailingGap(paint(theme, "error", message || "Edit failed."));
  }

  const diff = details && typeof details.diff === "string" ? details.diff : "";
  const { shown, hidden } =
    diff.length > 0 ? compactDiffLines(diff) : { shown: [], hidden: 0 };
  if (shown.length === 0) {
    return withTrailingGap(stats);
  }

  const colored = shown.map((line) => {
    if (line.startsWith("+")) {
      return paint(theme, "success", line);
    }
    if (line.startsWith("-")) {
      return paint(theme, "error", line);
    }
    return paint(theme, "dim", line);
  });
  if (hidden > 0) {
    colored.push(paint(theme, "muted", `... ${hidden} more`));
  }
  const body =
    stats.length > 0 ? `${stats}\n${colored.join("\n")}` : colored.join("\n");
  return withTrailingGap(body);
}

function textResult(content: string): Text {
  return new Text(content, 0, 0);
}

/**
 * 给 replace / insert 套上截短 renderer。
 *
 * 折叠态自己画标题和截短 diff；Ctrl+O 展开才把原 hashline renderer 还回去。
 * 文件名由 editTarget 直接查会话注册表，折叠态不再调用原 renderCall。
 * WeakSet 同时记下原对象和包装对象，避免 hook 注册后再被 getAllTools 回写套第二层。
 */
export function compactEditToolUi(tool: ToolDefinition): ToolDefinition {
  if (!HASHLINE_VISIBLE_EDIT_TOOL_NAME_SET.has(tool.name)) {
    return tool;
  }
  if (compactedTools.has(tool)) {
    return tool;
  }

  const originalCall = tool.renderCall;
  const originalResult = tool.renderResult;
  const wrapped = {
    ...tool,
    renderCall(
      args: unknown,
      theme: CompactEditTheme,
      context?: CompactRenderContext,
    ) {
      if (context?.expanded === true && originalCall) {
        return originalCall.call(
          tool,
          args as never,
          theme as never,
          context as never,
        );
      }
      return textResult(formatCompactEditCall(tool.name, args, theme, context));
    },
    renderResult(
      result: unknown,
      options: CompactRenderOptions,
      theme: CompactEditTheme,
      context?: CompactRenderContext,
    ) {
      if (
        (options?.expanded === true || context?.expanded === true) &&
        originalResult
      ) {
        return originalResult.call(
          tool,
          result as never,
          options as never,
          theme as never,
          context as never,
        );
      }
      return textResult(
        formatCompactEditResult(
          tool.name,
          context?.args,
          result,
          options,
          theme,
          context,
        ),
      );
    },
  } as ToolDefinition;
  compactedTools.add(wrapped);
  compactedTools.add(tool);
  return wrapped;
}
