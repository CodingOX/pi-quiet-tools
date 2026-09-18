import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_MARKDOWN_ENHANCE_CONFIG,
  getMarkdownEnhanceConfigPath,
  loadMarkdownEnhanceConfig,
} from "./config.ts";
import { createMarkdownTransformer } from "./transforms.ts";

/**
 * 配置层测试。
 *
 * 重点覆盖「不认识 / 坏掉 / 部分缺失」三种磁盘状态——用户在换机或手改 config
 * 时最可能留下的就是这三种。任何一个字段坏掉都不该让整个扩展消失。
 */

/** 在临时目录造一个 config.json，返回路径。 */
function withConfigFile(raw: string | undefined): {
  path: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "md-enhance-"));
  const path = join(dir, "config.json");
  if (raw !== undefined) {
    writeFileSync(path, raw, "utf8");
  }
  return {
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("配置文件缺失时写出默认值并返回默认配置", () => {
  const { path, cleanup } = withConfigFile(undefined);
  try {
    const config = loadMarkdownEnhanceConfig(path);
    assert.deepEqual(config, DEFAULT_MARKDOWN_ENHANCE_CONFIG);
    // 默认值里两个口味开关必须是关的——这是「不强加个人 workaround」的契约
    assert.equal(config.deCircled, false);
    assert.equal(config.hideCodeFence, false);
    assert.equal(config.enabled, true);
    assert.equal(config.common, true);
  } finally {
    cleanup();
  }
});

test("坏 JSON 退回默认配置而不是抛错", () => {
  const { path, cleanup } = withConfigFile("{ 这不是 JSON");
  try {
    assert.deepEqual(
      loadMarkdownEnhanceConfig(path),
      DEFAULT_MARKDOWN_ENHANCE_CONFIG,
    );
  } finally {
    cleanup();
  }
});

test("非对象 JSON 退回默认配置", () => {
  const { path, cleanup } = withConfigFile("[1,2,3]");
  try {
    assert.deepEqual(
      loadMarkdownEnhanceConfig(path),
      DEFAULT_MARKDOWN_ENHANCE_CONFIG,
    );
  } finally {
    cleanup();
  }
});

test("部分字段缺失时逐字段补默认值", () => {
  const { path, cleanup } = withConfigFile(JSON.stringify({ deCircled: true }));
  try {
    assert.deepEqual(loadMarkdownEnhanceConfig(path), {
      enabled: true,
      common: true,
      deCircled: true,
      hideCodeFence: false,
    });
  } finally {
    cleanup();
  }
});

test("字段类型错误时该字段单独退回默认", () => {
  const { path, cleanup } = withConfigFile(
    JSON.stringify({
      enabled: "yes", // 字符串不是布尔
      common: true,
      deCircled: 1, // 数字不是布尔
      hideCodeFence: true,
    }),
  );
  try {
    assert.deepEqual(loadMarkdownEnhanceConfig(path), {
      enabled: true,
      common: true,
      deCircled: false,
      hideCodeFence: true,
    });
  } finally {
    cleanup();
  }
});

test("完整配置原样读出", () => {
  const wanted = {
    enabled: true,
    common: false,
    deCircled: true,
    hideCodeFence: true,
  };
  const { path, cleanup } = withConfigFile(JSON.stringify(wanted));
  try {
    assert.deepEqual(loadMarkdownEnhanceConfig(path), wanted);
  } finally {
    cleanup();
  }
});

test("配置路径遵循 agentDir 约定", () => {
  assert.equal(
    getMarkdownEnhanceConfigPath("/tmp/agent"),
    "/tmp/agent/extension-data/pi-quiet-tools-markdown-enhance/config.json",
  );
});

// ============================================================================
// 开关对管道的影响
// ============================================================================

const ctx = {
  messageType: "assistant",
  isStreaming: false,
  availableWidth: 100,
};
const allOn = { common: true, deCircled: true };
const commonOnly = { common: true, deCircled: false };

test("common 关闭时只保留跨行链接规整，不做渲染", () => {
  const transform = createMarkdownTransformer({
    common: false,
    deCircled: true,
  });
  const md = "```mermaid\ngraph LR\nA --> B\n```\n\n方案② 看 https://example.com";
  const out = transform(md, ctx);
  // 图不渲染、圈数字不改、URL 不加链接——只剩跨行链接规整（本例无影响）
  assert.ok(out.includes("```mermaid"), JSON.stringify(out));
  assert.ok(out.includes("方案②"), JSON.stringify(out));
  assert.ok(out.includes("https://example.com") && !out.includes("[https://example.com]"));
});

test("deCircled 关闭时圈数字保持原样，其它增强照常", () => {
  const transform = createMarkdownTransformer(commonOnly);
  const out = transform("方案② 看 https://example.com", ctx);
  assert.ok(out.includes("方案②"), JSON.stringify(out));
  // URL 仍然转链接
  assert.ok(out.includes("[https://example.com](https://example.com)"));
});

test("deCircled 开启时圈数字转半角括号", () => {
  const transform = createMarkdownTransformer(allOn);
  assert.strictEqual(transform("方案②引入，共⑩项", ctx), "方案(2)引入，共(10)项");
});

test("流式态只做跨行链接规整，不触发渲染", () => {
  const transform = createMarkdownTransformer(allOn);
  const md = "```mermaid\ngraph LR\nA --> B\n```";
  assert.strictEqual(
    transform(md, { ...ctx, isStreaming: true }),
    md,
  );
});

test("thinking 态完全不动，连跨行链接也不规整", () => {
  const transform = createMarkdownTransformer(allOn);
  const md = "```mermaid\ngraph LR\nA --> B\n```\n\n> [!NOTE] 提示\n\n方案② 看 https://example.com";
  assert.strictEqual(
    transform(md, { messageType: "assistant-thinking", isStreaming: false, availableWidth: 100 }),
    md,
  );
});
