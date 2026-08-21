import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const configFile = (agentDir: string): string =>
  join(agentDir, "extension-data", "pi-tool-display-intent", "config.json");

test("keeps Agent passthrough and strips hashline names", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-quiet-tools-config-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const configPath = configFile(agentDir);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(join(agentDir, "extension-data", "pi-tool-display-intent"), {
        recursive: true,
      }),
    );
    writeFileSync(
      configPath,
      JSON.stringify({
        tools: {
          passthrough: [
            "Agent",
            "edit",
            "read",
            "replace",
            "undo_last_replace",
            "custom_ui",
            42,
          ],
        },
      }),
      "utf8",
    );

    const { migrateQuietToolsPassthrough } = await import("./config-seed.ts");
    const migrated = JSON.parse(readFileSync(configPath, "utf8")) as {
      tools: { passthrough: unknown[] };
    };

    assert.deepEqual(migrated.tools.passthrough, [
      "Agent",
      "edit",
      "custom_ui",
      42,
    ]);
    const sparseConfig: Record<string, unknown> = { tools: {} };
    assert.equal(migrateQuietToolsPassthrough(sparseConfig), true);
    assert.deepEqual(sparseConfig, { tools: { passthrough: ["Agent"] } });
    const configWithoutTools: Record<string, unknown> = {};
    assert.equal(migrateQuietToolsPassthrough(configWithoutTools), true);
    assert.deepEqual(configWithoutTools, { tools: { passthrough: ["Agent"] } });
    assert.equal(
      migrateQuietToolsPassthrough({
        tools: { passthrough: ["Agent", "edit"] },
      }),
      false,
      "a config that already keeps Agent out of the Tools ledger should remain untouched",
    );
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("restores Agent when a previous glue version folded it into Tools", async () => {
  const { migrateQuietToolsPassthrough } = await import("./config-seed.ts");
  const aggregated: Record<string, unknown> = {
    tools: { passthrough: ["edit"] },
  };

  assert.equal(migrateQuietToolsPassthrough(aggregated), true);
  assert.deepEqual(aggregated, { tools: { passthrough: ["Agent", "edit"] } });
});

test("seeds new configurations with Agent kept outside the Tools ledger", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-quiet-tools-seed-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const { seedDisplayConfigIfMissing } = await import("./config-seed.ts");
    seedDisplayConfigIfMissing();

    const configPath = configFile(agentDir);
    assert.equal(existsSync(configPath), true);
    const seeded = JSON.parse(readFileSync(configPath, "utf8")) as {
      tools: { passthrough: string[] };
    };
    assert.deepEqual(seeded.tools.passthrough, ["Agent", "edit"]);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  }
});
