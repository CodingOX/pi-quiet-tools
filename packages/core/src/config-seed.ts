import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getToolDisplayConfigPath } from "./agent-dir.js";

const PACKAGE_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEFAULT_CONFIG_PATH = join(PACKAGE_ROOT, "config", "default-display-config.json");

const QUIET_TOOLS_PASSTHROUGH_TO_REMOVE = new Set([
  "Agent",
  "read",
  "replace",
  "undo_last_replace",
]);
export function removeQuietToolsPassthrough(raw: Record<string, unknown>): boolean {
  if (raw.tools === undefined) {
    raw.tools = { passthrough: [] };
    return true;
  }

  const tools = raw.tools;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) {
    return false;
  }

  const toolSettings = tools as Record<string, unknown>;
  if (toolSettings.passthrough === undefined) {
    toolSettings.passthrough = [];
    return true;
  }

  const passthrough = toolSettings.passthrough;
  if (!Array.isArray(passthrough)) {
    return false;
  }

  const filtered = passthrough.filter(
    (name) =>
      typeof name !== "string" || !QUIET_TOOLS_PASSTHROUGH_TO_REMOVE.has(name),
  );
  if (filtered.length === passthrough.length) {
    return false;
  }

  toolSettings.passthrough = filtered;
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

  if (!removeQuietToolsPassthrough(raw)) {
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
