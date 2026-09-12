import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { HASHLINE_TOOL_NAME_SET } from "./hashline-tools.js";

/** Hashline 工具的 renderer 被替换为空，计数只留在 Tools 账本里。 */
const MINIMAL_UI_TOOLS = HASHLINE_TOOL_NAME_SET;

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

      // SAFETY: Pi 的 getAllTools() 声明返回宽泛的工具条目类型，而这里只需要
      // name/renderCall/renderResult 三个字段来覆写 renderer。运行时形状由 Pi 自己
      // 注册工具时保证，无法用类型系统表达，因此在此处收窄。
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
