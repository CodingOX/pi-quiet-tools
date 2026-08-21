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
