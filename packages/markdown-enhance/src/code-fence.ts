import { Markdown } from "@earendil-works/pi-tui";

/**
 * 藏掉代码块围栏标志（```text / ```）。
 *
 * Pi 原生会把 fence 当边框画出来：
 *   ```text
 *     highlighted code
 *   ```
 * highlightCode(lang) 已经用语言做高亮，围栏只是源码标志。
 * 在 renderToken 出口滤掉这两行；代码内容仍带 2 空格缩进。
 *
 * ⚠️ 这是**进程级**原型补丁：`Markdown.prototype` 跨 `/reload` 存活，reload 只重跑
 * 扩展代码、不会重置原型。所以此处必须做**版本感知**的重装（见下），否则改了包装
 * 逻辑也换不掉进程里那份旧的。
 */

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** 去掉 ANSI 后，整行就是 ``` 或 ```lang 的围栏边框。 */
export function isCodeFenceChromeLine(line: string): boolean {
  const visible = line.replace(ANSI_RE, "").trimEnd();
  return /^```[^\s]*$/.test(visible);
}

export function hideCodeFenceChrome(lines: string[]): string[] {
  return lines.filter((line) => !isCodeFenceChromeLine(line));
}

type MarkdownRenderToken = (this: unknown, ...args: unknown[]) => string[];

type MarkdownProto = {
  renderToken: MarkdownRenderToken;
  [key: string]: unknown;
};

/** 补丁记录的存放键（挂在原型上，跨 reload 存活）。 */
const PATCH_KEY = "__piQuietToolsCodeFencePatch";

/**
 * 历史实现（v1，随最初的独立扩展发布）留下的布尔标记。
 *
 * v1 只置了这个标记、**没有保存真原始函数**，所以进程内无法把它解开：
 * 它的闭包里握着真原始 renderToken，外面拿不到，也没有第二个引用可借。
 * 识别它只为一件事——不假装装好了，并把「需要重启」这件事如实回报给调用方。
 */
const LEGACY_FLAG_KEY = "__mdEnhanceHideFences";

/**
 * 补丁实现版本。**改动下面的包装逻辑时必须 +1**，
 * 否则已装过旧版的进程会一直用旧包装（reload 换不掉）。
 *
 * - v1：只转发前三个形参 `(token, width, next)`，吞掉第 4 个 `styleContext`
 *   → 引用块内「加粗 / 行内代码 / 链接」之后的文字丢样式。
 * - v2：用 `Function#apply` 转发**全部**实参，并记录真原始函数以便后续解包重装。
 */
const FENCE_PATCH_VERSION = 2;

interface FencePatchRecord {
  version: number;
  /** 补丁前的真·上游 renderToken，用于下次改版时解包。 */
  original: MarkdownRenderToken;
}

/**
 * 安装/升级围栏补丁。
 *
 * @returns true 表示当前实现已是本次调用所带的版本（或已是最新）。
 *          false 表示进程里卡着 v1 的旧包装、**必须重启 Pi** 才能更新。
 */
export function installHideCodeFenceChrome(): boolean {
  // SAFETY: Pi 运行时原型确实提供 renderToken；这里只重声明签名以便版本化包装。
  const proto = Markdown.prototype as unknown as MarkdownProto;
  const record = proto[PATCH_KEY] as FencePatchRecord | undefined;

  // ① 已是同版本：幂等返回，不重复包装
  if (record?.version === FENCE_PATCH_VERSION) {
    return true;
  }

  // ② 卡着 v1：只有布尔标记、没有记录，闭包里那条真原始函数取不回来。
  //    此时**不能再包一层**——包了也只是把坏包装套在里面，样式照样丢。
  //    不在这里打印日志：Pi 是 TUI，向 stdout/stderr 写东西会糊掉界面，
  //    等价判断交给调用方与 README 的排障条目（重启 Pi）。
  if (record === undefined && proto[LEGACY_FLAG_KEY] === true) {
    return false;
  }

  // ③ 装过旧版但留有记录：先解包回真原始，再重新包装
  if (record !== undefined) {
    proto.renderToken = record.original;
  }

  const original = proto.renderToken;
  proto.renderToken = function patchedRenderToken(
    this: unknown,
    ...args: unknown[]
  ): string[] {
    // ⚠️ 必须把**全部**实参原样转发给上游 renderToken，不能只写前三个形参。
    //
    // blockquote（markdown.js:440）与 list（:616）分支会额外传第 4 个参数
    // styleContext，子 token 靠它恢复引用块/列表的样式前缀。只转发三个形参会让
    // 引用块内「加粗 / 行内代码 / 链接」**之后的文字**丢掉引用块样式
    // （前景色被上游的 \x1b[39m 重置后无人恢复），表现为
    // 「没标签的部分正常，带标签的那部分不一样」。
    //
    // 转发整个 args（而不是罗列形参），也是为了让上游将来再新增参数时不会重踩
    // 同一个坑 —— v1 的缺陷正是漏转发第 4 个参数导致的。
    const lines = original.apply(this, args) as string[];
    const token = args[0] as { type?: string } | undefined;
    if (token?.type !== "code") return lines;
    return hideCodeFenceChrome(lines);
  };

  proto[PATCH_KEY] = {
    version: FENCE_PATCH_VERSION,
    original,
  } satisfies FencePatchRecord;
  // 兼容标记：让任何残留的 v1 代码（例如被重新装回的独立扩展）认出「已打过补丁」，
  // 从而不会二次包装。
  proto[LEGACY_FLAG_KEY] = true;
  return true;
}
