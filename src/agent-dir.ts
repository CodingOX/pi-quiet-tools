import { homedir } from "node:os";
import { join } from "node:path";

const PI_AGENT_DIR_ENV_VAR = "PI_CODING_AGENT_DIR";

function expandHomeDirectory(configuredDir: string, homeDirectory: string): string {
  if (configuredDir === "~") {
    return homeDirectory;
  }

  if (configuredDir.startsWith("~/") || configuredDir.startsWith("~\\")) {
    return join(homeDirectory, configuredDir.slice(2));
  }

  return configuredDir;
}

export function resolvePiAgentDir(
  env: NodeJS.ProcessEnv = process.env,
  homeDirectory = homedir(),
): string {
  const configuredDir = env[PI_AGENT_DIR_ENV_VAR];
  if (!configuredDir) {
    return join(homeDirectory, ".pi", "agent");
  }

  return expandHomeDirectory(configuredDir, homeDirectory);
}

export function getToolDisplayConfigPath(agentDir = resolvePiAgentDir()): string {
  return join(agentDir, "extension-data", "pi-tool-display-intent", "config.json");
}
