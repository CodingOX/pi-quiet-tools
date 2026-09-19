import assert from "node:assert/strict";
import { test } from "node:test";
import { omitCollapsedLedgerNarration } from "./aggregate-omit-ledger-narration.ts";

test("drops the collapsed › pin and wrapped continuation from an in-progress Tools ledger", () => {
  const lines = [
    "✓ Tools (3 calls · 3 turns) · todowrite ×1 · replace ×1 · read ×1",
    "  › 图会放在“端到端流程”开头，采用前端可直接阅读的 Mermaid 时序图：左侧明确 IN_APP",
    "    和 PC_QR 只在进入企业微信授权页时分支，随后汇合到同一 callback、ticket 兑换和页",
    "    面跳转。不会改 OpenAPI 或 REST 合同。",
  ];

  assert.deepEqual(omitCollapsedLedgerNarration(lines), [
    "✓ Tools (3 calls · 3 turns) · todowrite ×1 · replace ×1 · read ×1",
  ]);
});

test("drops a collapsed › pin even when assistant markdown already has │", () => {
  const lines = [
    "! Tools (22 calls · 13 turns) · 2m31s · 1 failed · bash ×22",
    "  › │ 🎯 收到。在给你指引前，我必须先验证一个决定性的前提——那 3 个我没改的模板，classpath",
    "    │ 版本和线上已发布版本是否真的一致。如果不一致，说明它们也需要同步（那你的判断就是对的",
    "    │ ）。",
    "  ✓ Bash(python3 - <<'PY' import json)",
  ];

  assert.deepEqual(omitCollapsedLedgerNarration(lines), [
    "! Tools (22 calls · 13 turns) · 2m31s · 1 failed · bash ×22",
    "  ✓ Bash(python3 - <<'PY' import json)",
  ]);
});

test("keeps receipt, steer, and tool rows on a Tools ledger", () => {
  const lines = [
    "◐ Tools (16 calls · 3 turns) · bash ×1",
    "  ↳ 先改测试",
    "  › 先对照两边入口",
    "  ◐ Bash(pnpm test)",
  ];

  assert.deepEqual(omitCollapsedLedgerNarration(lines), [
    "◐ Tools (16 calls · 3 turns) · bash ×1",
    "  ↳ 先改测试",
    "  ◐ Bash(pnpm test)",
  ]);
});

test("drops an ANSI-colored collapsed › pin", () => {
  const lines = [
    "✓ Tools (1 call · 1 turn) · read ×1",
    "  \x1b[2m›\x1b[0m 先定位两边的设计与实现入口",
  ];

  assert.deepEqual(omitCollapsedLedgerNarration(lines), [
    "✓ Tools (1 call · 1 turn) · read ×1",
  ]);
});

test("keeps Ctrl+O framed narration on the expanded timeline", () => {
  const lines = [
    "✓ Tools (3 calls · 2 turns) · read ×1 · bash ×1",
    "  took 2m14s · tok ↑62k ↓8.4k · at 2026-04-08 14:32:14",
    "  │ › 先定位两边的设计与实现入口，再对照分组、渲染和边界。",
    "  │ ✓ Read(src/index.ts)",
    "  └ ✓ Bash(pnpm test)",
  ];

  assert.deepEqual(omitCollapsedLedgerNarration(lines), lines);
});

test("leaves non-ledger output untouched", () => {
  const lines = ["  › 这不是 Tools 账本"];
  assert.deepEqual(omitCollapsedLedgerNarration(lines), lines);
});

test("drops an OSC-colored collapsed pin without affecting framed timeline rows", () => {
  const lines = [
    "✓ Tools (1 call · 1 turn) · read ×1",
    "  \x1b]0;quiet\x07\x1b[2m›\x1b[0m 正在读取配置",
    "  │ ✓ Read(config.json)",
  ];

  assert.deepEqual(omitCollapsedLedgerNarration(lines), [
    "✓ Tools (1 call · 1 turn) · read ×1",
    "  │ ✓ Read(config.json)",
  ]);
});

/**
 * 回归：display-intent 的 Markdown 渲染把每行补齐到整行宽度，旁白的段落分隔行是
 * `    ` + 一整行空格（`trim()` 后为空但不是空串）。漏掉它会留下「表头与首个工具行
 * 之间凭空一行空白」的宽间距，并中断跳过链。形态取自 sage-flow 会话 11 calls 账本的真实折叠钉。
 */
test("drops a full-width padded separator row inside a wrapped collapsed pin", () => {
  const padded = " ".repeat(56);
  const lines = [
    "✓ Tools (11 calls · 6 turns) · 31s · bash ×6 · read ×5",
    `  › 理解了 ✅。先跟你对齐一下我的理解和接下来要干的事，然后我${padded}`,
    `    直接开始只读排查（不动数据、不改文件）。${padded}`,
    // 段落分隔行：Markdown 把续行前缀与内容一起补齐成整行空白，trim() 后为空。
    "    " + padded,
    "  ✓ Read(~/code-all/bus/sage-flow-all/sage-flow-server/scripts/e2e/three_expense/mock_admin.py)",
    "  ✓ Bash(cd /Users/alistar/code-all/bus/sage-flow-all && ls -la hjw-qywxgnsj/前端/)",
  ];

  assert.deepEqual(omitCollapsedLedgerNarration(lines), [
    "✓ Tools (11 calls · 6 turns) · 31s · bash ×6 · read ×5",
    "  ✓ Read(~/code-all/bus/sage-flow-all/sage-flow-server/scripts/e2e/three_expense/mock_admin.py)",
    "  ✓ Bash(cd /Users/alistar/code-all/bus/sage-flow-all && ls -la hjw-qywxgnsj/前端/)",
  ]);
});

/**
 * 回归：宽终端（≥100 列）下首段不折行，填充空行后面还跟着旁白的下一段。
 * 跳过链若被空行中断，`我的理解` 会作为残留正文漏进账本。
 */
test("drops the paragraph that follows a padded separator row in a collapsed pin", () => {
  const padded = " ".repeat(56);
  const lines = [
    "✓ Tools (3 calls · 1 turn) · bash ×2 · read ×1",
    `  › 理解了 ✅。先跟你对齐一下我的理解和接下来要干的事。${padded}`,
    "    " + padded,
    `    我的理解${padded}`,
    "  ✓ Bash(ls -la)",
  ];

  assert.deepEqual(omitCollapsedLedgerNarration(lines), [
    "✓ Tools (3 calls · 1 turn) · bash ×2 · read ×1",
    "  ✓ Bash(ls -la)",
  ]);
});

/**
 * 反向保护：账本自带的首尾间隔空行、以及**不跟在旁白钉后面**的缩进空行都要原样保留。
 * 账本首尾间隔由 `padAggregateBlock` 提供，是正文与账本之间的正常呼吸位。
 */
test("keeps ledger edge separators and indented blanks that do not follow a pin", () => {
  const ledger = [
    "",
    "✓ Tools (2 calls · 1 turn) · read ×2",
    "  ✓ Read(a.ts)",
    "  ✓ Read(b.ts)",
    "",
  ];
  assert.deepEqual(omitCollapsedLedgerNarration(ledger), ledger);

  // 工具输出里自带的缩进空行（前一行是工具行而非 › 钉）不能被误吞。
  const toolOutput = [
    "✓ Tools (1 call · 1 turn) · bash ×1",
    "  ✓ Bash(printf '    \\n')",
    "        ",
  ];
  assert.deepEqual(omitCollapsedLedgerNarration(toolOutput), toolOutput);
});
