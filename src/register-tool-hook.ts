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

function minimizeHashlineToolUi(tool: ToolDefinition): ToolDefinition {
  if (!HASHLINE_SILENT_TOOL_NAME_SET.has(tool.name)) {
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

/**
 * 静默工具清空 renderer；可见编辑换成截短 diff。
 * 其它工具原样放过。
 */
function decorateHashlineToolUi(tool: ToolDefinition): ToolDefinition {
  if (HASHLINE_SILENT_TOOL_NAME_SET.has(tool.name)) {
    return minimizeHashlineToolUi(tool);
  }
  if (HASHLINE_VISIBLE_EDIT_TOOL_NAME_SET.has(tool.name)) {
    return compactEditToolUi(lockHashlineEditSchema(tool));
  }
  return tool;
}

export function applyMinimalUiToHashlineTools(pi: ExtensionAPI): void {
  try {
    for (const tool of pi.getAllTools()) {
      if (
        !HASHLINE_SILENT_TOOL_NAME_SET.has(tool.name) &&
        !HASHLINE_VISIBLE_EDIT_TOOL_NAME_SET.has(tool.name)
      ) {
        continue;
      }

      // SAFETY: Pi 的 getAllTools() 在加载期会 throw；runtime 返回的是没有 renderer
      // 的浅拷贝，Object.assign 也写不回 registry。真正装饰走 hook。
      // 这段留下是为了步骤 6 的加载顺序契约，失败就当 no-op。
      const decorated = decorateHashlineToolUi(
        tool as unknown as ToolDefinition,
      );
      Object.assign(tool, {
        renderCall: decorated.renderCall,
        renderResult: decorated.renderResult,
        // 加载期 getAllTools 基本是 no-op，但 B/C 的 renderShell 不要留缺口。
        renderShell: decorated.renderShell,
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
