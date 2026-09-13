import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getToolDisplayConfigPath } from "./agent-dir.js";
import {
  HASHLINE_SILENT_TOOL_NAME_SET,
  HASHLINE_VISIBLE_EDIT_TOOLS,
} from "./hashline-tools.js";

const PACKAGE_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEFAULT_CONFIG_PATH = join(
  PACKAGE_ROOT,
  "config",
  "default-display-config.json",
);
/**
 * 不进入安静 Tools 账本、保留原 renderer 的工具。
 *
 * 这些是用户必须单独看见的高信号事件，不能只剩账本上的 `×N` 计数。
 * 可见编辑名单来自 hashline-tools；其它高信号名字直接加进这个数组。
 * seed 和迁移会把它写入 `tools.passthrough`，不会动 `edit` 等其它透传项。
 *
 * - Agent：派发子代理是独立事件，必须走自己的进度 renderer。
 * - replace / insert：编辑是结果，折叠态画截短 diff。
 */
export const QUIET_UI_PASSTHROUGH_KEEP = [
  "Agent",
  ...HASHLINE_VISIBLE_EDIT_TOOLS,
] as const;

/**
 * 启动时从 passthrough 清掉的静默 hashline 名（含已淘汰的旧名）。
 *
 * 可见编辑不在这个集合里：它们必须留在 passthrough，账本折叠态才画得出 diff。
 */
const QUIET_UI_PASSTHROUGH_REMOVE = HASHLINE_SILENT_TOOL_NAME_SET;

export function migrateQuietToolsPassthrough(
  raw: Record<string, unknown>,
): boolean {
  if (raw.tools === undefined) {
    raw.tools = { passthrough: [...QUIET_UI_PASSTHROUGH_KEEP] };
    return true;
  }

  const tools = raw.tools;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) {
    return false;
  }

  const toolSettings = tools as Record<string, unknown>;
  if (toolSettings.passthrough === undefined) {
    toolSettings.passthrough = [...QUIET_UI_PASSTHROUGH_KEEP];
    return true;
  }

  const passthrough = toolSettings.passthrough;
  if (!Array.isArray(passthrough)) {
    return false;
  }

  const stripped = passthrough.filter(
    (name) =>
      typeof name !== "string" || !QUIET_UI_PASSTHROUGH_REMOVE.has(name),
  );
  const keepSet = new Set<string>(QUIET_UI_PASSTHROUGH_KEEP);
  const rest = stripped.filter(
    (name) => typeof name !== "string" || !keepSet.has(name),
  );
  const next = [...QUIET_UI_PASSTHROUGH_KEEP, ...rest];
  if (
    next.length === passthrough.length &&
    next.every((name, index) => name === passthrough[index])
  ) {
    return false;
  }

  toolSettings.passthrough = next;
  return true;
}

function migrateLegacyPassthrough(): void {
  const configPath = getToolDisplayConfigPath();
  if (!existsSync(configPath)) {
    return;
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return;
  }

  if (!migrateQuietToolsPassthrough(raw)) {
    return;
  }

  writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function seedDisplayConfigIfMissing(): void {
  migrateLegacyPassthrough();

  const configPath = getToolDisplayConfigPath();
  if (existsSync(configPath)) {
    return;
  }

  const defaultConfig = readFileSync(DEFAULT_CONFIG_PATH, "utf8");
  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  writeFileSync(configPath, defaultConfig, { encoding: "utf-8", mode: 0o600 });
}

seedDisplayConfigIfMissing();
