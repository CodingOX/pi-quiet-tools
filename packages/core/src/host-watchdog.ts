import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { hasOfficialAssistantText } from "./aggregate-keep-narration.js";

/**
 * UI-host 看门狗：人正在看的会话里，bash 失控或长时间不收口时，
 * 先 nudge 再宽限，到期拦住后续工具，逼它开口汇报。
 *
 * 可见正文会重置 bash 账和宽限（沉默失控才算）；不杀正在跑的命令。
 * 子会话 (hasUI !== true) 整段跳过。
 * 硬停只 block、不 terminate —— terminate 会跳过下一轮 LLM，模型就没机会说话。
 */

export interface WatchdogLimits {
  bashBudget: number;
  /** 从用户请求起算到 nudge 的墙钟上限（靠 installer 定时器驱动） */
  requestWallClockMs: number;
  graceTurns: number;
  graceMs: number;
}

export const DEFAULT_WATCHDOG_LIMITS: WatchdogLimits = {
  bashBudget: 50,
  requestWallClockMs: 30 * 60 * 1000,
  graceTurns: 5,
  graceMs: 3 * 60 * 1000,
};

export const NUDGE_INSTRUCTION =
  "【quiet-tools 看门狗】本请求已过长或 bash 过多。用户几乎看不到你的过程。本回合必须先在可见正文（不要写进 thinking）用中文写清：1) 正在做什么；2) 还差哪一步就能收口。可见正文出现后看门狗会重置；之后若再长时间闷头调工具，会再次进入宽限。不要复述工具日志，不要道歉。";

export const HARD_STOP_INSTRUCTION =
  "【quiet-tools 看门狗】宽限已结束，禁止继续调用工具。立刻用中文可见正文回复（不要 thinking、不要任何工具）：1) 当前做到哪；2) 建议用户下一步做什么。各一两句。不要道歉，不要罗列已调用的工具。";

export const NUDGE_NOTIFY = "看门狗：进入宽限，请尽快收口";
export const HARD_STOP_NOTIFY = "看门狗：已禁止继续调用工具";

/** 主代理把活丢给子代理的工具。这段等待不计入 host 墙钟。 */
export const HOST_DELEGATE_TOOL_NAMES = new Set([
  "Agent",
  "get_subagent_result",
]);

const WATCHDOG_INSTALL_KEY = Symbol.for("pi-quiet-tools.host-watchdog.v1");

export type WatchdogPhase = "idle" | "running" | "nudged" | "hard_stop";
export type WatchdogNotify = "nudge" | "hard_stop";

export interface WatchdogToolDecision {
  block?: true;
  reason?: string;
  notify?: WatchdogNotify;
}

export interface WatchdogTurnDecision {
  notify?: WatchdogNotify;
}

export interface WatchdogContextDecision {
  instruction?: string;
  notify?: WatchdogNotify;
}

export interface HostWatchdog {
  phase(): WatchdogPhase;
  bashCount(): number;
  limits(): WatchdogLimits;
  onUserRequest(nowMs: number): void;
  onTurnStart(): void;
  onToolCall(toolName: string, nowMs: number): WatchdogToolDecision;
  onTurnEnd(nowMs: number): WatchdogTurnDecision;
  onContext(nowMs: number): WatchdogContextDecision;
  onTick(nowMs: number): WatchdogTurnDecision;
  /** 本回合第一次可见正文：清 bash、退出宽限/硬停、墙钟从现在重计。 */
  onOfficialText(nowMs: number): boolean;
  pauseWallClock(nowMs: number): void;
  resumeWallClock(nowMs: number): void;
  remainingRequestMs(nowMs: number): number;
  remainingGraceMs(nowMs: number): number;

  onSettled(): void;
}

interface PiWithWatchdog extends ExtensionAPI {
  [WATCHDOG_INSTALL_KEY]?: true;
}

export function createWatchdog(
  limits: WatchdogLimits = DEFAULT_WATCHDOG_LIMITS,
): HostWatchdog {
  let phase: WatchdogPhase = "idle";
  let bashCount = 0;
  let startedAtMs = 0;
  let graceStartedAtMs = 0;
  let graceTurns = 0;
  // 绊索发生在某一回合中途；那一回合的 turn_end 不算「再给」的 5 回合。
  let ignoreNextTurnEnd = false;
  // 每回合第一次正式正文才重置；同一回合后续 text_delta 不再清账。
  let officialTextResetAvailable = false;
  let lastNotified: WatchdogNotify | undefined;
  // 墙钟冻结：effectiveNow = (pausedAt ?? now) - clockOffset。只在 host 等子代理时用。
  let clockOffsetMs = 0;
  let pausedAtMs: number | undefined;

  function reset(): void {
    phase = "idle";
    bashCount = 0;
    startedAtMs = 0;
    graceStartedAtMs = 0;
    graceTurns = 0;
    ignoreNextTurnEnd = false;
    officialTextResetAvailable = false;
    lastNotified = undefined;
    clockOffsetMs = 0;
    pausedAtMs = undefined;
  }

  function takeNotify(): WatchdogNotify | undefined {
    if (phase === "nudged" && lastNotified !== "nudge") {
      lastNotified = "nudge";
      return "nudge";
    }
    if (phase === "hard_stop" && lastNotified !== "hard_stop") {
      lastNotified = "hard_stop";
      return "hard_stop";
    }
    return undefined;
  }

  function enterNudged(nowMs: number): void {
    phase = "nudged";
    graceStartedAtMs = nowMs;
    graceTurns = 0;
    ignoreNextTurnEnd = true;
  }

  function effectiveNow(nowMs: number): number {
    return (pausedAtMs ?? nowMs) - clockOffsetMs;
  }

  function advancePhase(nowMs: number): void {
    if (phase === "idle") {
      return;
    }
    // 比较一律走有效时钟，暂停期间真实 Date.now() 再大也不该绊索
    const t = effectiveNow(nowMs);
    if (phase === "running") {
      const overBash = bashCount >= limits.bashBudget;
      const overTime = t - startedAtMs >= limits.requestWallClockMs;
      if (overBash || overTime) {
        enterNudged(t);
      }
    }
    if (phase === "nudged") {
      const overTurns = graceTurns >= limits.graceTurns;
      const overGrace = t - graceStartedAtMs >= limits.graceMs;
      if (overTurns || overGrace) {
        phase = "hard_stop";
      }
    }
  }

  function ensureRunning(nowMs: number): void {
    if (phase !== "idle") {
      return;
    }
    phase = "running";
    startedAtMs = effectiveNow(nowMs);
  }

  return {
    phase: () => phase,
    bashCount: () => bashCount,
    limits: () => limits,
    onUserRequest(nowMs: number): void {
      reset();
      phase = "running";
      startedAtMs = nowMs;
      officialTextResetAvailable = true;
    },
    onTurnStart(): void {
      if (phase === "idle") {
        return;
      }
      officialTextResetAvailable = true;
    },
    onOfficialText(nowMs: number): boolean {
      if (phase === "idle" || !officialTextResetAvailable) {
        return false;
      }
      officialTextResetAvailable = false;
      phase = "running";
      bashCount = 0;
      startedAtMs = effectiveNow(nowMs);
      graceStartedAtMs = 0;
      graceTurns = 0;
      ignoreNextTurnEnd = false;
      lastNotified = undefined;
      return true;
    },
    onToolCall(toolName: string, nowMs: number): WatchdogToolDecision {
      ensureRunning(nowMs);
      if (toolName === "bash") {
        bashCount += 1;
      }
      advancePhase(nowMs);
      const decision: WatchdogToolDecision = {};
      const notify = takeNotify();
      if (notify) {
        decision.notify = notify;
      }
      if (phase === "hard_stop") {
        decision.block = true;
        decision.reason = HARD_STOP_INSTRUCTION;
      }
      return decision;
    },
    onTurnEnd(nowMs: number): WatchdogTurnDecision {
      if (phase === "idle") {
        return {};
      }
      advancePhase(nowMs);
      if (phase === "nudged") {
        if (ignoreNextTurnEnd) {
          ignoreNextTurnEnd = false;
        } else {
          graceTurns += 1;
          advancePhase(nowMs);
        }
      }
      const notify = takeNotify();
      return notify ? { notify } : {};
    },
    onContext(nowMs: number): WatchdogContextDecision {
      if (phase === "idle") {
        return {};
      }
      advancePhase(nowMs);
      const decision: WatchdogContextDecision = {};
      const notify = takeNotify();
      if (notify) {
        decision.notify = notify;
      }
      if (phase === "nudged") {
        decision.instruction = NUDGE_INSTRUCTION;
      } else if (phase === "hard_stop") {
        decision.instruction = HARD_STOP_INSTRUCTION;
      }
      return decision;
    },
    onTick(nowMs: number): WatchdogTurnDecision {
      if (phase === "idle") {
        return {};
      }
      advancePhase(nowMs);
      const notify = takeNotify();
      return notify ? { notify } : {};
    },
    pauseWallClock(nowMs: number): void {
      if (phase === "idle" || pausedAtMs !== undefined) {
        return;
      }
      pausedAtMs = nowMs;
    },
    resumeWallClock(nowMs: number): void {
      if (pausedAtMs === undefined) {
        return;
      }
      clockOffsetMs += Math.max(0, nowMs - pausedAtMs);
      pausedAtMs = undefined;
    },
    remainingRequestMs(nowMs: number): number {
      if (phase !== "running") {
        return 0;
      }
      return Math.max(
        0,
        limits.requestWallClockMs - (effectiveNow(nowMs) - startedAtMs),
      );
    },
    remainingGraceMs(nowMs: number): number {
      if (phase !== "nudged") {
        return 0;
      }
      return Math.max(
        0,
        limits.graceMs - (effectiveNow(nowMs) - graceStartedAtMs),
      );
    },
    onSettled(): void {
      reset();
    },
  };
}

function isUiHost(ctx: ExtensionContext | undefined): boolean {
  return ctx?.hasUI === true;
}

function isHostDelegateTool(toolName: string): boolean {
  return HOST_DELEGATE_TOOL_NAMES.has(toolName);
}

function announce(
  ctx: ExtensionContext | undefined,
  notify: WatchdogNotify | undefined,
): void {
  if (!notify || !isUiHost(ctx)) {
    return;
  }
  const message = notify === "nudge" ? NUDGE_NOTIFY : HARD_STOP_NOTIFY;
  ctx?.ui.notify(message, "warning");
}

function injectInstruction(
  messages: ContextEvent["messages"],
  instruction: string,
  nowMs: number,
): ContextEvent["messages"] {
  return [
    ...messages,
    {
      role: "user",
      content: instruction,
      timestamp: nowMs,
    },
  ];
}

export function installHostWatchdog(
  pi: ExtensionAPI,
  watchdog: HostWatchdog = createWatchdog(),
): void {
  const target = pi as PiWithWatchdog;
  if (target[WATCHDOG_INSTALL_KEY]) {
    return;
  }
  target[WATCHDOG_INSTALL_KEY] = true;

  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastHostCtx: ExtensionContext | undefined;
  let delegateInFlight = 0;

  function clearTimers(): void {
    if (requestTimer !== undefined) {
      clearTimeout(requestTimer);
      requestTimer = undefined;
    }
    if (graceTimer !== undefined) {
      clearTimeout(graceTimer);
      graceTimer = undefined;
    }
  }

  function fireGraceTimer(): void {
    graceTimer = undefined;
    const decision = watchdog.onTick(Date.now());
    announce(lastHostCtx, decision.notify);
    if (decision.notify === "hard_stop") {
      clearTimers();
    }
  }

  function fireRequestTimer(): void {
    requestTimer = undefined;
    const decision = watchdog.onTick(Date.now());
    announce(lastHostCtx, decision.notify);
    if (decision.notify === "nudge") {
      armGraceTimer();
    } else if (decision.notify === "hard_stop") {
      clearTimers();
    }
  }

  function armGraceTimer(): void {
    if (requestTimer !== undefined) {
      clearTimeout(requestTimer);
      requestTimer = undefined;
    }
    if (graceTimer !== undefined) {
      clearTimeout(graceTimer);
    }
    const delay = watchdog.remainingGraceMs(Date.now());
    if (delay <= 0) {
      fireGraceTimer();
      return;
    }
    graceTimer = setTimeout(() => {
      fireGraceTimer();
    }, delay);
    graceTimer.unref?.();
  }

  function armRequestTimer(): void {
    if (requestTimer !== undefined) {
      clearTimeout(requestTimer);
    }
    const delay = watchdog.remainingRequestMs(Date.now());
    if (delay <= 0) {
      fireRequestTimer();
      return;
    }
    requestTimer = setTimeout(() => {
      fireRequestTimer();
    }, delay);
    requestTimer.unref?.();
  }

  function rearmAfterResume(): void {
    const phase = watchdog.phase();
    if (phase === "running") {
      armRequestTimer();
    } else if (phase === "nudged") {
      armGraceTimer();
    }
  }

  // 引用计数：并行 Agent 全部回来才解冻。冻的是墙钟，不是 bash 预算。
  function pauseForDelegate(ctx: ExtensionContext): void {
    delegateInFlight += 1;
    if (delegateInFlight !== 1) {
      return;
    }
    lastHostCtx = ctx;
    watchdog.pauseWallClock(Date.now());
    clearTimers();
  }

  function resumeForDelegate(): void {
    if (delegateInFlight === 0) {
      return;
    }
    delegateInFlight -= 1;
    if (delegateInFlight !== 0) {
      return;
    }
    watchdog.resumeWallClock(Date.now());
    rearmAfterResume();
  }

  function handleHostNotify(
    ctx: ExtensionContext,
    notify: WatchdogNotify | undefined,
  ): void {
    lastHostCtx = ctx;
    announce(ctx, notify);
    if (delegateInFlight > 0) {
      return;
    }
    if (notify === "nudge") {
      armGraceTimer();
    } else if (notify === "hard_stop") {
      clearTimers();
    }
  }

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!isUiHost(ctx)) {
      return;
    }
    lastHostCtx = ctx;
    delegateInFlight = 0;
    clearTimers();
    watchdog.onUserRequest(Date.now());
    // 墙钟靠真实定时器推进，不靠 tool_call 轮询 elapsed
    armRequestTimer();
  });

  function handleVisibleProgress(
    ctx: ExtensionContext,
    message: unknown,
  ): void {
    if (!isUiHost(ctx) || !hasOfficialAssistantText(message)) {
      return;
    }
    if (!watchdog.onOfficialText(Date.now())) {
      return;
    }
    lastHostCtx = ctx;
    if (delegateInFlight > 0) {
      return;
    }
    clearTimers();
    armRequestTimer();
  }

  pi.on("turn_start", async (_event, ctx) => {
    if (!isUiHost(ctx)) {
      return;
    }
    watchdog.onTurnStart();
  });

  pi.on("message_update", async (event, ctx) => {
    handleVisibleProgress(ctx, event.message);
  });

  pi.on("message_end", async (event, ctx) => {
    handleVisibleProgress(ctx, event.message);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isUiHost(ctx)) {
      return;
    }
    const decision = watchdog.onToolCall(event.toolName, Date.now());
    handleHostNotify(ctx, decision.notify);
    if (decision.block) {
      return { block: true, reason: decision.reason };
    }
    if (isHostDelegateTool(event.toolName)) {
      pauseForDelegate(ctx);
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!isUiHost(ctx)) {
      return;
    }
    if (isHostDelegateTool(event.toolName)) {
      resumeForDelegate();
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!isUiHost(ctx)) {
      return;
    }
    handleHostNotify(ctx, watchdog.onTurnEnd(Date.now()).notify);
  });

  pi.on("context", async (event, ctx) => {
    if (!isUiHost(ctx)) {
      return;
    }
    const decision = watchdog.onContext(Date.now());
    handleHostNotify(ctx, decision.notify);
    if (!decision.instruction) {
      return;
    }
    return {
      messages: injectInstruction(
        event.messages,
        decision.instruction,
        Date.now(),
      ),
    };
  });

  // 请求真正结束才清零。compaction / retry 走 agent_start，不会进这里。
  pi.on("agent_settled", async (_event, ctx) => {
    if (!isUiHost(ctx)) {
      return;
    }
    delegateInFlight = 0;
    clearTimers();
    watchdog.onSettled();
  });

  // runtime 拆掉时无条件释放；不看 hasUI，避免 host 标记丢失时把计数带到下一会话。
  pi.on("session_shutdown", async () => {
    delegateInFlight = 0;
    clearTimers();
    watchdog.onSettled();
  });
}
