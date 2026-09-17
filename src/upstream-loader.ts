import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * 这里**故意没有** hashline 的「已加载」守卫。
 *
 * 曾经有过一个读取 `pi.getAllTools()` 来判断 hashline 是否已注册的守卫，
 * 但它在唯一调用点恒为 false，是死代码 —— 原因在 Pi 的生命周期：
 *
 * 1. 扩展加载期，`getAllTools` 被指向 `notInitialized`
 *    （pi-coding-agent `dist/core/extensions/loader.js`，
 *    `createExtensionRuntime()`），调用它会 throw
 *    "Extension runtime not initialized. Action methods cannot be called
 *    during extension loading."。
 * 2. 扩展工厂函数恰好就是在加载期被调用的（同一 loader 的
 *    `initializeExtension()`）。此时 `Runner.bindCore()` 尚未把真实实现
 *    挂上去，所以那次 throw 是必然的，会被 catch 吞成 false。
 *
 * 结论：加载期拿不到工具清单，**在扩展作用域内做不到这个判断**。
 * 而 pi-hashline-edit-pro 自身也没有幂等保护，于是真正的防护来自外部：
 *
 * - Pi 按扩展路径去重（同一路径重复配置只会加载一次）；
 * - 真正的双装（独立装 hashline + 本扩展）会由 Pi 报
 *   `Tool "read" conflicts with ...` 诊断，且不阻断启动；
 * - README 与 AGENTS.md 明确禁止把 hashline 单独装一遍。
 *
 * 所以 glue 无条件调用 hashlineExtension，不再保留一个永远返回 false 的守卫。
 * 这段注释保留在这里，是为了避免以后有人「修好」它又重新引入同一个死逻辑。
 */

const DISPLAY_INTENT_API_KEY = Symbol.for("pi-tool-display-intent.api.v1");
const DISPLAY_INTENT_RUNTIME_OWNERS_KEY = Symbol.for(
 "pi-tool-display-intent.runtime-owners.v1",
);

export function displayIntentAlreadyActive(pi: ExtensionAPI): boolean {
 const globalState = globalThis as Record<symbol, unknown>;
 const owners = globalState[DISPLAY_INTENT_RUNTIME_OWNERS_KEY];
 if (owners instanceof WeakSet) return owners.has(pi);

 // Older standalone releases expose only the API marker. Preserve the legacy
 // duplicate guard when no runtime-aware ownership registry is available.
 const api = globalState[DISPLAY_INTENT_API_KEY];
 return api !== undefined && typeof api === "object" && api !== null;
}
