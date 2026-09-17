import assert from "node:assert/strict";
import { test } from "node:test";
import { formatQuietSubagentNotifications } from "./quiet-subagent-notifications.ts";

test("compresses successful notifications without transcript metadata", () => {
  assert.deepEqual(
    formatQuietSubagentNotifications({
      description: "审查 NATS 幂等链路",
      status: "completed",
      toolUses: 24,
      totalTokens: 100_100,
      outputFile: "/tmp/agent.output",
      resultPreview: "A long report that belongs in get_subagent_result.",
    }),
    ["✓ 审查 NATS 幂等链路 completed"],
  );
});

test("renders grouped completions as compact per-agent rows", () => {
  assert.deepEqual(
    formatQuietSubagentNotifications({
      description: "实现 A",
      status: "completed",
      others: [{ description: "实现 B", status: "steered" }],
    }),
    ["✓ 实现 A completed", "✓ 实现 B completed (steered)"],
  );
});

test("redacts failure metadata and ignores result previews", () => {
  const lines = formatQuietSubagentNotifications({
    description: "编译模块",
    status: "error",
    error: "Build failed at /tmp/agent/build.log transcript: /var/tmp/agent.output",
    resultPreview: "The complete private result must not appear.",
    outputFile: "/tmp/agent.output",
  });

  assert.deepEqual(lines, ["✗ 编译模块 error: [redacted]"]);
  assert.equal(lines.join("\n").includes("/tmp/agent"), false);
  assert.equal(lines.join("\n").includes("transcript"), false);
  assert.equal(lines.join("\n").includes("private result"), false);
});

test("warns when notification details are malformed instead of falling back to raw XML", () => {
  assert.deepEqual(
    formatQuietSubagentNotifications(undefined),
    ["! Agent notification details unavailable"],
  );
  assert.deepEqual(
    formatQuietSubagentNotifications([]),
    ["! Agent notification details unavailable"],
  );
});

test("treats unknown, incomplete, and non-exact statuses as warnings", () => {
  assert.deepEqual(
    formatQuietSubagentNotifications({ description: "发布任务", status: "pending-review" }),
    ["! 发布任务 unknown status: pending-review"],
  );
  assert.deepEqual(
    formatQuietSubagentNotifications({ description: "发布任务" }),
    ["! Agent notification details unavailable"],
  );
  assert.deepEqual(
    formatQuietSubagentNotifications({ status: "completed" }),
    ["! Agent notification details unavailable"],
  );
  assert.deepEqual(
    formatQuietSubagentNotifications({ description: "发布任务", status: " COMPLETED " }),
    ["! 发布任务 unknown status: COMPLETED"],
  );
  assert.deepEqual(
    formatQuietSubagentNotifications({ description: "发布任务", status: "completed " }),
    ["! 发布任务 unknown status: completed"],
  );
});

test("uses error-only, sanitized details for stopped and aborted agents", () => {
  const stopped = formatQuietSubagentNotifications({
    description: "索引任务",
    status: "stopped",
    resultPreview: "Private result transcript: /tmp/stopped.output",
  });
  const aborted = formatQuietSubagentNotifications({
    description: "索引任务",
    status: "aborted",
    error: "Cancelled while reading /var/tmp/source.ts",
  });

  assert.deepEqual(stopped, ["✗ 索引任务 stopped: No error details."]);
  assert.deepEqual(aborted, ["✗ 索引任务 aborted: [path]"]);
  assert.equal(stopped.join("\n").includes("Private result"), false);
});

test("warns for malformed entries in a grouped notification", () => {
  assert.deepEqual(
    formatQuietSubagentNotifications({
      description: "有效任务",
      status: "completed",
      others: [null, "invalid", []],
    }),
    [
      "✓ 有效任务 completed",
      "! Agent notification details unavailable",
      "! Agent notification details unavailable",
      "! Agent notification details unavailable",
    ],
  );
  assert.deepEqual(
    formatQuietSubagentNotifications({
      description: "有效任务",
      status: "completed",
      others: "invalid",
    }),
    ["✓ 有效任务 completed", "! Agent notification details unavailable"],
  );
});

test("redacts transcript metadata and paths from every dynamic notification field", () => {
  const lines = formatQuietSubagentNotifications({
    description: "审查 /tmp/private/request.ts",
    status: "completed",
    others: [
      {
        description: String.raw`检查 \\server\private\agent.output`,
        status: "completed",
      },
      {
        description: "失败任务",
        status: "error",
        error: String.raw`Full transcript available at: \\server\private\agent.output`,
      },
    ],
  });

  assert.deepEqual(lines, [
    "✓ [path] completed",
    "✓ [path] completed",
    "✗ 失败任务 error: [redacted]",
  ]);
  assert.equal(lines.join("\n").includes("transcript"), false);
  assert.equal(lines.join("\n").includes("server"), false);
  assert.equal(lines.join("\n").includes("private"), false);
});

test("redacts POSIX and Windows path variants plus forbidden metadata", () => {
  const descriptions = [
    "/Users/alice/My Private/file.txt",
    "/",
    "~/",
    String.raw`\Users\Alice\secret.txt`,
    String.raw`folder\private\secret.txt`,
    "outputFile=SECRET",
    "transcript_path: SECRET",
  ];

  const lines = descriptions.map((description) => (
    formatQuietSubagentNotifications({ description, status: "completed" })[0]
  ));

  assert.deepEqual(lines, [
    "✓ [path] completed",
    "✓ [path] completed",
    "✓ [path] completed",
    "✓ [path] completed",
    "✓ [path] completed",
    "✓ [redacted] completed",
    "✓ [redacted] completed",
  ]);
});

test("strips terminal control sequences from dynamic notification fields", () => {
  const oscLink = "\x1B]8;;https://example.test\x1B\\failure\x1B]8;;\x1B\\";
  const lines = formatQuietSubagentNotifications({
    description: "\x1B[2J检查任务",
    status: "completed",
    others: [
      { description: "\0清理任务", status: "completed" },
      { description: "失败任务", status: "error", error: oscLink },
    ],
  });

  assert.deepEqual(lines, [
    "✓ 检查任务 completed",
    "✓ 清理任务 completed",
    "✗ 失败任务 error: failure",
  ]);
  assert.equal(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(lines.join("\n")), false);
});
