declare module "@zhcsyncer/pi-tool-display-intent" {
  import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

  interface ToolDisplayIntentExtension {
    (pi: ExtensionAPI): void;
    hasPrecedingAggregateToolsLedger?: (message: unknown) => boolean;
  }

  const toolDisplayIntentExtension: ToolDisplayIntentExtension;
  export default toolDisplayIntentExtension;
}

declare module "pi-hashline-edit-pro" {
  import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

  export default function hashlineExtension(pi: ExtensionAPI): void;
}
