import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Register cleanup for every runtime teardown. Pi rebinds extensions after
 * reload, new, resume, and fork, so process-global patches must never outlive
 * the ExtensionAPI instance that owns their event handlers.
 */
export function onSessionShutdown(pi: ExtensionAPI, cleanup: () => void): void {
  pi.on("session_shutdown", async () => {
    cleanup();
  });
}
