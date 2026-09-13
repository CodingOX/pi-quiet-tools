import assert from "node:assert/strict";
import { test } from "node:test";
import { Text } from "@earendil-works/pi-tui";
import {
  compactDiffLines,
  compactEditToolUi,
  EDIT_PREVIEW_MAX_LINES,
  formatCompactEditCall,
  formatCompactEditResult,
} from "./compact-edit-ui.ts";
import {
  allocateAnchor,
  freeAnchors,
  initRegistry,
  resetRegistryForTests,
} from "pi-hashline-edit-pro/src/anchor-registry.ts";


test("strips hashline anchors and keeps only change lines", () => {
  const { shown, hidden } = compactDiffLines(
    [
      " Ab12│unchanged context",
      "-Cd34│old keep",
      "+Ef56│new keep",
      " Gh78│more context",
    ].join("\n"),
  );
  assert.deepEqual(shown, ["-old keep", "+new keep"]);
  assert.equal(hidden, 0);
});

test("formatCompactEditResult folds leftover change lines", () => {
  const diff = Array.from(
    { length: EDIT_PREVIEW_MAX_LINES + 2 },
    (_, index) => `+Ab${String(index).padStart(2, "0")}│line ${index}`,
  ).join("\n");
  const text = formatCompactEditResult(
    "replace",
    { path: "a.ts" },
    {
      details: { diff, metrics: { added_lines: 8, removed_lines: 0 } },
    },
  );
  assert.match(text, /\+8 -0/);
  assert.match(text, /\+line 0/);
  assert.match(text, /\+line 5/);
  assert.doesNotMatch(text, /\+line 6/);
  assert.match(text, /\.\.\. 2 more/);
});

test("caps preview at six change lines and reports the rest", () => {
  const diff = Array.from(
    { length: EDIT_PREVIEW_MAX_LINES + 3 },
    (_, index) => `+Ab${String(index).padStart(2, "0")}│line ${index}`,
  ).join("\n");
  const { shown, hidden } = compactDiffLines(diff);
  assert.equal(shown.length, EDIT_PREVIEW_MAX_LINES);
  assert.equal(hidden, 3);
  assert.equal(shown[0], "+line 0");
  assert.equal(shown[5], "+line 5");
});

test("skips unified headers, hunk marks, and dedup rows", () => {
  const { shown, hidden } = compactDiffLines(
    [
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,3 +1,3 @@",
      "-old",
      "+new",
      "dedup│ignored",
      "+Ab12│keep dedup│in content",
      "-Wx12│also old",
    ].join("\n"),
  );
  assert.deepEqual(shown, ["-old", "+new", "+keep dedup│in content", "-also old"]);
  assert.equal(hidden, 0);
});


test("keeps four-space hashline change rows", () => {
  const { shown, hidden } = compactDiffLines("+    │added without an anchor");
  assert.deepEqual(shown, ["+added without an anchor"]);
  assert.equal(hidden, 0);
});

test("call line is tool name plus path, never the replacement body", () => {
  assert.equal(
    formatCompactEditCall("replace", {
      path: "config-seed.ts",
      replacement_lines: ["a whole file"],
    }),
    "replace config-seed.ts",
  );
});


test("call line falls back from path to range to anchor", () => {
  assert.equal(
    formatCompactEditCall("replace", {
      remove_from: "Ab12",
      remove_to: "Cd34",
    }),
    "replace Ab12→Cd34",
  );
  assert.equal(
    formatCompactEditCall("insert", {
      anchor: "Ef56",
      direction: "after",
      lines: ["x"],
    }),
    "insert Ef56",
  );
  assert.equal(
    formatCompactEditCall("insert", {}, undefined, {
      state: { resolvedPath: "from-state.ts" },
    }),
    "insert from-state.ts",
  );
  assert.equal(
    formatCompactEditCall("replace", {}, undefined, undefined),
    "replace ...",
  );
});

test("call line uses owned hashline anchors as the file path", async () => {
  resetRegistryForTests();
  await initRegistry(undefined);
  try {
    const from = allocateAnchor("/repo/demo.md", "checksum-from");
    const to = allocateAnchor("/repo/demo.md", "checksum-to");
    assert.equal(
      formatCompactEditCall(
        "replace",
        { remove_from: from, remove_to: to },
        undefined,
        { cwd: "/repo" },
      ),
      "replace demo.md",
    );
    assert.equal(
      formatCompactEditCall(
        "insert",
        { anchor: from, direction: "after", lines: ["x"] },
        undefined,
        { cwd: "/repo" },
      ),
      "insert demo.md",
    );
  } finally {
    resetRegistryForTests();
  }
});

test("call line keeps the file after replace frees the old anchors", async () => {
  resetRegistryForTests();
  await initRegistry(undefined);
  try {
    const from = allocateAnchor("/repo/demo.md", "checksum-from");
    const to = allocateAnchor("/repo/demo.md", "checksum-to");
    const state: { resolvedPath?: string } = {};
    const args = { remove_from: from, remove_to: to };
    assert.equal(
      formatCompactEditCall("replace", args, undefined, { cwd: "/repo", state }),
      "replace demo.md",
    );
    freeAnchors("/repo/demo.md");
    assert.equal(
      formatCompactEditCall("replace", args, undefined, { cwd: "/repo", state }),
      "replace demo.md",
    );
  } finally {
    resetRegistryForTests();
  }
});

test("call line shows cwd-relative file, never an absolute dump", () => {
  assert.equal(
    formatCompactEditCall(
      "replace",
      { remove_from: "pdBO", remove_to: "THGu" },
      undefined,
      {
        cwd: "/repo",
        state: { resolvedPath: "/repo/_quiet_tools_ui_probe.tmp" },
      },
    ),
    "replace _quiet_tools_ui_probe.tmp",
  );
  assert.equal(
    formatCompactEditCall(
      "replace",
      { path: "/repo/packages/core/src/compact-edit-ui.ts" },
      undefined,
      { cwd: "/repo" },
    ),
    "replace packages/core/src/compact-edit-ui.ts",
  );
  assert.equal(
    formatCompactEditCall(
      "insert",
      {},
      undefined,
      {
        cwd: "/repo",
        state: { resolvedPath: "/elsewhere/secret.ts" },
      },
    ),
    "insert secret.ts",
  );
});

test("applied result shows stats and truncated diff", () => {
  const text = formatCompactEditResult(
    "replace",
    { path: "config-seed.ts" },
    {
      details: {
        diff: [
          '-Ab12│QUIET_UI_PASSTHROUGH_KEEP = ["Agent"]',
          '+Cd34│QUIET_UI_PASSTHROUGH_KEEP = ["Agent", "replace"]',
        ].join("\n"),
        metrics: {
          classification: "applied",
          added_lines: 1,
          removed_lines: 1,
        },
      },
    },
  );
  assert.equal(
    text,
    [
      "+1 -1",
      '-QUIET_UI_PASSTHROUGH_KEEP = ["Agent"]',
      '+QUIET_UI_PASSTHROUGH_KEEP = ["Agent", "replace"]',
      "",
    ].join("\n"),
  );
});

test("completed replace result leaves a blank row before following text", () => {
  const text = formatCompactEditResult(
    "replace",
    { path: "a.ts" },
    {
      details: {
        diff: ["-Ab12│old", "+Cd34│new"].join("\n"),
        metrics: { added_lines: 1, removed_lines: 1 },
      },
    },
  );
  const lines = text.split("\n");
  assert.equal(lines.at(-1), "");
  assert.equal(lines.at(-2), "+new");
  assert.equal(
    formatCompactEditResult(
      "replace",
      { path: "a.ts" },
      { details: { diff: "+Ab12│secret" } },
      { isPartial: true },
    ),
    "Editing...",
  );
});

test("noop edits stay on the header", () => {
  assert.equal(
    formatCompactEditResult(
      "insert",
      { path: "a.ts" },
      { details: { metrics: { classification: "noop" } } },
    ),
    "noop\n",
  );
});

test("errors show the message instead of a diff", () => {
  assert.equal(
    formatCompactEditResult(
      "replace",
      { path: "a.ts" },
      {
        isError: true,
        content: [{ type: "text", text: "anchor not found" }],
        details: { diff: "+Ab12│should not appear" },
      },
    ),
    "anchor not found\n",
  );
});

test("partial results stay on the in-progress line", () => {
  assert.equal(
    formatCompactEditResult(
      "replace",
      { path: "a.ts" },
      { details: { diff: "+Ab12│secret" } },
      { isPartial: true },
    ),
    "Editing...",
  );
});

test("expanded compact wrapper hands back the original renderer", () => {
  const tool = compactEditToolUi({
    name: "replace",
    renderCall: () => new Text("FULL CALL", 0, 0),
    renderResult: () => new Text("FULL RESULT", 0, 0),
  } as never);
  const identity = {
    fg: (_color: string, text: string) => text,
  };
  const collapsed = tool.renderCall?.(
    { path: "a.ts" },
    identity as never,
    {},
  ) as Text;
  assert.match(collapsed.render(80).join("\n"), /replace a\.ts/);
  assert.doesNotMatch(collapsed.render(80).join("\n"), /FULL CALL/);

  const expanded = tool.renderCall?.({ path: "a.ts" }, identity as never, {
    expanded: true,
  }) as Text;
  assert.equal(expanded.render(80).join("\n").trim(), "FULL CALL");

  const expandedResult = tool.renderResult?.(
    {},
    { isPartial: false, expanded: true },
    identity as never,
    {},
  ) as Text;
  assert.equal(expandedResult.render(80).join("\n").trim(), "FULL RESULT");
});

test("collapsed replace title shows the relative file, not the anchor range", async () => {
  resetRegistryForTests();
  await initRegistry(undefined);
  try {
    const from = allocateAnchor("/repo/_quiet_tools_ui_probe.tmp", "checksum-from");
    const to = allocateAnchor("/repo/_quiet_tools_ui_probe.tmp", "checksum-to");
    const tool = compactEditToolUi({
      name: "replace",
      renderCall: () => new Text("FULL CALL", 0, 0),
      renderResult: () => new Text("FULL RESULT", 0, 0),
    } as never);
    const collapsed = tool.renderCall?.(
      { remove_from: from, remove_to: to },
      { fg: (_color: string, text: string) => text } as never,
      { cwd: "/repo", state: {} },
    ) as Text;
    assert.equal(
      collapsed.render(80).join("\n").trim(),
      "replace _quiet_tools_ui_probe.tmp",
    );
    assert.doesNotMatch(collapsed.render(80).join("\n"), /FULL CALL/);
    assert.doesNotMatch(collapsed.render(80).join("\n"), new RegExp(from));
  } finally {
    resetRegistryForTests();
  }
});

test("collapsed path resolve does not mutate lastComponent", () => {
  const last = new Text("STALE", 0, 0);
  const tool = compactEditToolUi({
    name: "replace",
    renderCall(
      _args: unknown,
      _theme: unknown,
      context?: { lastComponent?: Text },
    ) {
      const target = context?.lastComponent ?? new Text("", 0, 0);
      target.setText("HASHLINE CALL");
      return target;
    },
    renderResult: () => new Text("FULL RESULT", 0, 0),
  } as never);
  const collapsed = tool.renderCall?.(
    { remove_from: "Ab12", remove_to: "Cd34" },
    { fg: (_color: string, text: string) => text } as never,
    { cwd: "/repo", state: { resolvedPath: "/repo/a.ts" }, lastComponent: last },
  ) as Text;
  assert.equal(collapsed.render(80).join("\n").trim(), "replace a.ts");
  assert.equal(last.render(80).join("\n").trim(), "STALE");
  assert.doesNotMatch(collapsed.render(80).join("\n"), /HASHLINE CALL/);
});
