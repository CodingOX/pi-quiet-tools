import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getToolDisplayConfigPath } from "./agent-dir.js";

const PACKAGE_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEFAULT_CONFIG_PATH = join(PACKAGE_ROOT, "config", "default-display-config.json");

const LEGACY_PASSTHROUGH_TOOLS = new Set([
  "read",
  "replace",
  "undo_last_replace",
]);

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

  const tools = raw.tools;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) {
    return;
  }

  const passthrough = (tools as Record<string, unknown>).passthrough;
  if (!Array.isArray(passthrough)) {
    return;
  }

  const filtered = passthrough.filter(
    (name): name is string =>
      typeof name === "string" && !LEGACY_PASSTHROUGH_TOOLS.has(name),
  );
  if (filtered.length === passthrough.length) {
    return;
  }

  (tools as Record<string, unknown>).passthrough = filtered;
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
