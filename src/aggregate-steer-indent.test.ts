import { UserMessageComponent } from "@earendil-works/pi-coding-agent";
import assert from "node:assert/strict";
import { test } from "node:test";
import { installAggregateSteerIndentPatch } from "./aggregate-steer-indent.ts";

const STEER_INDENT_WRAP_KEY = Symbol.for(
  "pi-tools.aggregate-steer-indent.v1",
);

type SteerRender = ((this: unknown, width: number) => string[]) & {
  [STEER_INDENT_WRAP_KEY]?: true;
};

interface PatchablePrototype {
  render: SteerRender;
}

const STEER_BLOCK = ["  │ ", "  │ ↳ 用户插话", "  │ 续行", "  └ "];

function withPrototype(fn: (prototype: PatchablePrototype) => void): void {
  const prototype = UserMessageComponent.prototype as unknown as PatchablePrototype;
  const originalRender = prototype.render;
  try {
    fn(prototype);
  } finally {
    prototype.render = originalRender;
  }
}

/**
 * 展开态 steer 由 `UserMessageComponent` 渲染，另两个宿主（ToolExecution /
 * AssistantMessage）碰不到它。这条锁住「第三个宿主确实接上了」。
 */
test("shifts an expanded steer rail block rendered by the user-message prototype", () => {
  withPrototype((prototype) => {
    prototype.render = function steerRender() {
      return [...STEER_BLOCK];
    } as SteerRender;

    installAggregateSteerIndentPatch();
    const out = prototype.render.call({}, 80);
    assert.deepEqual(out, [
      "   │ ",
      "   │ ↳ 用户插话",
      "   │ 续行",
      "   └ ",
    ]);
  });
});

/** 用户消息本身（不是 steer 轨道）必须原样放过。 */
test("leaves a plain user message untouched", () => {
  withPrototype((prototype) => {
    const plain = ["▎ 帮我改一下这里", "▎ 第二行"];
    prototype.render = function userRender() {
      return [...plain];
    } as SteerRender;

    installAggregateSteerIndentPatch();
    assert.deepEqual(prototype.render.call({}, 80), plain);
  });
});

/** 标记位存在时不再重复包装：reload 后 refresh 反复调用也不能套多层。 */
test("does not stack a second wrapper on the same prototype", () => {
  withPrototype((prototype) => {
    let calls = 0;
    prototype.render = function steerRender() {
      calls += 1;
      return [...STEER_BLOCK];
    } as SteerRender;

    installAggregateSteerIndentPatch();
    const wrapped = prototype.render;
    installAggregateSteerIndentPatch();
    assert.equal(prototype.render, wrapped, "wrapper must be installed once");

    prototype.render.call({}, 80);
    assert.equal(calls, 1, "inner render should run exactly once");
  });
});

/**
 * display-intent 的 reload 重装会先回退到它记录的 original，把本模块的包装丢弃。
 * 下一轮 refresh 必须能重新包上（否则展开态 steer 又缩不到了）。
 */
test("reinstalls after an outer layer replaces the wrapper", () => {
  withPrototype((prototype) => {
    prototype.render = function steerRender() {
      return [...STEER_BLOCK];
    } as SteerRender;
    installAggregateSteerIndentPatch();

    // 模拟 display-intent 重装：把 render 换成它自己的新包装。
    prototype.render = function displayIntentWrapper() {
      return [...STEER_BLOCK];
    } as SteerRender;

    installAggregateSteerIndentPatch();
    assert.deepEqual(prototype.render.call({}, 80), [
      "   │ ",
      "   │ ↳ 用户插话",
      "   │ 续行",
      "   └ ",
    ]);
  });
});
