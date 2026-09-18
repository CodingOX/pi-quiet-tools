import assert from "node:assert/strict";
import { test } from "node:test";
import { Markdown } from "@earendil-works/pi-tui";
import { installHideCodeFenceChrome } from "./code-fence.ts";

/**
 * 原型补丁的实参转发回归测试。
 *
 * 背景：上游 `Markdown.renderToken` 的签名是
 *   renderToken(token, width, nextTokenType, styleContext)
 * 第四个参数不是可选的装饰——blockquote（markdown.js:440）与 list（:616）分支
 * 会传进来，子 token 靠它恢复**引用块 / 列表的样式前缀**。
 *
 * 旧实现只声明三个形参并 `original.call(this, token, width, next)`，把第 4 个参数
 * 吞掉了，于是引用块内「加粗 / 行内代码 / 链接」**之后的文字**丢掉引用块样式：
 * 前景色被上游的 `\x1b[39m` 重置后再无人恢复，用户看到「没标签的部分正常，
 * 带标签的那部分不一样」。
 *
 * 断言方式是「装补丁 vs 原始实现」的逐字节对照。为了让测试与执行顺序无关，
 * 基线渲染走 `withOriginalRenderer()` 显式切回原始 `renderToken`，
 * 而不是依赖「补丁此刻还没装」这个隐含前提。
 */

/**
 * 以「可写 renderToken」的视角看 Markdown 原型。
 *
 * SAFETY: pi-tui 的 .d.ts 把 `renderToken` 标成 private，但它确实是原型方法，
 * `code-fence.ts` 包装的就是它。此处只在测试内读写同一个方法。
 */
const markdownProto = Markdown.prototype as unknown as {
  renderToken: (this: unknown, ...args: unknown[]) => string[];
};

/** 模块加载时抓一次真·原始实现（早于任何测试运行）。 */
const ORIGINAL_RENDER_TOKEN = markdownProto.renderToken;

/** 去掉 ANSI 只留可见字符。 */
const stripAnsi = (line: string): string => line.replace(/\x1b\[[0-9;]*m/g, "");

/**
 * 最小可用的 markdown theme。
 *
 * 不用真实 theme：那需要先 `initTheme()`，会把全局主题状态带进测试进程，
 * 而且 pi 的 dist 子路径没有 package exports，从测试里 import 不到。
 * 字段必须与 pi-tui 的 `MarkdownTheme` 接口对齐，缺一个就会在渲染中途抛错。
 */
const fakeTheme = {
  heading: (t: string) => t,
  link: (t: string) => t,
  linkUrl: (t: string) => t,
  code: (t: string) => `\x1b[7m${t}\x1b[27m`,
  codeBlock: (t: string) => t,
  codeBlockBorder: (t: string) => `\x1b[2m${t}\x1b[22m`,
  quote: (t: string) => `\x1b[36m${t}\x1b[39m`,
  quoteBorder: (t: string) => `\x1b[2m${t}\x1b[22m`,
  hr: (t: string) => t,
  listBullet: (t: string) => t,
  bold: (t: string) => `\x1b[1m${t}\x1b[22m`,
  italic: (t: string) => `\x1b[3m${t}\x1b[23m`,
  strikethrough: (t: string) => t,
  underline: (t: string) => `\x1b[4m${t}\x1b[24m`,
};

/** 用**当前**原型渲染。 */
function renderLines(markdown: string, width = 60): string[] {
  return new Markdown(markdown, 0, 0, fakeTheme, undefined, {}).render(width);
}

/**
 * 临时切回原始 `renderToken` 渲染一次，再还原。
 * 用来拿到「补丁不该改变的那份输出」，与安装顺序无关。
 */
function withOriginalRenderer<T>(run: () => T): T {
  const patched = markdownProto.renderToken;
  markdownProto.renderToken = ORIGINAL_RENDER_TOKEN;
  try {
    return run();
  } finally {
    markdownProto.renderToken = patched;
  }
}

/** 统计围栏 chrome 行（去掉 ANSI 后整行就是 ``` 或 ```lang）。 */
const fenceLineCount = (lines: string[]): number =>
  lines.filter((line) => /^```[^\s]*$/.test(stripAnsi(line).trim())).length;

/** 引用块案例：加粗 / 代码 / 链接之后的文字最容易暴露样式丢失。 */
const QUOTE_CASES = [
  "> 🎯 **TL;DR**\n> 是的，会重复。你两边的 skill 是同一份内容的两个副本，之后还有字。",
  "> 普通文字 **加粗** 之后还有普通文字。",
  "> 前缀 `代码` 之后的文字。",
  "> 见 [文档](https://example.com) 之后的文字。",
  "> 纯文本引用块。",
];

test("补丁对非 code token 渲染逐字节透明（引用块样式不丢）", () => {
  installHideCodeFenceChrome();

  QUOTE_CASES.forEach((md) => {
    const expected = withOriginalRenderer(() => renderLines(md));
    const actual = renderLines(md);
    assert.deepEqual(
      actual,
      expected,
      `补丁改变了引用块渲染：${JSON.stringify(md)}`,
    );
  });
});

test("补丁确实吞掉 code token 的围栏行且保留内容", () => {
  installHideCodeFenceChrome();

  const md = "```text\n内容行\n```";
  const before = withOriginalRenderer(() => renderLines(md));
  const after = renderLines(md);

  assert.ok(
    fenceLineCount(before) > 0,
    `基线应能看到围栏：${JSON.stringify(before.map(stripAnsi))}`,
  );
  assert.equal(
    fenceLineCount(after),
    0,
    `围栏应被吞掉：${JSON.stringify(after.map(stripAnsi))}`,
  );
  assert.ok(
    after.some((line) => stripAnsi(line).includes("内容行")),
    `代码内容不应被吞掉：${JSON.stringify(after.map(stripAnsi))}`,
  );
});

test("补丁幂等：重复安装不叠加包装", () => {
  installHideCodeFenceChrome();
  const first = renderLines("> 引用块。");
  installHideCodeFenceChrome();
  const second = renderLines("> 引用块。");
  assert.deepEqual(second, first, "重复安装后输出发生变化");
});

// ============================================================================
// 跨 reload 的原型补丁更新
// ============================================================================

/**
 * `Markdown.prototype` 跨 `/reload` 存活（reload 只重跑扩展代码）。所以补丁必须能
 * 认出「进程里已经有一份」，并且在没有原始实现可解包时**如实回报失败**，
 * 而不是套一层把坏包装留在里面。
 *
 * 这三条测试锁住的正是 2026-09 的真实事故：v1 装了补丁、置了布尔标记但没存原始，
 * 修好包装逻辑后 `/reload` 看似成功、实际仍是 v1 的行为。
 */

/** 直接读写原型上的补丁记录（与 code-fence.ts 的键保持一致）。 */
const PATCH_KEY = "__piQuietToolsCodeFencePatch";
const LEGACY_FLAG_KEY = "__mdEnhanceHideFences";
const protoWithKeys = markdownProto as unknown as Record<string, unknown>;

/** 把原型恢复到「从未打过补丁」的状态。 */
function resetPatchState(): void {
  const record = protoWithKeys[PATCH_KEY] as { original?: unknown } | undefined;
  if (record?.original) {
    markdownProto.renderToken = record.original as typeof ORIGINAL_RENDER_TOKEN;
  }
  delete protoWithKeys[PATCH_KEY];
  delete protoWithKeys[LEGACY_FLAG_KEY];
}

test("同版本重复安装返回 true 且不叠加包装", () => {
  resetPatchState();
  assert.equal(installHideCodeFenceChrome(), true, "首次安装应成功");
  assert.equal(installHideCodeFenceChrome(), true, "同版本重复安装应幂等成功");
  resetPatchState();
});

test("检测到 v1 残留时返回 false（reload 换不掉，必须重启）", () => {
  resetPatchState();
  // 模拟 v1：只有布尔标记，没有记录，闭包里那条原始实现取不回来
  protoWithKeys[LEGACY_FLAG_KEY] = true;

  assert.equal(
    installHideCodeFenceChrome(),
    false,
    "v1 残留时必须回报失败，否则会假装装好了",
  );
  // 且不能留下记录——留下了就等于宣称「已升级」
  assert.equal(
    protoWithKeys[PATCH_KEY],
    undefined,
    "v1 残留时不应写入补丁记录",
  );
  resetPatchState();
});

test("装过带记录的旧版本时能解包并重装（v2 之后可平滑升级）", () => {
  resetPatchState();
  // 模拟「上一版装了补丁，并留下了记录」——v2 及之后的形态
  const originalBefore = markdownProto.renderToken;
  const staleWrapper = (..._args: unknown[]): string[] => ["STALE"];
  markdownProto.renderToken = staleWrapper;
  protoWithKeys[PATCH_KEY] = { version: 999, original: originalBefore };

  assert.equal(installHideCodeFenceChrome(), true, "应能升级");
  assert.notEqual(
    markdownProto.renderToken,
    staleWrapper,
    "过期的包装必须被替换掉",
  );
  // 升级后渲染正常，且引用块样式不丢
  const lines = renderLines(QUOTE_CASES[1]);
  const expected = withOriginalRenderer(() => renderLines(QUOTE_CASES[1]));
  assert.deepEqual(lines, expected, "升级后的补丁仍须对引用块透明");
  resetPatchState();
});
