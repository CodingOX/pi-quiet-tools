import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * markdown-enhance 的配置读取。
 *
 * 为什么不用 pi.registerFlag：那些 flag 走 `--flag` 命令行与 runtime.flagValues，
 * 语义是「一次会话的临时开关」，不是「长期偏好」。这里的两项（圈数字、吞围栏）
 * 都是长期口味，且必须能在扩展加载前就读到，才能决定装不装原型补丁。
 *
 * 落盘位置沿用仓库既有约定：`<agentDir>/extension-data/<extension-slug>/config.json`，
 * 与 pi-tool-display-intent 同形，便于用户查找与 pi-sync 之外的手工备份。
 */

export const MARKDOWN_ENHANCE_CONFIG_SLUG = "pi-quiet-tools-markdown-enhance";

export interface MarkdownEnhanceConfig {
  /** 总开关。false 时本包完全不注册 transformer、不装原型补丁。 */
  enabled: boolean;
  /** 通用增强：mermaid 方言渲染、GitHub 提示框、裸 URL 转链接。 */
  common: boolean;
  /**
   * 圈数字 ①②③ → (1)(2)(3)。
   * 默认关：这是 Nerd Font 补丁字形（U+2460–U+2473）ink 超界的个人规避手段，
   * 不是所有用户都需要的通用行为，不该默认强加给消费者。
   */
  deCircled: boolean;
  /**
   * 吞掉代码块围栏（```text / ```）的 chrome 行。
   * 默认关：属个人口味——有人靠围栏确认「这块是代码」。
   */
  hideCodeFence: boolean;
}

export const DEFAULT_MARKDOWN_ENHANCE_CONFIG: MarkdownEnhanceConfig = {
  enabled: true,
  common: true,
  deCircled: false,
  hideCodeFence: false,
};

const PI_AGENT_DIR_ENV_VAR = "PI_CODING_AGENT_DIR";

/** 与 src/agent-dir.ts 同规则：`~` 展开、`PI_CODING_AGENT_DIR` 覆盖。 */
export function resolvePiAgentDir(
  env: NodeJS.ProcessEnv = process.env,
  homeDirectory = homedir(),
): string {
  const configuredDir = env[PI_AGENT_DIR_ENV_VAR];
  if (!configuredDir) {
    return join(homeDirectory, ".pi", "agent");
  }
  if (configuredDir === "~") {
    return homeDirectory;
  }
  if (configuredDir.startsWith("~/") || configuredDir.startsWith("~\\")) {
    return join(homeDirectory, configuredDir.slice(2));
  }
  return configuredDir;
}

export function getMarkdownEnhanceConfigPath(
  agentDir = resolvePiAgentDir(),
): string {
  return join(agentDir, "extension-data", MARKDOWN_ENHANCE_CONFIG_SLUG, "config.json");
}

/** 逐字段类型校验：坏字段退回默认值，不让一个手误的 config 拖垮整个扩展。 */
function coerceConfig(raw: unknown): MarkdownEnhanceConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_MARKDOWN_ENHANCE_CONFIG };
  }
  const record = raw as Record<string, unknown>;
  const pick = (
    key: keyof MarkdownEnhanceConfig,
  ): boolean => {
    const value = record[key];
    return typeof value === "boolean"
      ? value
      : DEFAULT_MARKDOWN_ENHANCE_CONFIG[key];
  };
  return {
    enabled: pick("enabled"),
    common: pick("common"),
    deCircled: pick("deCircled"),
    hideCodeFence: pick("hideCodeFence"),
  };
}

/**
 * 读配置；文件不存在时写一份默认值再返回。
 * 写盘失败（只读挂载等）只影响持久化，不影响本次会话生效。
 */
export function loadMarkdownEnhanceConfig(
  configPath = getMarkdownEnhanceConfigPath(),
): MarkdownEnhanceConfig {
  if (!existsSync(configPath)) {
    const defaults = { ...DEFAULT_MARKDOWN_ENHANCE_CONFIG };
    try {
      mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
      writeFileSync(configPath, `${JSON.stringify(defaults, null, 2)}\n`, {
        encoding: "utf-8",
        mode: 0o600,
      });
    } catch {
      // 不能写盘就只在内存里用默认值
    }
    return defaults;
  }

  try {
    return coerceConfig(JSON.parse(readFileSync(configPath, "utf8")));
  } catch {
    return { ...DEFAULT_MARKDOWN_ENHANCE_CONFIG };
  }
}
