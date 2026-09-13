import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createWatchdog,
  DEFAULT_WATCHDOG_LIMITS,
  HARD_STOP_INSTRUCTION,
  HARD_STOP_NOTIFY,
  installHostWatchdog,
  NUDGE_INSTRUCTION,
  NUDGE_NOTIFY,
  type HostWatchdog,
} from "./host-watchdog.ts";

const tight = {
  bashBudget: 2,
  requestWallClockMs: 1000,
  graceTurns: 2,
  graceMs: 500,
};

test("default limits lock bashBudget at 50 and nudge on the 50th bash", () => {
  assert.deepEqual(DEFAULT_WATCHDOG_LIMITS, {
    bashBudget: 50,
    requestWallClockMs: 30 * 60 * 1000,
    graceTurns: 5,
    graceMs: 3 * 60 * 1000,
  });

  const watchdog = createWatchdog();
  watchdog.onUserRequest(0);
  for (let i = 1; i <= 49; i++) {
    const d = watchdog.onToolCall("bash", i);
    assert.equal(watchdog.phase(), "running");
    assert.equal(d.notify, undefined);
    assert.equal(d.block, undefined);
  }
  const trip = watchdog.onToolCall("bash", 50);
  assert.equal(trip.notify, "nudge");
  assert.equal(trip.block, undefined);
  assert.equal(watchdog.bashCount(), 50);
});

test("the bash that trips the budget nudges and still runs", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);

  assert.equal(watchdog.onToolCall("bash", 10).block, undefined);
  const trip = watchdog.onToolCall("bash", 20);
  assert.equal(trip.notify, "nudge");
  assert.equal(trip.block, undefined);
  assert.equal(watchdog.phase(), "nudged");
  assert.equal(watchdog.bashCount(), 2);
});

test("non-bash calls do not reset the bash count", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.onToolCall("bash", 10);
  watchdog.onToolCall("read", 20);
  watchdog.onTurnEnd(30);
  watchdog.onContext(40);
  watchdog.onToolCall("bash", 50);

  assert.equal(watchdog.bashCount(), 2);
  assert.equal(watchdog.phase(), "nudged");
});

test("the first official text of a turn resets bash and leaves grace", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.onToolCall("bash", 10);
  watchdog.onToolCall("bash", 20);
  assert.equal(watchdog.phase(), "nudged");

  assert.equal(watchdog.onOfficialText(30), true);
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.phase(), "running");
  assert.equal(watchdog.onToolCall("read", 40).block, undefined);

  assert.equal(watchdog.onOfficialText(50), false);
  watchdog.onToolCall("bash", 60);
  assert.equal(watchdog.bashCount(), 1);
  assert.equal(watchdog.phase(), "running");
});

test("a later turn's official text can reset bash again", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.onToolCall("bash", 10);
  assert.equal(watchdog.onOfficialText(20), true);
  watchdog.onToolCall("bash", 30);
  assert.equal(watchdog.bashCount(), 1);

  watchdog.onTurnStart();
  assert.equal(watchdog.onOfficialText(40), true);
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.phase(), "running");
});

test("official text after hard-stop unblocks later tools", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.onToolCall("bash", 10);
  watchdog.onToolCall("bash", 20);
  watchdog.onTurnEnd(30);
  watchdog.onTurnEnd(40);
  watchdog.onTurnEnd(50);
  assert.equal(watchdog.phase(), "hard_stop");

  watchdog.onTurnStart();
  assert.equal(watchdog.onOfficialText(60), true);
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.phase(), "running");
  assert.equal(watchdog.onToolCall("read", 70).block, undefined);
});

test("the trip turn does not consume a grace turn", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.onToolCall("bash", 10);
  watchdog.onToolCall("bash", 20);
  watchdog.onTurnEnd(30);

  assert.equal(watchdog.phase(), "nudged");
  assert.equal(watchdog.onToolCall("read", 40).block, undefined);
});

test("hard-stop starts after the extra grace turns, then blocks later tools", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.onToolCall("bash", 10);
  watchdog.onToolCall("bash", 20);
  watchdog.onTurnEnd(30);
  watchdog.onTurnEnd(40);
  watchdog.onTurnEnd(50);

  assert.equal(watchdog.phase(), "hard_stop");
  const blocked = watchdog.onToolCall("bash", 60);
  assert.equal(blocked.block, true);
  assert.equal(blocked.reason, HARD_STOP_INSTRUCTION);
  assert.equal("terminate" in blocked, false);
});

test("request wall-clock trips the nudge without waiting for the bash budget", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  const trip = watchdog.onToolCall("read", 1000);
  assert.equal(trip.notify, "nudge");
  assert.equal(watchdog.phase(), "nudged");
});

test("grace clock hard-stops even when no extra turns have finished", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.onToolCall("bash", 10);
  watchdog.onToolCall("bash", 20);
  const blocked = watchdog.onToolCall("read", 520);
  assert.equal(watchdog.phase(), "hard_stop");
  assert.equal(blocked.block, true);
});

test("onTick advances phase on wall clock without tool calls", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);

  assert.deepEqual(watchdog.onTick(999), {});
  assert.equal(watchdog.phase(), "running");

  const nudge = watchdog.onTick(1000);
  assert.equal(nudge.notify, "nudge");
  assert.equal(watchdog.phase(), "nudged");

  const hard = watchdog.onTick(1500);
  assert.equal(hard.notify, "hard_stop");
  assert.equal(watchdog.phase(), "hard_stop");
});

test("context injects the matching instruction and a new user request resets", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.onToolCall("bash", 10);
  watchdog.onToolCall("bash", 20);
  assert.equal(watchdog.onContext(30).instruction, NUDGE_INSTRUCTION);

  watchdog.onTurnEnd(40);
  watchdog.onTurnEnd(50);
  watchdog.onTurnEnd(60);
  assert.equal(watchdog.onContext(70).instruction, HARD_STOP_INSTRUCTION);

  watchdog.onUserRequest(80);
  assert.equal(watchdog.phase(), "running");
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.onContext(90).instruction, undefined);
});

test("settling the agent run clears watchdog state", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.onToolCall("bash", 10);
  watchdog.onSettled();
  assert.equal(watchdog.phase(), "idle");
  assert.equal(watchdog.bashCount(), 0);
});

test("paused wall clock does not count toward the request limit", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.pauseWallClock(200);

  assert.equal(watchdog.onTick(5000).notify, undefined);
  assert.equal(watchdog.phase(), "running");
  assert.equal(watchdog.remainingRequestMs(5000), 800);

  watchdog.resumeWallClock(5000);
  assert.equal(watchdog.onTick(5799).notify, undefined);
  const trip = watchdog.onTick(5800);
  assert.equal(trip.notify, "nudge");
  assert.equal(watchdog.phase(), "nudged");
});

test("paused grace clock does not hard-stop", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.onTick(1000);
  assert.equal(watchdog.phase(), "nudged");

  watchdog.pauseWallClock(1100);
  assert.equal(watchdog.onTick(99999).notify, undefined);
  assert.equal(watchdog.phase(), "nudged");

  watchdog.resumeWallClock(99999);
  assert.equal(watchdog.onTick(100398).notify, undefined);
  const hard = watchdog.onTick(100399);
  assert.equal(hard.notify, "hard_stop");
});

test("pause is idempotent and extra resume is ignored", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.pauseWallClock(100);
  watchdog.pauseWallClock(900);
  watchdog.resumeWallClock(600);
  watchdog.resumeWallClock(5000);

  assert.equal(watchdog.onTick(1499).notify, undefined);
  assert.equal(watchdog.onTick(1500).notify, "nudge");
});

test("a new user request clears a paused wall clock", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest(0);
  watchdog.pauseWallClock(100);
  watchdog.onUserRequest(8000);

  assert.equal(watchdog.phase(), "running");
  assert.equal(watchdog.onTick(8999).notify, undefined);
  assert.equal(watchdog.onTick(9000).notify, "nudge");
});
type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

function fakePi(): {
  pi: ExtensionAPI;
  emit: (
    event: string,
    payload: unknown,
    ctx: ExtensionContext,
  ) => Promise<unknown>;
} {
  const handlers = new Map<string, Handler[]>();
  const pi = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  } as unknown as ExtensionAPI;

  return {
    pi,
    async emit(event, payload, ctx) {
      let result: unknown;
      for (const handler of handlers.get(event) ?? []) {
        const next = await handler(payload, ctx);
        if (next !== undefined) {
          result = next;
        }
      }
      return result;
    },
  };
}

function hostCtx(notify: (message: string) => void): ExtensionContext {
  return {
    hasUI: true,
    ui: { notify },
  } as unknown as ExtensionContext;
}

function childCtx(): ExtensionContext {
  return { hasUI: false } as unknown as ExtensionContext;
}

test("installer skips child sessions and does not terminate a hard-stop block", async () => {
  const notices: string[] = [];
  const { pi, emit } = fakePi();
  const watchdog: HostWatchdog = createWatchdog(tight);
  installHostWatchdog(pi, watchdog);
  installHostWatchdog(pi, watchdog);

  const host = hostCtx((message) => notices.push(message));
  await emit("before_agent_start", {}, host);
  await emit("tool_call", { toolName: "bash" }, childCtx());
  assert.equal(watchdog.bashCount(), 0);

  await emit("tool_call", { toolName: "bash" }, host);
  await emit("agent_start", {}, host);
  assert.equal(watchdog.bashCount(), 1);
  assert.equal(watchdog.phase(), "running");

  const nudge = await emit("tool_call", { toolName: "bash" }, host);
  assert.equal(nudge, undefined);
  assert.deepEqual(notices, [NUDGE_NOTIFY]);

  await emit("turn_end", {}, host);
  await emit("turn_end", {}, host);
  await emit("turn_end", {}, host);
  const blocked = await emit("tool_call", { toolName: "read" }, host);
  assert.deepEqual(blocked, {
    block: true,
    reason: HARD_STOP_INSTRUCTION,
  });
  assert.equal(notices.at(-1), HARD_STOP_NOTIFY);

  const context = (await emit(
    "context",
    { messages: [{ role: "user", content: "go", timestamp: 1 }] },
    host,
  )) as { messages: Array<{ content: string }> };
  assert.equal(context.messages.at(-1)?.content, HARD_STOP_INSTRUCTION);
});

test("installer request timer nudges and grace timer blocks", async (t) => {
  const mockTimers = t.mock?.timers;
  if (typeof mockTimers?.enable !== "function") {
    t.skip("t.mock.timers 在本环境不可用");
    return;
  }
  mockTimers.enable({ apis: ["setTimeout", "Date"] });
  mockTimers.setTime(0);

  const notices: string[] = [];
  const { pi, emit } = fakePi();
  installHostWatchdog(pi, createWatchdog(tight));
  const host = hostCtx((message) => notices.push(message));

  await emit("before_agent_start", {}, host);
  mockTimers.tick(tight.requestWallClockMs);
  assert.deepEqual(notices, [NUDGE_NOTIFY]);

  mockTimers.tick(tight.graceMs);
  assert.deepEqual(notices, [NUDGE_NOTIFY, HARD_STOP_NOTIFY]);

  const blocked = await emit("tool_call", { toolName: "read" }, host);
  assert.deepEqual(blocked, {
    block: true,
    reason: HARD_STOP_INSTRUCTION,
  });
});

test("installer child before_agent_start does not arm request timer", async (t) => {
  const mockTimers = t.mock?.timers;
  if (typeof mockTimers?.enable !== "function") {
    t.skip("t.mock.timers 在本环境不可用");
    return;
  }
  mockTimers.enable({ apis: ["setTimeout", "Date"] });
  mockTimers.setTime(0);

  const notices: string[] = [];
  const { pi, emit } = fakePi();
  installHostWatchdog(pi, createWatchdog(tight));

  await emit("before_agent_start", {}, childCtx());
  mockTimers.tick(tight.requestWallClockMs + tight.graceMs);
  assert.equal(notices.length, 0);
});

test("installer pauses request timer while Agent is in flight", async (t) => {
  const mockTimers = t.mock?.timers;
  if (typeof mockTimers?.enable !== "function") {
    t.skip("t.mock.timers 在本环境不可用");
    return;
  }
  mockTimers.enable({ apis: ["setTimeout", "Date"] });
  mockTimers.setTime(0);

  const notices: string[] = [];
  const { pi, emit } = fakePi();
  installHostWatchdog(pi, createWatchdog(tight));
  const host = hostCtx((message) => notices.push(message));

  await emit("before_agent_start", {}, host);
  await emit("tool_call", { toolName: "Agent" }, host);
  mockTimers.tick(tight.requestWallClockMs * 5);
  assert.equal(notices.length, 0);

  await emit("tool_result", { toolName: "Agent" }, host);
  mockTimers.tick(tight.requestWallClockMs - 1);
  assert.equal(notices.length, 0);
  mockTimers.tick(1);
  assert.deepEqual(notices, [NUDGE_NOTIFY]);
});

test("installer keeps the clock paused until every in-flight Agent returns", async (t) => {
  const mockTimers = t.mock?.timers;
  if (typeof mockTimers?.enable !== "function") {
    t.skip("t.mock.timers 在本环境不可用");
    return;
  }
  mockTimers.enable({ apis: ["setTimeout", "Date"] });
  mockTimers.setTime(0);

  const notices: string[] = [];
  const { pi, emit } = fakePi();
  installHostWatchdog(pi, createWatchdog(tight));
  const host = hostCtx((message) => notices.push(message));

  await emit("before_agent_start", {}, host);
  await emit("tool_call", { toolName: "Agent" }, host);
  await emit("tool_call", { toolName: "get_subagent_result" }, host);
  await emit("tool_result", { toolName: "Agent" }, host);
  mockTimers.tick(tight.requestWallClockMs * 3);
  assert.equal(notices.length, 0);

  await emit("tool_result", { toolName: "get_subagent_result" }, host);
  mockTimers.tick(tight.requestWallClockMs);
  assert.deepEqual(notices, [NUDGE_NOTIFY]);
});

test("installer child Agent does not pause the host wall clock", async (t) => {
  const mockTimers = t.mock?.timers;
  if (typeof mockTimers?.enable !== "function") {
    t.skip("t.mock.timers 在本环境不可用");
    return;
  }
  mockTimers.enable({ apis: ["setTimeout", "Date"] });
  mockTimers.setTime(0);

  const notices: string[] = [];
  const { pi, emit } = fakePi();
  installHostWatchdog(pi, createWatchdog(tight));
  const host = hostCtx((message) => notices.push(message));

  await emit("before_agent_start", {}, host);
  await emit("tool_call", { toolName: "Agent" }, childCtx());
  mockTimers.tick(tight.requestWallClockMs);
  assert.deepEqual(notices, [NUDGE_NOTIFY]);
});

test("installer official text resets bash and cancels the grace timer", async (t) => {
  const mockTimers = t.mock?.timers;
  if (typeof mockTimers?.enable !== "function") {
    t.skip("t.mock.timers 在本环境不可用");
    return;
  }
  mockTimers.enable({ apis: ["setTimeout", "Date"] });
  mockTimers.setTime(0);

  const notices: string[] = [];
  const { pi, emit } = fakePi();
  const watchdog = createWatchdog(tight);
  installHostWatchdog(pi, watchdog);
  const host = hostCtx((message) => notices.push(message));

  await emit("before_agent_start", {}, host);
  await emit("tool_call", { toolName: "bash" }, host);
  await emit("tool_call", { toolName: "bash" }, host);
  assert.deepEqual(notices, [NUDGE_NOTIFY]);
  assert.equal(watchdog.phase(), "nudged");

  await emit("message_update", {
    message: {
      content: [{ type: "text", text: "<thinking>内部推理</thinking>" }],
    },
  }, host);
  assert.equal(watchdog.phase(), "nudged");
  assert.equal(watchdog.bashCount(), 2);

  await emit("message_update", {
    message: { content: [{ type: "text", text: "正在收口，还差回归" }] },
  }, host);
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.phase(), "running");

  mockTimers.tick(tight.graceMs);
  const blocked = await emit("tool_call", { toolName: "read" }, host);
  assert.equal(blocked, undefined);
  assert.equal(notices.at(-1), NUDGE_NOTIFY);
});

test("installer child official text does not reset the host bash count", async () => {
  const { pi, emit } = fakePi();
  const watchdog = createWatchdog(tight);
  installHostWatchdog(pi, watchdog);
  const host = hostCtx(() => {});

  await emit("before_agent_start", {}, host);
  await emit("tool_call", { toolName: "bash" }, host);
  await emit("message_update", {
    message: { content: [{ type: "text", text: "子会话正文" }] },
  }, childCtx());
  assert.equal(watchdog.bashCount(), 1);
  assert.equal(watchdog.phase(), "running");
});
