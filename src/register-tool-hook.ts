import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { compactEditToolUi } from "./compact-edit-ui.js";
import { lockHashlineEditSchema } from "./hashline-edit-schema.js";
import {
  HASHLINE_SILENT_TOOL_NAME_SET,
  HASHLINE_VISIBLE_EDIT_TOOL_NAME_SET,
} from "./hashline-tools.js";

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

function silentHashlineToolUi(tool: ToolDefinition): ToolDefinition {
  return {
    ...tool,
    renderCall() {
      return silentResult();
    },
    renderResult() {
      return silentResult();
    },
  };
}

/**
 * 静默工具清空 renderer；可见编辑换成截短 diff。
 * 其它工具原样放过。
 */
function decorateHashlineToolUi(tool: ToolDefinition): ToolDefinition {
  if (HASHLINE_SILENT_TOOL_NAME_SET.has(tool.name)) {
    return silentHashlineToolUi(tool);
  }
  if (HASHLINE_VISIBLE_EDIT_TOOL_NAME_SET.has(tool.name)) {
    return compactEditToolUi(lockHashlineEditSchema(tool));
  }
  return tool;
}

export function installRegisterToolHook(pi: ExtensionAPI): void {
  const piWithHook = pi as PiWithRegisterToolHook;
  const existing = piWithHook[REGISTER_TOOL_HOOK_KEY];
  if (existing && pi.registerTool === existing.wrapped) {
    return;
  }

  const originalRegisterTool = pi.registerTool.bind(pi);
  const wrappedRegisterTool: ExtensionAPI["registerTool"] = (tool) => {
    originalRegisterTool(
      decorateHashlineToolUi(tool as ToolDefinition) as typeof tool,
    );
  };

  pi.registerTool = wrappedRegisterTool;
  piWithHook[REGISTER_TOOL_HOOK_KEY] = {
    original: originalRegisterTool,
    wrapped: wrappedRegisterTool,
  };
}
