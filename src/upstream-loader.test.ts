import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { displayIntentAlreadyActive } from "./upstream-loader.js";

const API_KEY = Symbol.for("pi-tool-display-intent.api.v1");
const OWNERS_KEY = Symbol.for("pi-tool-display-intent.runtime-owners.v1");

test("display-intent duplicate detection is scoped to the current runtime", () => {
  const globalState = globalThis as Record<symbol, unknown>;
  const previousApi = globalState[API_KEY];
  const previousOwners = globalState[OWNERS_KEY];
  const host = {} as ExtensionAPI;
  const child = {} as ExtensionAPI;

  try {
    globalState[API_KEY] = {};
    globalState[OWNERS_KEY] = new WeakSet<object>([host]);

    assert.equal(displayIntentAlreadyActive(host), true);
    assert.equal(displayIntentAlreadyActive(child), false);
  } finally {
    if (previousApi === undefined) delete globalState[API_KEY];
    else globalState[API_KEY] = previousApi;
    if (previousOwners === undefined) delete globalState[OWNERS_KEY];
    else globalState[OWNERS_KEY] = previousOwners;
  }
});

test("display-intent duplicate detection keeps compatibility with legacy API markers", () => {
  const globalState = globalThis as Record<symbol, unknown>;
  const previousApi = globalState[API_KEY];
  const previousOwners = globalState[OWNERS_KEY];

  try {
    globalState[API_KEY] = {};
    delete globalState[OWNERS_KEY];
    assert.equal(displayIntentAlreadyActive({} as ExtensionAPI), true);
  } finally {
    if (previousApi === undefined) delete globalState[API_KEY];
    else globalState[API_KEY] = previousApi;
    if (previousOwners === undefined) delete globalState[OWNERS_KEY];
    else globalState[OWNERS_KEY] = previousOwners;
  }
});

/**
 * hashline 的「已加载」守卫测试已随守卫本身一起移除。
 *
 * 那个守卫读 `pi.getAllTools()`，但扩展加载期该调用必定 throw
 * （Pi 的 `createExtensionRuntime()` 把 `getAllTools` 指向 `notInitialized`，
 * 而工厂函数正是在加载期被调用），所以它恒为 false。
 * 测它等于在测一个死分支，会给人一种「已经防住了」的错觉。
 *
 * 工具名清单的真实保护在仓库根的 `tests/hashline-contract.test.ts`：
 * 它直接启动真实 hashline 包，断言其注册的工具名与 HASHLINE_TOOL_NAME_SET
 * 完全一致 —— 上游改名会让它变红，而不是靠这里 mock 一个假的工具清单。
 */
