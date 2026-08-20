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
