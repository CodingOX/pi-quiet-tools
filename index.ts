import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import "./src/config-seed.js";
import { installAggregateSilentToolsPatch } from "./src/aggregate-silent-tools.js";
import {
  applyMinimalUiToHashlineTools,
  installRegisterToolHook,
} from "./src/register-tool-hook.js";
import {
  displayIntentAlreadyActive,
  hashlineAlreadyActive,
} from "./src/upstream-loader.js";
import toolDisplayIntentExtension from "@zhcsyncer/pi-tool-display-intent";
import hashlineExtension from "pi-hashline-edit-pro";

function installAggregateUiPatches(pi: ExtensionAPI): void {
  const refresh = (): void => {
    installAggregateSilentToolsPatch();
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

  if (!displayIntentAlreadyActive()) {
    toolDisplayIntentExtension(pi);
  }

  if (!hashlineAlreadyActive(pi)) {
    hashlineExtension(pi);
  }

  applyMinimalUiToHashlineTools(pi);
  installAggregateUiPatches(pi);
}
