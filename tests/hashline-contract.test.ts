import assert from "node:assert/strict";
import test from "node:test";
import hashlineExtension from "pi-hashline-edit-pro";
import toolDisplayIntentExtension from "@zhcsyncer/pi-tool-display-intent";
import {
  HASHLINE_TOOLS,
  HASHLINE_TOOL_NAME_SET,
} from "../packages/core/src/hashline-tools.js";

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

test("matching set covers current names plus retired", () => {
  for (const n of HASHLINE_TOOLS)
    assert.equal(HASHLINE_TOOL_NAME_SET.has(n), true, n);
  assert.equal(HASHLINE_TOOL_NAME_SET.has("undo_last_replace"), true);
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
