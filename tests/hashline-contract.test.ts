import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import hashlineExtension from "pi-hashline-edit-pro";
import toolDisplayIntentExtension from "@zhcsyncer/pi-tool-display-intent";
import {
  HASHLINE_TOOLS,
  HASHLINE_TOOL_NAME_SET,
  HASHLINE_SILENT_TOOL_NAME_SET,
  HASHLINE_SILENT_TOOLS,
  HASHLINE_VISIBLE_EDIT_TOOL_NAME_SET,
  HASHLINE_VISIBLE_EDIT_TOOLS,
} from "../src/hashline-tools.js";

test("hashline registers exactly the tool names glue knows about", () => {
  const registered: string[] = [];
  const pi = {
    registerTool: (tool: { name: string }) => {
      registered.push(tool.name);
    },
    on: () => {},
    registerCommand: () => {},
    getActiveTools: () => [],
    setActiveTools: () => {},
    getAllTools: () => [],
  };
  hashlineExtension(pi as never);
  assert.deepEqual([...registered].sort(), [...HASHLINE_TOOLS].sort());
});

/**
 * 每个 prompt 文件的引用都必须能解析。
 *
 * 上游在 2.7.0 把 undo-last-replace.md 改名为 undo-last-change.md（并删掉了旧文件）。
 * 若 Pi 在旧版本时已启动，进程级的 jiti 解析缓存仍指向旧路径，加载会直接抛：
 *
 *   Failed to load extension: ENOENT: no such file or directory, open
 *   '.../pi-hashline-edit-pro/prompts/undo-last-replace.md'
 *
 * 解法是重启 Pi，不是 /reload。这条测试把「所有 prompt 引用都能读到」
 * 变成硬约束：源码与 prompts 目录不一致就会变红，而不是等到加载时才炸。
 */
test("every hashline prompt reference resolves on disk", () => {
  const packageRoot = dirname(
    createRequire(import.meta.url).resolve("pi-hashline-edit-pro/package.json"),
  );
  const srcDir = join(packageRoot, "src");
  const missing: string[] = [];
  let total = 0;

  for (const entry of readdirSync(srcDir)) {
    if (!entry.endsWith(".ts")) continue;
    const text = readFileSync(join(srcDir, entry), "utf8");
    for (const match of text.matchAll(/load(?:P|Guide)\("([^"]+)"\)/g)) {
      total += 1;
      if (!existsSync(resolve(srcDir, match[1]))) {
        missing.push(`${entry} -> ${match[1]}`);
      }
    }
  }

  assert.ok(total > 0, "expected to find prompt references to check");
  assert.deepEqual(
    missing,
    [],
    `unresolvable prompt references: ${missing.join(", ")}`,
  );
});

test("matching set covers current names plus retired", () => {
  for (const n of HASHLINE_TOOLS)
    assert.equal(HASHLINE_TOOL_NAME_SET.has(n), true, n);
  assert.equal(HASHLINE_TOOL_NAME_SET.has("undo_last_replace"), true);
});

test("every hashline tool is classified silent or visible edit", () => {
  for (const name of HASHLINE_TOOLS) {
    const silent = HASHLINE_SILENT_TOOL_NAME_SET.has(name);
    const visible = HASHLINE_VISIBLE_EDIT_TOOL_NAME_SET.has(name);
    assert.equal(
      silent !== visible,
      true,
      `${name} must be in exactly one of silent or visible-edit`,
    );
  }
  for (const name of HASHLINE_VISIBLE_EDIT_TOOLS) {
    assert.equal(HASHLINE_SILENT_TOOL_NAME_SET.has(name), false, name);
  }
  for (const name of HASHLINE_SILENT_TOOLS) {
    assert.equal(HASHLINE_VISIBLE_EDIT_TOOL_NAME_SET.has(name), false, name);
  }
  assert.equal(HASHLINE_SILENT_TOOL_NAME_SET.has("undo_last_replace"), true);
});

/**
 * 加载顺序不变量：hashline 必须晚于 display-intent 注册。
 *
 * display-intent 会以内置描述重注册 read / grep / find / ls / write / bash，
 * hashline 随后注册自己的 read（返回 `anchor│content`）。两者在 Pi 眼里属于
 * **同一个扩展**（同一个工厂函数内注册），所以 Pi 不会报工具冲突，
 * 而是由注册顺序决定谁生效 —— 后注册者覆盖（Pi 内部按工具名存 Map）。
 *
 * 如果 index.ts 里两者顺序被调换，模型会静默拿到没有锚点的文件内容：
 * read 看起来正常，但 replace 无法按锚点工作，且终端不会报任何错。
 * 这条测试把那个顺序锁住。
 */
test("hashline wins the read tool when registered after display-intent", () => {
  const toolDefs = new Map<string, { description?: string }>();
  // 模拟 Pi：registerTool 按工具名写入，后者覆盖前者。
  const pi = {
    registerTool: (tool: { name: string; description?: string }) => {
      toolDefs.set(tool.name, tool);
    },
    on: () => {},
    registerCommand: () => {},
    registerMessageRenderer: () => {},
    getActiveTools: () => [],
    setActiveTools: () => {},
    getAllTools: () => [],
  };

  toolDisplayIntentExtension(pi as never);
  hashlineExtension(pi as never);

  const read = toolDefs.get("read");
  assert.ok(read, "read should be registered");
  assert.match(
    String(read?.description),
    /anchor/,
    "the surviving read must be hashline's, not display-intent's builtin re-registration",
  );
});
