import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const MINIMAL_UI_TOOLS = new Set(["read", "replace", "undo_last_replace"]);

const REGISTER_TOOL_HOOK_KEY = Symbol.for("pi-tools.registerToolHook.v1");

interface PiWithRegisterToolHook extends ExtensionAPI {
  [REGISTER_TOOL_HOOK_KEY]?: {
    original: ExtensionAPI["registerTool"];
    wrapped: ExtensionAPI["registerTool"];
  };
}

function silentResult(): Text {
  return new Text("", 0, 0);
}

function minimizeHashlineToolUi(tool: ToolDefinition): ToolDefinition {
  if (!MINIMAL_UI_TOOLS.has(tool.name)) {
    return tool;
  }

  return {
    ...tool,
    renderCall() {
      return silentResult();
    },
    renderResult(_result, options) {
      if (options.isPartial) {
        return silentResult();
      }
      return silentResult();
    },
  };
}

export function applyMinimalUiToHashlineTools(pi: ExtensionAPI): void {
  try {
    for (const tool of pi.getAllTools()) {
      if (!MINIMAL_UI_TOOLS.has(tool.name)) {
        continue;
      }

      const minimized = minimizeHashlineToolUi(tool as unknown as ToolDefinition);
      Object.assign(tool, {
        renderCall: minimized.renderCall,
        renderResult: minimized.renderResult,
      });
    }
  } catch {
    // getAllTools may be unavailable during very early extension load.
  }
}

export function installRegisterToolHook(pi: ExtensionAPI): void {
  const piWithHook = pi as PiWithRegisterToolHook;
  const existing = piWithHook[REGISTER_TOOL_HOOK_KEY];
  if (existing && pi.registerTool === existing.wrapped) {
    return;
  }

  const originalRegisterTool = pi.registerTool.bind(pi);
  const wrappedRegisterTool: ExtensionAPI["registerTool"] = (tool) => {
    originalRegisterTool(minimizeHashlineToolUi(tool as ToolDefinition) as typeof tool);
  };

  pi.registerTool = wrappedRegisterTool;
  piWithHook[REGISTER_TOOL_HOOK_KEY] = {
    original: originalRegisterTool,
    wrapped: wrappedRegisterTool,
  };
}
