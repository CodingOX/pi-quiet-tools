import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import "./src/config-seed.js";
import {
  installAggregateKeepNarrationPatch,
  setPrecedingToolsLedgerResolver,
} from "./src/aggregate-keep-narration.js";
import { installQuietSubagentNotificationRenderer } from "@pi-quiet-tools/notify/renderer";
import { installHostWatchdog } from "@pi-quiet-tools/watchdog";
import { installAggregateSilentToolsPatch } from "./src/aggregate-silent-tools.js";
import {
  applyMinimalUiToHashlineTools,
  installRegisterToolHook,
} from "./src/register-tool-hook.js";
import { displayIntentAlreadyActive } from "./src/upstream-loader.js";
// 这两个包现在指向 vendor/ 内的只读镜像（见 vendor/README.md）。
// 包名保持与上游一致，这样上游同步进来时不需要改这里的 import。
import toolDisplayIntentExtension from "@zhcsyncer/pi-tool-display-intent";
import hashlineExtension from "pi-hashline-edit-pro";

function installAggregateUiPatches(pi: ExtensionAPI): void {
  const refresh = (): void => {
    installAggregateSilentToolsPatch();
    installAggregateKeepNarrationPatch();
  };

  refresh();
  pi.on("session_start", async () => {
    refresh();
  });
  pi.on("before_agent_start", async () => {
    refresh();
  });
}

export default function piToolsGlueExtension(pi: ExtensionAPI): void {
  installRegisterToolHook(pi);
  installQuietSubagentNotificationRenderer(pi);
  installHostWatchdog(pi);

  if (!displayIntentAlreadyActive(pi)) {
    toolDisplayIntentExtension(pi);
  }

  setPrecedingToolsLedgerResolver(
    (message) =>
      toolDisplayIntentExtension.hasPrecedingAggregateToolsLedger?.(message) ===
      true,
  );
  // 无条件加载 hashline：加载期无法判断它是否已注册，详见 upstream-loader.ts 顶部说明。
  hashlineExtension(pi);

  applyMinimalUiToHashlineTools(pi);
  installAggregateUiPatches(pi);
}
