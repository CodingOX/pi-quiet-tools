import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { displayIntentAlreadyActive, hashlineAlreadyActive } from "./upstream-loader.js";

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
 * 重复加载守卫的回归保护。
 *
 * 上游 2.7.0 换了工具名（undo_last_change / insert / anchor_grep）。如果这里只认老名字，
 * glue 会误判「hashline 还没加载」，于是再调一次 hashlineExtension，Pi 就会报
 * `Tool "read" conflicts with ...`。所以每个当前工具名都必须能被识别。
 */
test("hashline duplicate detection recognizes every current tool name", () => {
  const currentNames = [
    "read",
    "replace",
    "insert",
    "undo_last_change",
    "anchor_grep",
  ];

  for (const name of currentNames) {
    const pi = {
      getAllTools: () => [
        { name, sourceInfo: { source: "local", path: "/x/pi-hashline-edit-pro/index.ts" } },
      ],
    } as unknown as ExtensionAPI;

    assert.equal(hashlineAlreadyActive(pi), true, `${name} should count as hashline owned`);
  }
});

test("hashline duplicate detection ignores unrelated local tools", () => {
  const pi = {
    getAllTools: () => [
      { name: "bash", sourceInfo: { source: "local", path: "/x/some-ext/index.ts" } },
      // 名字对但不是本地扩展提供（例如内置 read），不应算作 hashline 已加载。
      { name: "read", sourceInfo: { source: "builtin" } },
    ],
  } as unknown as ExtensionAPI;

  assert.equal(hashlineAlreadyActive(pi), false);
});
