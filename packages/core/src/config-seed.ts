import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getToolDisplayConfigPath } from "./agent-dir.js";

const PACKAGE_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEFAULT_CONFIG_PATH = join(PACKAGE_ROOT, "config", "default-display-config.json");

/**
 * 不进入安静 Tools 账本、保留原 renderer 的工具。
 *
 * 这些是用户必须单独看见的高信号事件，不能只剩账本上的 `×N` 计数。
 * 后续若要把别的工具也从账本里拿出来，把名字加进这个列表即可：
 * seed 和迁移会把它写入 `tools.passthrough`，不会动 `edit` 等其它透传项。
 *
 * - Agent：派发子代理是独立事件，必须走自己的进度 renderer。
 */
export const QUIET_UI_PASSTHROUGH_KEEP = ["Agent"] as const;

/**
 * Hashline 工具必须留在账本里只显示计数。旧配置若把它们放进 passthrough，
 * 终端会出现逐次 Read / replace 行。
 */
const QUIET_UI_PASSTHROUGH_REMOVE = new Set([
  "read",
  "replace",
  "undo_last_replace",
]);

export function migrateQuietToolsPassthrough(raw: Record<string, unknown>): boolean {
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

  const next = passthrough.filter(
    (name) =>
      typeof name !== "string" || !QUIET_UI_PASSTHROUGH_REMOVE.has(name),
  );
  const present = new Set(
    next.filter((name): name is string => typeof name === "string"),
  );
  const missing = QUIET_UI_PASSTHROUGH_KEEP.filter((name) => !present.has(name));
  if (missing.length > 0) {
    next.unshift(...missing);
  }
  if (
    missing.length === 0 &&
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
    raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
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
