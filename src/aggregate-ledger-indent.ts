import { truncateToWidth } from "@earendil-works/pi-tui";
import { stripTerminalSequences } from "./terminal-text.js";

/**
 * Tools 账本轨道行的左缘缩进。
 *
 * 动机：Pi 的正文（`AssistantMessageComponent`）左缘由 `outputPad` 顶开 1 列，
 * 而 display-intent 的 Tools 标题是**零缩进**画的，于是标题比正文更靠左一列。
 * 这里把账本/轨道行右移 1 列，让标题与正文左缘齐平；块内层级
 * （标题 0 / 统计 2 / 行条目 2）的相对关系不变，只是整体平移。
 *
 * 三条设计约束：
 *
 * 1. **逐行分类**，而不是「先认出账本块再整块平移」。Ctrl+O 展开态下同一个渲染块里
 *    会同时出现账本行和恢复出来的助手正文（`appendRecoveredNarration(painted, narration)`），
 *    整块平移会把正文一起顶歪。唯一的例外是展开态 steer —— 它整块都是纯轨道（见下）。
 * 2. **幂等**：只在「基准缩进」上平移（表头 0 → 1，内容行 2 → 3）。原型上的包装器跨
 *    `/reload` 存活，重复套用时不能出现 `   ✓ Tools ...` 这种二次缩进。
 * 3. **不动非账本行**：replace / insert 的截短 rail diff 与账本共用同一条 render 原型，
 *    必须原样放过。
 *
 * 注意：缩进值是**常量 1**，对齐的是 `outputPad` 的默认值 `1`
 * （`settingsManager.getOutputPad()` = `outputPad === 0 ? 0 : 1`）。
 * glue 不该去读 Pi 的 settings，所以这里不跟随用户把 outputPad 设成 0 的情况。
 */
const LEDGER_INDENT = " ";

/** 基准缩进：表头在 display-intent 里画在 col 0，内容行固定 2 空格。 */
const HEADER_BASE_INDENT = 0;
const LEDGER_ROW_BASE_INDENT = 2;

/**
 * 账本行的两类判据。
 *
 * 1. **表头** `✓ Tools (N calls ...`：收紧到行首状态标记，避免工具输出里恰好含
 *    这串文本（例如 bash 回显一份测试用例）时被整段顶歪。标记集与上游一致：
 *    `!` 失败 / `◐` 进行中 / `✓` 完成。
 * 2. **内容行**：固定 2 空格 + 上游专属前缀，对应 `aggregate-activity.ts` 里的画法 ——
 *    `took `（stats）/ `[✓◐!] `（逐条状态）/ `↳ `（折叠插话钉）/ `… N more active`
 *    （活跃溢出）/ `[│└] [✓◐!↳…]`（Ctrl+O 展开态框线工具行）。
 *
 * 内容行分两档收紧：
 * - **框线行**形态独特（`└ ✓` 这种组合几乎只出现在展开态账本），可独立认；
 * - **裸内容行**前缀太常见（vitest 打印 `  ✓ test name`、脚本回显 `  ! warning`），
 *   必须与表头**同块**才平移，否则普通工具输出会被顶歪。
 *
 * 为什么要独立认框线行：展开态下账本被拆到多个组件上 —— 表头只跟着「帧内第一个可见项」
 * 走，其余工具行各自成组件、不带任何表头。只缩带表头的那块会让展开后框线参差。
 *
 * 两个宿主都在缩进**之前**先跑 `omitCollapsedLedgerNarration`，所以折叠态的助手旁白钉
 * （`  › 正文`）不会到达这里 —— 正文由 `recoverSwallowedNarration` 作为助手正文重建。
 * 普通引用块 `│ 正文` 则因缺少 marker 而不会被误缩。
 */
const LEDGER_HEADER_PATTERN = /^[✓◐!]\s+Tools\s*\(\s*\d+\s+calls?/;
const LEDGER_FRAMED_ROW_PATTERN = /^ {2}[│└] [✓◐!↳…]/;
const LEDGER_CONTENT_ROW_PATTERNS: readonly RegExp[] = [
  /^ {2}took /,
  /^ {2}[✓◐!] /,
  /^ {2}↳ /,
  /^ {2}… \d+ more active/,
];

/**
 * 展开态 steer（用户插话）块：由 display-intent 的 `UserMessageComponent` 补丁渲染，
 * 形态是**整块纯轨道** —— `  │ ` / `  │ ↳ 正文` / `  │ 续行` / `  └ `。
 *
 * 为什么单独一条规则：续行与首尾框线都没有工具 marker，逐行规则只能认到带 marker 的
 * 那一行，会把这块撕成参差（框线一半在 col 3、一半在 col 2）。
 *
 * 判据要求**所有非空行都是 2 空格轨道**且**至少一行含 `↳`** —— 两者同时满足时几乎不可能
 * 撞上别的渲染：普通用户消息的边框 `│` 在 col 0，Markdown 引用块没有 `↳`，
 * 展开态工具行的块里混着表头与统计行（不是纯轨道）。
 */
const STEER_RAIL_ROW_PATTERN = /^ {2}[│└]/;
const STEER_RAIL_MARK_PATTERN = /^ {2}[│└] ↳ /;

function isPureSteerRailBlock(plainLines: readonly string[]): boolean {
  let hasSteer = false;
  let hasRail = false;
  for (const plain of plainLines) {
    if (plain.trim().length === 0) {
      continue;
    }
    if (!STEER_RAIL_ROW_PATTERN.test(plain)) {
      return false;
    }
    hasRail = true;
    if (STEER_RAIL_MARK_PATTERN.test(plain)) {
      hasSteer = true;
    }
  }
  return hasRail && hasSteer;
}

function leadingSpaces(line: string): number {
  const match = /^( *)/.exec(line);
  return match ? match[1]!.length : 0;
}

/**
 * 该行是否需要平移。只接受「恰好处于基准缩进」的行，
 * 因此对已平移过的行返回 false —— 重复调用不会二次缩进。
 *
 * `hasHeader` 来自同一个渲染块：裸内容行必须与表头同块才算账本行。
 */
function shouldShift(plain: string, hasHeader: boolean): boolean {
  if (plain.length === 0) {
    return false;
  }
  const indent = leadingSpaces(plain);
  if (indent === HEADER_BASE_INDENT) {
    return LEDGER_HEADER_PATTERN.test(plain);
  }
  if (indent !== LEDGER_ROW_BASE_INDENT) {
    return false;
  }
  if (LEDGER_FRAMED_ROW_PATTERN.test(plain)) {
    return true;
  }
  return (
    hasHeader &&
    LEDGER_CONTENT_ROW_PATTERNS.some((pattern) => pattern.test(plain))
  );
}

/**
 * 把账本/轨道行右移 `LEDGER_INDENT`，并按 `width` 重新截断。
 *
 * 为什么要重新截断：display-intent 已经把每行截到 `width`，右移 1 列后会超宽。
 * 空行与非账本行原样返回 —— 空行加尾随空格会污染下游的「空行」判定
 * （分隔间隔、尾随间隔都依赖 `visibleText(line) === ""`）。
 */
export function indentAggregateLedger(
  lines: readonly string[],
  width: number,
): string[] {
  if (lines.length === 0) {
    return [...lines];
  }

  const safeWidth =
    Number.isFinite(width) && width > 0 ? Math.floor(width) : undefined;
  const shift = (line: string): string => {
    const shifted = `${LEDGER_INDENT}${line}`;
    return safeWidth === undefined
      ? shifted
      : truncateToWidth(shifted, safeWidth, "…");
  };
  const plainLines = lines.map((line) => stripTerminalSequences(line));

  // 展开态 steer 整块纯轨道，续行没有 marker，只能整块平移。
  if (isPureSteerRailBlock(plainLines)) {
    return lines.map((line) =>
      line.trim().length === 0 ? line : shift(line),
    );
  }

  // 裸内容行只有与表头同块才算账本行：`  ✓ test name` 这种 vitest 输出很常见。
  const hasHeader = plainLines.some((plain) =>
    LEDGER_HEADER_PATTERN.test(plain),
  );

  return lines.map((line, index) => {
    const plain = plainLines[index] ?? "";
    if (line.trim().length === 0 || !shouldShift(plain, hasHeader)) {
      return line;
    }
    return shift(line);
  });
}
