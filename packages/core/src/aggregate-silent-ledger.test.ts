import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSilentAggregateLines } from "./aggregate-silent-ledger.ts";

test("keeps the Tools ledger when the leader is a silent read", () => {
  const lines = [
    "",
    "✓ Tools (6 calls · 2 turns) · read ×6",
    "  took 12s · tok ↑8k ↓400 · at 2026-08-19 15:40:01",
    "",
  ];
  assert.deepEqual(resolveSilentAggregateLines("read", lines), lines);
});

test("keeps an ANSI-colored Tools ledger", () => {
  const lines = ["\x1b[32m✓\x1b[0m \x1b[1mTools\x1b[0m (3 calls · 1 turn) · read ×3"];
  assert.deepEqual(resolveSilentAggregateLines("read", lines), lines);
});

test("drops a silent per-call row", () => {
  assert.deepEqual(resolveSilentAggregateLines("read", ["✓ read README.md"]), []);
});

test("keeps expanded silent one-line rows from Ctrl+O", () => {
  const lines = ["  └ ✓ Read(README.md)"];
  assert.deepEqual(
    resolveSilentAggregateLines("read", lines, { expanded: true }),
    lines,
  );
});

test("keeps an expanded silent host that still paints the Tools header", () => {
  const lines = [
    "",
    "✓ Tools (2 calls · 1 turn) · read ×2",
    "  └ ✓ Read(src/a.ts)",
  ];
  assert.deepEqual(
    resolveSilentAggregateLines("read", lines, { expanded: true }),
    lines,
  );
});

test("leaves non-silent tool output untouched", () => {
  const lines = ["◐ bash ls"];
  assert.deepEqual(resolveSilentAggregateLines("bash", lines), lines);
});
