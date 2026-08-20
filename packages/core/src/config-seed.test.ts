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

test("migrates Agent into the aggregate Tools ledger without changing edit passthrough", async () => {
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

    const { removeQuietToolsPassthrough } = await import("./config-seed.ts");
    const migrated = JSON.parse(readFileSync(configPath, "utf8")) as {
      tools: { passthrough: unknown[] };
    };

    assert.deepEqual(migrated.tools.passthrough, ["edit", "custom_ui", 42]);
    const sparseConfig: Record<string, unknown> = { tools: {} };
    assert.equal(removeQuietToolsPassthrough(sparseConfig), true);
    assert.deepEqual(sparseConfig, { tools: { passthrough: [] } });
    const configWithoutTools: Record<string, unknown> = {};
    assert.equal(removeQuietToolsPassthrough(configWithoutTools), true);
    assert.deepEqual(configWithoutTools, { tools: { passthrough: [] } });
    assert.equal(
      removeQuietToolsPassthrough({ tools: { passthrough: ["edit"] } }),
      false,
      "a config that already aggregates Agent should remain untouched",
    );
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("seeds new configurations with Agent included in the Tools ledger", async () => {
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
    assert.deepEqual(seeded.tools.passthrough, ["edit"]);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  }
});
