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
	const lines = [
		"\x1b[32m✓\x1b[0m \x1b[1mTools\x1b[0m (3 calls · 1 turn) · read ×3",
	];
	assert.deepEqual(resolveSilentAggregateLines("read", lines), lines);
});

test("passes through ANSI-colored silent retained rows on a Tools ledger", () => {
	const lines = [
		"\x1b[32m✓\x1b[0m Tools (2 calls · 1 turn) · replace ×2",
		"  \x1b[32m✓\x1b[0m \x1b[36mreplace\x1b[0m",
	];
	assert.deepEqual(resolveSilentAggregateLines("replace", lines), lines);
});

test("drops a silent per-call row", () => {
	assert.deepEqual(
		resolveSilentAggregateLines("read", ["✓ read README.md"]),
		[],
	);
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

test("passes through retained silent rows on a replace-led Tools ledger", () => {
	const lines = [
		"✓ Tools (4 calls · 2 turns) · replace ×4",
		"  ✓ replace",
		"  ✓ replace",
		"  ✓ replace",
	];
	assert.deepEqual(resolveSilentAggregateLines("replace", lines), lines);
});

test("passes through silent retained rows when a non-silent tool hosts the ledger", () => {
	const lines = [
		"◐ Tools (5 calls · 1 turn) · bash ×1 · replace ×3 · read ×1",
		"  ✓ replace",
		"  ✓ Read(src/a.ts)",
		"  ◐ Bash(pnpm test)",
	];
	assert.deepEqual(resolveSilentAggregateLines("bash", lines), lines);
});

test("leaves non-silent tool output untouched", () => {
	const lines = ["◐ bash ls"];
	assert.deepEqual(resolveSilentAggregateLines("bash", lines), lines);
});

test("recognizes a Tools ledger through OSC and ANSI sequences", () => {
	const lines = [
		"\x1b]0;quiet\x07\x1b[2m✓ Tools (1 call · 1 turn) · read ×1\x1b[0m",
	];

	assert.deepEqual(resolveSilentAggregateLines("read", lines), lines);
});

test("keeps a live silent row when the leader is a silent read", () => {
	const lines = ["◐ Tools (2 calls · 1 turn) · read ×2", "  ◐ Read(src/a.ts)"];

	assert.deepEqual(resolveSilentAggregateLines("read", lines), lines);
});

test("passes through completed silent rows beside non-silent live rows", () => {
	const lines = [
		"◐ Tools (3 calls · 1 turn) · read ×2 · bash ×1",
		"  ✓ Read(src/a.ts)",
		"  ◐ Bash(pnpm test)",
	];
	assert.deepEqual(resolveSilentAggregateLines("bash", lines), lines);
});

test("does not recap silent live rows on a collapsed ledger", () => {
	const lines = [
		"◐ Tools (3 calls · 1 turn) · read ×3",
		"  ◐ Read(a.ts)",
		"  ◐ Read(b.ts)",
		"  ◐ Read(c.ts)",
	];
	assert.deepEqual(resolveSilentAggregateLines("read", lines), lines);
});

test("passes through mixed silent done, silent live, and bash live rows", () => {
	const lines = [
		"◐ Tools (5 calls · 1 turn) · bash ×1 · replace ×3 · read ×1",
		"  ✓ replace",
		"  ◐ Read(src/a.ts)",
		"  ◐ Bash(pnpm test)",
	];
	assert.deepEqual(resolveSilentAggregateLines("bash", lines), lines);
});

test("keeps expanded live silent framed rows from Ctrl+O", () => {
	const lines = [
		"",
		"◐ Tools (2 calls · 1 turn) · read ×2",
		"  │ ◐ Read(src/a.ts)",
		"  └ ◐ Read(src/b.ts)",
	];

	assert.deepEqual(
		resolveSilentAggregateLines("read", lines, { expanded: true }),
		lines,
	);
});

test("keeps an ANSI-colored live silent Read row", () => {
	const lines = [
		"\x1b[33m◐\x1b[0m Tools (2 calls · 1 turn) · read ×2",
		"  \x1b[33m◐\x1b[0m \x1b[36mRead(src/a.ts)\x1b[0m",
	];

	assert.deepEqual(resolveSilentAggregateLines("read", lines), lines);
});

test("silences the remaining hashline tool names", () => {
	// 读、搜索、撤销仍只留账本计数。replace / insert 是可见编辑，不能静默。
	for (const toolName of ["read", "anchor_grep", "undo_last_change", "undo_last_replace"]) {
		assert.deepEqual(
			resolveSilentAggregateLines(toolName, [`✓ ${toolName} something`]),
			[],
			`${toolName} should be silenced outside a ledger`,
		);
	}
});

test("does not swallow replace or insert snippets outside a ledger", () => {
	for (const toolName of ["replace", "insert"]) {
		const lines = [`${toolName} a.ts  +1 -1`, "-old", "+new"];
		assert.deepEqual(
			resolveSilentAggregateLines(toolName, lines),
			lines,
			`${toolName} compact diff must remain visible`,
		);
	}
});

test("still silences the retired undo_last_replace name", () => {
	// 旧配置和被锁定的旧版本仍可能注册这个名字；识别不到就会漏出逐条行。
	assert.deepEqual(
		resolveSilentAggregateLines("undo_last_replace", ["✓ undo_last_replace"]),
		[],
	);
});

test("keeps an insert-led Tools ledger intact", () => {
	const lines = ["✓ Tools (3 calls · 1 turn) · insert ×3", "  ✓ insert"];

	assert.deepEqual(resolveSilentAggregateLines("insert", lines), lines);
});
