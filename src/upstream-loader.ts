import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DISPLAY_INTENT_API_KEY = Symbol.for("pi-tool-display-intent.api.v1");
const HASHLINE_TOOL_NAMES = ["read", "replace", "undo_last_replace"] as const;

interface ToolWithSource {
  name?: string;
  sourceInfo?: {
    source?: string;
    path?: string;
  };
}

function isHashlineOwnedTool(tool: ToolWithSource): boolean {
  if (!HASHLINE_TOOL_NAMES.includes(tool.name as (typeof HASHLINE_TOOL_NAMES)[number])) {
    return false;
  }

  const sourceInfo = tool.sourceInfo;
  if (!sourceInfo || sourceInfo.source !== "local") {
    return false;
  }

  const path = sourceInfo.path ?? "";
  return path.includes("hashline");
}

export function hashlineAlreadyActive(pi: ExtensionAPI): boolean {
  try {
    return pi.getAllTools().some((tool) => isHashlineOwnedTool(tool as ToolWithSource));
  } catch {
    return false;
  }
}

export function displayIntentAlreadyActive(): boolean {
  const api = (globalThis as Record<symbol, unknown>)[DISPLAY_INTENT_API_KEY];
  return api !== undefined && typeof api === "object" && api !== null;
}
