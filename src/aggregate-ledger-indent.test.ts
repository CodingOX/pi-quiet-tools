import { visibleWidth } from "@earendil-works/pi-tui";
import assert from "node:assert/strict";
import { test } from "node:test";
import { indentAggregateLedger } from "./aggregate-ledger-indent.ts";

/**
 * 左缘对齐：Pi 正文由 `outputPad` 顶开 1 列，Tools 标题原本零缩进。
 * 平移后标题与正文左缘齐平；块内层级（标题 0 / 其余 2）只是整体右移 1 列，
 * 相对关系不变。
 */
test("shifts a settled ledger so the title lines up with assistant prose", () => {
  const lines = [
    "",
    "✓ Tools (5 calls · 3 turns) · bash ×3",
    "  took 30s · tok ↑3.2k ↓6.1k R256k · at 2026-09-18 14:04",
    "  ✓ Bash(command)",
    "",
  ];
  assert.deepEqual(indentAggregateLedger(lines, 80), [
    "",
    " ✓ Tools (5 calls · 3 turns) · bash ×3",
    "   took 30s · tok ↑3.2k ↓6.1k R256k · at 2026-09-18 14:04",
    "   ✓ Bash(command)",
    "",
  ]);
});

/**
 * 空行必须保持空行 —— 加尾随空格会污染 `visibleText(line) === ""`
 * 这类空行判定（分隔间隔、尾随间隔都依赖它）。
 */
test("keeps blank rows blank instead of adding trailing spaces", () => {
  const lines = ["", "✓ Tools (1 call · 1 turn) · read ×1", ""];
  const out = indentAggregateLedger(lines, 80);
  assert.equal(out[0], "");
  assert.equal(out[2], "");
});

/**
 * 关键回归防线：replace / insert 的截短 rail diff 走 passthrough，
 * 与账本共用同一个 render 原型。它的 rail 是 `│ +8 -1`，
 * `+` 不在工具标记集里，必须原样放过，否则编辑 diff 会被顶歪。
 */
test("leaves a compact edit diff untouched", () => {
  const lines = ["  replace src/a.ts", "  │ +8 -1", "  │ +const x = 1;"];
  assert.deepEqual(indentAggregateLedger(lines, 80), lines);
});

test("leaves non-ledger tool output untouched", () => {
  const lines = ["◐ bash ls -la", "  total 24"];
  assert.deepEqual(indentAggregateLedger(lines, 80), lines);
});

/**
 * Ctrl+O 展开态：账本被拆到多个组件上，只有「帧内第一个可见项」带表头，
 * 其余工具行走各自的组件、不带任何表头。这些行必须靠 marker 认出来，
 * 否则展开后框线参差。
 */
test("shifts expanded framed rows that carry no Tools header", () => {
  const lines = ["  │ ◐ Read(src/a.ts)", "  └ ✓ Bash(pnpm test)"];
  assert.deepEqual(indentAggregateLedger(lines, 80), [
    "   │ ◐ Read(src/a.ts)",
    "   └ ✓ Bash(pnpm test)",
  ]);
});

/** 普通引用块（框线后无工具 marker）不是账本行，不能误缩。 */
test("does not shift plain framed rows without a tool marker", () => {
  const lines = ["  │ 这是引用块文本", "  └ 结尾"];
  assert.deepEqual(indentAggregateLedger(lines, 80), lines);
});

/**
 * 展开态会把账本行与恢复出来的助手正文拼进同一个渲染块
 * （`appendRecoveredNarration(painted, narration)`）。
 * 逐行判定必须只动账本行，正文一行都不能碰。
 */
test("shifts only the ledger rows inside a mixed expanded block", () => {
  const lines = [
    "",
    "✓ Tools (2 calls · 1 turn) · read ×2",
    "  └ ✓ Read(src/a.ts)",
    "",
    "这是我写在中间的一段正文，左缘由 outputPad 决定。",
    "- 列表项也不应该被顶歪",
    "",
  ];
  assert.deepEqual(indentAggregateLedger(lines, 80), [
    "",
    " ✓ Tools (2 calls · 1 turn) · read ×2",
    "   └ ✓ Read(src/a.ts)",
    "",
    "这是我写在中间的一段正文，左缘由 outputPad 决定。",
    "- 列表项也不应该被顶歪",
    "",
  ]);
});

/** 失败 / 进行中的表头同样要认出来（`!` / `◐`）。 */
test("shifts failed and running ledger headers", () => {
  const lines = [
    "! Tools (3 calls · 1 turn) · 1 failed · read ×1 · edit ×1",
    "◐ Tools (1 call · 1 turn) · read ×1",
  ];
  assert.deepEqual(indentAggregateLedger(lines, 80), [
    " ! Tools (3 calls · 1 turn) · 1 failed · read ×1 · edit ×1",
    " ◐ Tools (1 call · 1 turn) · read ×1",
  ]);
});

/**
 * 幂等性：包装器挂在原型上、跨 `/reload` 存活，可能在同一行上重复套用。
 * 只在「基准缩进」上平移，因此第二次调用必须原样返回。
 */
test("is idempotent so a surviving wrapper never double-indents", () => {
  const lines = [
    "",
    "✓ Tools (5 calls · 3 turns) · bash ×3",
    "  took 30s · tok ↑3.2k ↓6.1k R256k · at 2026-09-18 14:04",
    "  ✓ Bash(command)",
    "",
  ];
  const once = indentAggregateLedger(lines, 80);
  assert.deepEqual(indentAggregateLedger(once, 80), once);
});

/** 折叠插话钉与溢出计数也是账本行的一部分。 */
test("shifts collapsed steer pins and overflow counters beside a header", () => {
  const lines = [
    "✓ Tools (3 calls · 1 turn) · read ×3",
    "  ↳ 用户插话的一行",
    "  … 2 more active",
  ];
  assert.deepEqual(indentAggregateLedger(lines, 80), [
    " ✓ Tools (3 calls · 1 turn) · read ×3",
    "   ↳ 用户插话的一行",
    "   … 2 more active",
  ]);
});

/**
 * 裸内容行的前缀太常见：vitest / pytest 打印 `  ✓ test name`、脚本回显 `  ! warning`。
 * 没有表头的普通工具输出必须原样放过，否则真实用例列表会被整段顶歪。
 */
test("does not shift tool output that merely looks like ledger rows", () => {
  const lines = [
    "  ✓ renders the header",
    "  ! deprecated api",
    "  ◐ retrying once",
    "  took 1ms",
  ];
  assert.deepEqual(indentAggregateLedger(lines, 80), lines);
});

/**
 * 展开态 steer（用户插话）块由 `UserMessageComponent` 渲染，形态是整块纯轨道：
 * `  │ ` / `  │ ↳ 正文` / `  │ 续行` / `  └ `。续行与首尾框线都没有工具 marker，
 * 逐行规则会把这块撕成参差（一半 col 3、一半 col 2），因此必须整块平移。
 */
test("shifts an expanded steer rail block as a whole", () => {
  const lines = ["  │ ", "  │ ↳ 用户插话的第一行", "  │ 第二行还有一段", "  └ "];
  assert.deepEqual(indentAggregateLedger(lines, 80), [
    "   │ ",
    "   │ ↳ 用户插话的第一行",
    "   │ 第二行还有一段",
    "   └ ",
  ]);
});

/**
 * 纯轨道但**没有 `↳`** 的块不是 steer —— 例如 Markdown 引用块的续行，
 * 不能因为长得像就整块顶歪。
 */
test("does not shift a rail-only block without a steer mark", () => {
  const lines = ["  │ 引用块正文", "  │ 还有一行", "  └ "];
  assert.deepEqual(indentAggregateLedger(lines, 80), lines);
});

/** steer 块整块平移后，重复调用不能再动（幂等）。 */
test("steer block shifting is idempotent", () => {
  const lines = ["  │ ↳ 插话", "  │ 续行"];
  const once = indentAggregateLedger(lines, 80);
  assert.deepEqual(indentAggregateLedger(once, 80), once);
});

/**
 * 宽松匹配会把「工具输出里恰好包含 Tools (N calls」的普通文本顶歪。
 * 判据必须锚在行首标记上：缩进过的同一串文本不是表头。
 */
test("does not shift a bare Tools line that lacks the status marker", () => {
  const lines = ["Tools (3 calls · 1 turn) · read ×3"];
  assert.deepEqual(indentAggregateLedger(lines, 80), lines);
});

/** 带 ANSI 颜色的账本也要认出来并平移，且颜色码不能破坏。 */
test("shifts an ANSI-colored ledger and preserves its sequences", () => {
  const lines = [
    "\x1b[32m✓\x1b[0m \x1b[1mTools\x1b[0m (2 calls · 1 turn) · read ×2",
    "  \x1b[32m✓\x1b[0m \x1b[36mRead(src/a.ts)\x1b[0m",
    "\x1b[33m◐\x1b[0m Tools (1 call · 1 turn) · read ×1",
  ];
  const out = indentAggregateLedger(lines, 80);
  assert.equal(out[0]?.startsWith(" "), true);
  assert.match(out[0] ?? "", /\x1b\[32m✓\x1b\[0m/);
  assert.match(out[1] ?? "", /\x1b\[36mRead\(src\/a\.ts\)\x1b\[0m/);
  assert.match(out[2] ?? "", /^\s\x1b\[33m◐\x1b\[0m Tools/);
});

/**
 * 右移 1 列后必须重新截断：display-intent 已按 width 截过，
 * 不重截就会超宽挤出边框。
 */
test("re-truncates lines so the shifted block never exceeds width", () => {
  const width = 30;
  const lines = [
    "✓ Tools (5 calls · 3 turns) · bash ×3",
    "  took 30s · tok ↑3.2k ↓6.1k R256k · at 2026-09-18 14:04",
  ];
  for (const line of indentAggregateLedger(lines, width)) {
    assert.ok(
      visibleWidth(line) <= width,
      `expected <= ${width}, got ${visibleWidth(line)}: ${JSON.stringify(line)}`,
    );
  }
});

/** 非法宽度不能变成 NaN 或被截成空串，退化为「只平移、不重截」。 */
test("falls back to plain shifting when width is not usable", () => {
  const lines = ["✓ Tools (1 call · 1 turn) · read ×1"];
  assert.deepEqual(indentAggregateLedger(lines, 0), [
    " ✓ Tools (1 call · 1 turn) · read ×1",
  ]);
  assert.deepEqual(indentAggregateLedger(lines, Number.NaN), [
    " ✓ Tools (1 call · 1 turn) · read ×1",
  ]);
});

test("returns an empty list unchanged", () => {
  assert.deepEqual(indentAggregateLedger([], 80), []);
});
