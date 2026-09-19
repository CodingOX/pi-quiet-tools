import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  CHILD_HARD_STOP_INSTRUCTION,
  CHILD_NUDGE_INSTRUCTION,
  CHILD_WATCHDOG_POLICY,
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

test("nudge copy talks about bash, visible prose, and drifting off-goal", () => {
  assert.match(NUDGE_INSTRUCTION, /bash 过多/);
  assert.match(NUDGE_INSTRUCTION, /可见正文/);
  assert.match(NUDGE_INSTRUCTION, /发散/);
  assert.match(NUDGE_INSTRUCTION, /还差哪些步骤/);
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

test("child nudge copy talks to the parent about an incomplete handoff", () => {
  assert.match(CHILD_NUDGE_INSTRUCTION, /INCOMPLETE/);
  assert.match(CHILD_NUDGE_INSTRUCTION, /父代理/);
  assert.match(CHILD_HARD_STOP_INSTRUCTION, /INCOMPLETE/);
  assert.match(CHILD_HARD_STOP_INSTRUCTION, /父代理/);
  assert.doesNotMatch(CHILD_NUDGE_INSTRUCTION, /建议用户/);
  assert.doesNotMatch(CHILD_HARD_STOP_INSTRUCTION, /建议用户/);
});

test("child policy does not reset on official text and uses incomplete-handoff copy", () => {
  const watchdog = createWatchdog(tight, CHILD_WATCHDOG_POLICY);
  watchdog.onUserRequest();
  watchdog.onToolCall("bash");
  watchdog.onToolCall("bash");
  assert.equal(watchdog.phase(), "nudged");
  assert.equal(watchdog.onOfficialText(), false);
  assert.equal(watchdog.bashCount(), 2);
  assert.equal(watchdog.phase(), "nudged");
  assert.equal(watchdog.onContext().instruction, CHILD_NUDGE_INSTRUCTION);

  watchdog.onTurnEnd();
  watchdog.onTurnEnd();
  watchdog.onTurnEnd();
  const blocked = watchdog.onToolCall("read");
  assert.equal(blocked.block, true);
  assert.equal(blocked.reason, CHILD_HARD_STOP_INSTRUCTION);
  assert.equal("terminate" in blocked, false);

  watchdog.onTurnStart();
  assert.equal(watchdog.onOfficialText(), false);
  assert.equal(watchdog.onToolCall("read").block, true);
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

// 记录 severity 而不只是文案：nudge 用 "info" 走 Pi 的 dim 状态行，不用 "warning" ——
// warning 会被 interactive-mode 的 showWarning 画成满亮黄 + "Warning: " 前缀。
function hostCtx(
  notify: (message: string, type?: "info" | "warning" | "error") => void,
): ExtensionContext {
  return {
    hasUI: true,
    ui: { notify },
  } as unknown as ExtensionContext;
}

function childCtx(sessionId = "child-1"): ExtensionContext {
  return {
    hasUI: false,
    sessionManager: { getSessionId: () => sessionId },
  } as unknown as ExtensionContext;
}

test("installer nudge notifies with info severity so Pi renders a dim status line", async () => {
  const seen: Array<{ message: string; type?: string }> = [];
  const { pi, emit } = fakePi();
  installHostWatchdog(pi, createWatchdog(tight));
  const host = {
    hasUI: true,
    ui: {
      notify: (message: string, type?: "info" | "warning" | "error") => {
        seen.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;

  await emit("before_agent_start", {}, host);
  await emit("tool_call", { toolName: "bash" }, host);
  await emit("tool_call", { toolName: "bash" }, host);

  // "warning" 会被 Pi 画成满亮黄 + "Warning: " 前缀；这里锁死走 "info" 的 dim 状态行。
  assert.deepEqual(seen, [{ message: NUDGE_NOTIFY, type: "info" }]);
});

test("installer does not count child bash on the host watchdog or terminate a hard-stop block", async () => {
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

const goContext = {
  messages: [{ role: "user" as const, content: "go", timestamp: 1 }],
};

test("installer child bash budget injects incomplete handoff and does not notify", async () => {
  const notices: string[] = [];
  const { pi, emit } = fakePi();
  const hostWatchdog = createWatchdog(tight);
  installHostWatchdog(pi, hostWatchdog);
  const host = hostCtx((message) => notices.push(message));
  const child = childCtx("child-a");

  await emit("before_agent_start", {}, child);
  await emit("tool_call", { toolName: "bash" }, child);
  await emit("tool_call", { toolName: "bash" }, child);

  const context = (await emit("context", goContext, child)) as {
    messages: Array<{ content: string }>;
  };
  assert.equal(context.messages.at(-1)?.content, CHILD_NUDGE_INSTRUCTION);
  assert.equal(notices.length, 0);
  assert.equal(hostWatchdog.bashCount(), 0);
  assert.equal(hostWatchdog.phase(), "idle");

  await emit("before_agent_start", {}, host);
  await emit("tool_call", { toolName: "bash" }, host);
  assert.equal(hostWatchdog.bashCount(), 1);
  assert.equal(hostWatchdog.phase(), "running");
  assert.equal(notices.length, 0);
});

test("installer child hard-stop blocks tools with incomplete-handoff copy and no terminate", async () => {
  const notices: string[] = [];
  const { pi, emit } = fakePi();
  installHostWatchdog(pi, createWatchdog(tight));
  hostCtx((message) => notices.push(message));
  const child = childCtx("child-stop");

  await emit("before_agent_start", {}, child);
  await emit("tool_call", { toolName: "bash" }, child);
  await emit("tool_call", { toolName: "bash" }, child);
  await emit("turn_end", {}, child);
  await emit("turn_end", {}, child);
  await emit("turn_end", {}, child);

  const blocked = await emit("tool_call", { toolName: "read" }, child);
  assert.deepEqual(blocked, {
    block: true,
    reason: CHILD_HARD_STOP_INSTRUCTION,
  });
  assert.equal("terminate" in (blocked as object), false);
  assert.equal(notices.length, 0);

  await emit("turn_start", {}, child);
  await emit(
    "message_update",
    {
      message: { content: [{ type: "text", text: "INCOMPLETE 交接" }] },
    },
    child,
  );
  const stillBlocked = await emit("tool_call", { toolName: "read" }, child);
  assert.deepEqual(stillBlocked, {
    block: true,
    reason: CHILD_HARD_STOP_INSTRUCTION,
  });
});

test("installer isolates child bash budgets by session id", async () => {
  const { pi, emit } = fakePi();
  installHostWatchdog(pi, createWatchdog(tight));
  const childA = childCtx("session-a");
  const childB = childCtx("session-b");

  await emit("before_agent_start", {}, childA);
  await emit("tool_call", { toolName: "bash" }, childA);
  await emit("tool_call", { toolName: "bash" }, childA);
  const nudged = (await emit("context", goContext, childA)) as {
    messages: Array<{ content: string }>;
  };
  assert.equal(nudged.messages.at(-1)?.content, CHILD_NUDGE_INSTRUCTION);

  await emit("before_agent_start", {}, childB);
  await emit("tool_call", { toolName: "bash" }, childB);
  const quiet = await emit("context", goContext, childB);
  assert.equal(quiet, undefined);
});

test("installer child settle does not clear the host bash count", async () => {
  const { pi, emit } = fakePi();
  const hostWatchdog = createWatchdog(tight);
  installHostWatchdog(pi, hostWatchdog);
  const host = hostCtx(() => {});
  const child = childCtx("child-settle");

  await emit("before_agent_start", {}, host);
  await emit("tool_call", { toolName: "bash" }, host);
  await emit("before_agent_start", {}, child);
  await emit("tool_call", { toolName: "bash" }, child);
  await emit("agent_settled", {}, child);

  assert.equal(hostWatchdog.bashCount(), 1);
  assert.equal(hostWatchdog.phase(), "running");
});

/**
 * 跨扩展双装：Pi 给每个扩展各建一份 `pi` 对象，所以「主包 bundle 了一份 +
 * 用户又单独装了一份」时，两套 handler 会同时收到事件。若不处理，`context`
 * 会被注入两条看门狗指令，`notify` 也会弹两次。
 *
 * 策略是「后装者接管」：只有最后一次安装的 handler 会真正干活。
 */
test("a second install in the same process takes over and silences the first", async () => {
  const first = fakePi();
  const second = fakePi();
  const firstWatchdog = createWatchdog(tight);
  const secondWatchdog = createWatchdog(tight);

  installHostWatchdog(first.pi, firstWatchdog);
  installHostWatchdog(second.pi, secondWatchdog);

  const goContext = { messages: [] };
  const host = hostCtx(() => {});

  // 先装的那份必须彻底让路：账不动、notify 不弹、context 不注入。
  await first.emit("before_agent_start", {}, host);
  await first.emit("tool_call", { toolName: "bash" }, host);
  await first.emit("tool_call", { toolName: "bash" }, host);
  assert.equal(firstWatchdog.bashCount(), 0, "沉睡的看门狗不应计数");
  const silent = await first.emit("context", goContext, host);
  assert.equal(silent, undefined, "沉睡的看门狗不应注入指令");

  // 后装的那份正常接管控制权。
  await second.emit("before_agent_start", {}, host);
  await second.emit("tool_call", { toolName: "bash" }, host);
  await second.emit("tool_call", { toolName: "bash" }, host);
  assert.equal(secondWatchdog.bashCount(), 2, "接管的看门狗应正常计数");
});
