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
  graceTurns: 2,
};

test("default limits lock bashBudget at 80 and nudge on the 80th bash", () => {
  assert.deepEqual(DEFAULT_WATCHDOG_LIMITS, {
    bashBudget: 80,
    graceTurns: 10,
  });

  const watchdog = createWatchdog();
  watchdog.onUserRequest();
  for (let i = 1; i <= 79; i++) {
    const d = watchdog.onToolCall("bash");
    assert.equal(watchdog.phase(), "running");
    assert.equal(d.notify, undefined);
    assert.equal(d.block, undefined);
  }
  const trip = watchdog.onToolCall("bash");
  assert.equal(trip.notify, "nudge");
  assert.equal(trip.block, undefined);
  assert.equal(watchdog.bashCount(), 80);
});

test("nudge copy talks about bash and visible prose, not elapsed time", () => {
  assert.match(NUDGE_INSTRUCTION, /bash 过多/);
  assert.match(NUDGE_INSTRUCTION, /可见正文/);
  assert.doesNotMatch(NUDGE_INSTRUCTION, /过长/);
  assert.doesNotMatch(NUDGE_INSTRUCTION, /长时间/);
});

test("the bash that trips the budget nudges and still runs", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest();

  assert.equal(watchdog.onToolCall("bash").block, undefined);
  const trip = watchdog.onToolCall("bash");
  assert.equal(trip.notify, "nudge");
  assert.equal(trip.block, undefined);
  assert.equal(watchdog.phase(), "nudged");
  assert.equal(watchdog.bashCount(), 2);
});

test("non-bash calls do not increment or reset the bash count", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest();
  watchdog.onToolCall("bash");
  watchdog.onToolCall("read");
  watchdog.onTurnEnd();
  watchdog.onContext();
  watchdog.onToolCall("bash");

  assert.equal(watchdog.bashCount(), 2);
  assert.equal(watchdog.phase(), "nudged");
});

test("waiting without bash never leaves running", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest();
  for (let i = 0; i < 20; i++) {
    watchdog.onToolCall("read");
    watchdog.onToolCall("Agent");
    watchdog.onTurnEnd();
  }
  assert.equal(watchdog.phase(), "running");
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.onContext().instruction, undefined);
});

test("the first official text of a turn resets bash and leaves grace", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest();
  watchdog.onToolCall("bash");
  watchdog.onToolCall("bash");
  assert.equal(watchdog.phase(), "nudged");

  assert.equal(watchdog.onOfficialText(), true);
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.phase(), "running");
  assert.equal(watchdog.onToolCall("read").block, undefined);

  assert.equal(watchdog.onOfficialText(), false);
  watchdog.onToolCall("bash");
  assert.equal(watchdog.bashCount(), 1);
  assert.equal(watchdog.phase(), "running");
});

test("a later turn's official text can reset bash again", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest();
  watchdog.onToolCall("bash");
  assert.equal(watchdog.onOfficialText(), true);
  watchdog.onToolCall("bash");
  assert.equal(watchdog.bashCount(), 1);

  watchdog.onTurnStart();
  assert.equal(watchdog.onOfficialText(), true);
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.phase(), "running");
});

test("official text after hard-stop unblocks later tools", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest();
  watchdog.onToolCall("bash");
  watchdog.onToolCall("bash");
  watchdog.onTurnEnd();
  watchdog.onTurnEnd();
  watchdog.onTurnEnd();
  assert.equal(watchdog.phase(), "hard_stop");

  watchdog.onTurnStart();
  assert.equal(watchdog.onOfficialText(), true);
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.phase(), "running");
  assert.equal(watchdog.onToolCall("read").block, undefined);
});

test("the trip turn does not consume a grace turn", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest();
  watchdog.onToolCall("bash");
  watchdog.onToolCall("bash");
  watchdog.onTurnEnd();

  assert.equal(watchdog.phase(), "nudged");
  assert.equal(watchdog.onToolCall("read").block, undefined);
});

test("hard-stop starts after the extra grace turns, then blocks later tools", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest();
  watchdog.onToolCall("bash");
  watchdog.onToolCall("bash");
  watchdog.onTurnEnd();
  watchdog.onTurnEnd();
  watchdog.onTurnEnd();

  assert.equal(watchdog.phase(), "hard_stop");
  const blocked = watchdog.onToolCall("bash");
  assert.equal(blocked.block, true);
  assert.equal(blocked.reason, HARD_STOP_INSTRUCTION);
  assert.equal("terminate" in blocked, false);
});

test("default grace is 10 turns after the trip turn", () => {
  const watchdog = createWatchdog();
  watchdog.onUserRequest();
  for (let i = 0; i < 80; i++) {
    watchdog.onToolCall("bash");
  }
  watchdog.onTurnEnd();
  for (let i = 0; i < 9; i++) {
    watchdog.onTurnEnd();
    assert.equal(watchdog.phase(), "nudged");
  }
  watchdog.onTurnEnd();
  assert.equal(watchdog.phase(), "hard_stop");
});

test("context injects the matching instruction and a new user request resets", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest();
  watchdog.onToolCall("bash");
  watchdog.onToolCall("bash");
  assert.equal(watchdog.onContext().instruction, NUDGE_INSTRUCTION);

  watchdog.onTurnEnd();
  watchdog.onTurnEnd();
  watchdog.onTurnEnd();
  assert.equal(watchdog.onContext().instruction, HARD_STOP_INSTRUCTION);

  watchdog.onUserRequest();
  assert.equal(watchdog.phase(), "running");
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.onContext().instruction, undefined);
});

test("settling the agent run clears watchdog state", () => {
  const watchdog = createWatchdog(tight);
  watchdog.onUserRequest();
  watchdog.onToolCall("bash");
  watchdog.onSettled();
  assert.equal(watchdog.phase(), "idle");
  assert.equal(watchdog.bashCount(), 0);
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

test("installer wait without bash does not nudge", async () => {
  const notices: string[] = [];
  const { pi, emit } = fakePi();
  const watchdog = createWatchdog(tight);
  installHostWatchdog(pi, watchdog);
  const host = hostCtx((message) => notices.push(message));

  await emit("before_agent_start", {}, host);
  await emit("tool_call", { toolName: "Agent" }, host);
  await emit("tool_call", { toolName: "read" }, host);
  await emit("turn_end", {}, host);
  await emit("turn_end", {}, host);
  await emit("tool_result", { toolName: "Agent" }, host);

  assert.equal(watchdog.phase(), "running");
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(notices.length, 0);
  const blocked = await emit("tool_call", { toolName: "read" }, host);
  assert.equal(blocked, undefined);
});

test("installer official text resets bash without a grace clock", async () => {
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

  await emit(
    "message_update",
    {
      message: {
        content: [{ type: "text", text: "<thinking>内部推理</thinking>" }],
      },
    },
    host,
  );
  assert.equal(watchdog.phase(), "nudged");
  assert.equal(watchdog.bashCount(), 2);

  await emit(
    "message_update",
    {
      message: { content: [{ type: "text", text: "正在收口，还差回归" }] },
    },
    host,
  );
  assert.equal(watchdog.bashCount(), 0);
  assert.equal(watchdog.phase(), "running");

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
  await emit(
    "message_update",
    {
      message: { content: [{ type: "text", text: "子会话正文" }] },
    },
    childCtx(),
  );
  assert.equal(watchdog.bashCount(), 1);
  assert.equal(watchdog.phase(), "running");
});
