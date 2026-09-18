import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installHideCodeFenceChrome } from "./code-fence.js";
import { loadMarkdownEnhanceConfig } from "./config.js";
import { createMarkdownTransformer } from "./transforms.js";

/**
 * @pi-quiet-tools/markdown-enhance —— Markdown 显示增强。
 *
 * 只动 Markdown 显示：transformer + 可选的代码块围栏隐藏。不碰 editor / header / footer。
 *
 * 从 pi-cc-extensions 的 `extensions/renderer/markdown-enhance.ts` 抽出来并入本仓库，
 * 原因见 docs/local-overlay.md：它与 display-intent / hashline 在渲染链上不重叠
 * （quiet-tools 不注册 markdownTransformer，只包 AssistantMessageComponent.render），
 * 所以收编不会抢槽位，只是把「每个人都要自己解决 grok-mermaid 依赖」变成随包发布。
 *
 * 两个口味开关默认关闭，避免把个人 workaround 强加给其他消费者：
 *   - deCircled：Nerd Font 补丁字形（U+2460–U+2473）ink 超界的规避
 *   - hideCodeFence：吞掉 ``` 围栏 chrome
 * 详见 config.ts 的注释。
 */

export interface MarkdownEnhanceExtensionOptions {
  /** 显式覆盖配置（测试用）。生产路径读 config.json。 */
  configPath?: string;
}

export function registerMarkdownEnhance(
  pi: ExtensionAPI,
  options?: MarkdownEnhanceExtensionOptions,
): void {
  const config = loadMarkdownEnhanceConfig(options?.configPath);
  if (!config.enabled) {
    return;
  }

  // 原型补丁必须先于 transformer 注册：它影响所有 Markdown 实例，
  // 而 transformer 只影响经本扩展注册的那条链路。
  //
  // 返回值 false 表示本次进程里卡着 v1 的旧包装（它没保存原始实现，解不开）。
  // Pi 是 TUI，往 stdout/stderr 写日志会糊掉界面，所以这里不打印；README 的排障表
  // 有对应条目（重启 Pi 而非 /reload）。
  if (config.hideCodeFence) {
    installHideCodeFenceChrome();
  }

  // 注意：pi 每个扩展只有一个 markdownTransformer 槽位，多次注册会互相覆盖，
  // 所以所有步骤合成一次注册，内部按序链式执行（见 transforms.ts）。
  pi.registerMarkdownTransformer(
    createMarkdownTransformer({
      common: config.common,
      deCircled: config.deCircled,
    }),
  );
}

export default function markdownEnhanceExtension(
  pi: ExtensionAPI,
): void {
  registerMarkdownEnhance(pi);
}

export {
  DEFAULT_MARKDOWN_ENHANCE_CONFIG,
  MARKDOWN_ENHANCE_CONFIG_SLUG,
  getMarkdownEnhanceConfigPath,
  loadMarkdownEnhanceConfig,
  type MarkdownEnhanceConfig,
} from "./config.js";
export {
  hideCodeFenceChrome,
  installHideCodeFenceChrome,
  isCodeFenceChromeLine,
} from "./code-fence.js";
export {
  createMarkdownTransformer,
  deCircled,
  linkifyUrls,
  normalizeMultilineLinks,
  renderAdmonitions,
  renderDiagrams,
  trimUrl,
  type MarkdownContext,
  type TransformerOptions,
} from "./transforms.js";
