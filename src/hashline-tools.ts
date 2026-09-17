/**
 * Hashline 工具名的唯一事实来源。
 *
 * 为什么单独成模块：这些名字原本在 4 个文件里各写了一遍
 * （静默集合、passthrough 迁移、重复加载检测、极简 UI 名单），
 * 上游一改工具名就要四处找、四处改，还容易漏。集中到这里之后，
 * 上游改名只需动这一个文件。
 *
 * 名字随上游演进：
 * - 2.6.x 及更早：read / replace / undo_last_replace
 * - 2.7.0 起：undo_last_replace 改名为 undo_last_change，并新增 insert、anchor_grep
 * - 3.0.0 起：锚点从 3 字符变成 4 字符（只影响 read 输出形态，glue 不解析锚点宽度）
 *
 * 显示分层（同一份名单，两种终端待遇）：
 * - 静默：read / 搜索 / 撤销 —— 只进 Tools 账本计数
 * - 可见编辑：replace / insert —— 透传，画截短 diff
 * 新工具名必须归入其中一类，contract 测试会卡住未分类的名字。
 */

/** 当前 pi-hashline-edit-pro 注册的工具。 */
export const HASHLINE_TOOLS = [
  "read",
  "replace",
  "insert",
  "undo_last_change",
  "anchor_grep",
] as const;

/**
 * 已被上游改名淘汰、但旧配置里可能仍然存在的名字。
 *
 * 与当前名字的区别很关键：
 * - 运行时匹配（静默集合、极简 UI、重复加载检测）理论上只需要当前名字；
 * - 配置清理必须同时处理旧名字，否则用户升级前写进 `tools.passthrough`
 *   的 `undo_last_replace` 会永远留在配置里。
 *
 * 运行时集合也把旧名字一并纳入：成本为零，却能在用户同时也装了旧版
 * hashline（或 Pi 仍在用旧注册）时继续生效，不会突然漏出一堆逐条行。
 */
export const LEGACY_HASHLINE_TOOLS = ["undo_last_replace"] as const;

/** 运行时/配置匹配用的合并集合：当前名字 + 已被淘汰的名字。 */
export const HASHLINE_TOOL_NAME_SET: ReadonlySet<string> = new Set<string>([
  ...HASHLINE_TOOLS,
  ...LEGACY_HASHLINE_TOOLS,
]);

/**
 * 终端要看见变更正文的编辑工具。
 *
 * 它们走 passthrough + 截短 renderer：账本仍计数，但折叠态画出 6 行 +/-。
 * 不进这个名单的 hashline 工具保持静默。
 */
export const HASHLINE_VISIBLE_EDIT_TOOLS = ["replace", "insert"] as const;

export const HASHLINE_VISIBLE_EDIT_TOOL_NAME_SET: ReadonlySet<string> =
  new Set<string>(HASHLINE_VISIBLE_EDIT_TOOLS);

/**
 * 只留账本计数的 hashline 工具（当前名）。
 *
 * 读、搜索、撤销的正文和编辑不是同一类信号：读是过程，编辑是结果。
 */
export const HASHLINE_SILENT_TOOLS = [
  "read",
  "undo_last_change",
  "anchor_grep",
] as const;

/** 静默匹配：当前静默名 + 已淘汰名。撤销的旧名字仍按静默处理。 */
export const HASHLINE_SILENT_TOOL_NAME_SET: ReadonlySet<string> = new Set<string>([
  ...HASHLINE_SILENT_TOOLS,
  ...LEGACY_HASHLINE_TOOLS,
]);
