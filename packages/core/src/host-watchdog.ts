import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { hasOfficialAssistantText } from "./aggregate-keep-narration.js";

/**
 * UI-host 看门狗：人正在看的会话里，bash 失控时先 nudge 再宽限，
 * 到期拦住后续工具，逼它开口汇报。
 *
 * 只数 bash，不数墙钟——Ask / 子代理干等不会自己绊索。
 * 可见正文会重置 bash 账和宽限（沉默失控才算）；不杀正在跑的命令。
 * 子会话 (hasUI !== true) 整段跳过。
 * 硬停只 block、不 terminate —— terminate 会跳过下一轮 LLM，模型就没机会说话。
 */

export interface WatchdogLimits {
  bashBudget: number;
  graceTurns: number;
}

export const DEFAULT_WATCHDOG_LIMITS: WatchdogLimits = {
  bashBudget: 80,
  graceTurns: 10,
};

export const NUDGE_INSTRUCTION =
  "【quiet-tools 看门狗】本请求 bash 过多。用户几乎看不到你的过程。thinking、工具调用和你写给自己的指令，对用户没有意义——他们只能读可见正文，才能知道你在做什么。本回合必须先在可见正文（不要写进 thinking）用中文写清：1) 正在做什么；2) 还差哪一步就能收口。可见正文出现后看门狗会重置；之后若再连续闷头调 bash，会再次进入宽限。不要复述工具日志，不要道歉。";

export const HARD_STOP_INSTRUCTION =
  "【quiet-tools 看门狗】宽限已结束，禁止继续调用工具。立刻用中文可见正文回复（不要 thinking、不要任何工具）：1) 当前做到哪；2) 建议用户下一步做什么。各一两句。不要道歉，不要罗列已调用的工具。";

export const NUDGE_NOTIFY = "看门狗：进入宽限，请尽快收口";
export const HARD_STOP_NOTIFY = "看门狗：已禁止继续调用工具";

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
  onUserRequest(): void;
  onTurnStart(): void;
  onToolCall(toolName: string): WatchdogToolDecision;
  onTurnEnd(): WatchdogTurnDecision;
  onContext(): WatchdogContextDecision;
  /** 本回合第一次可见正文：清 bash、退出宽限/硬停。 */
  onOfficialText(): boolean;
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
  let graceTurns = 0;
  // 绊索发生在某一回合中途；那一回合的 turn_end 不算「再给」的宽限回合。
  let ignoreNextTurnEnd = false;
  // 每回合第一次正式正文才重置；同一回合后续 text_delta 不再清账。
  let officialTextResetAvailable = false;
  let lastNotified: WatchdogNotify | undefined;

  function reset(): void {
    phase = "idle";
    bashCount = 0;
    graceTurns = 0;
    ignoreNextTurnEnd = false;
    officialTextResetAvailable = false;
    lastNotified = undefined;
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

  function enterNudged(): void {
    phase = "nudged";
    graceTurns = 0;
    ignoreNextTurnEnd = true;
  }

  function advancePhase(): void {
    if (phase === "idle") {
      return;
    }
    if (phase === "running") {
      if (bashCount >= limits.bashBudget) {
        enterNudged();
      }
    }
    if (phase === "nudged") {
      if (graceTurns >= limits.graceTurns) {
        phase = "hard_stop";
      }
    }
  }

  function ensureRunning(): void {
    if (phase !== "idle") {
      return;
    }
    phase = "running";
  }

  return {
    phase: () => phase,
    bashCount: () => bashCount,
    limits: () => limits,
    onUserRequest(): void {
      reset();
      phase = "running";
      officialTextResetAvailable = true;
    },
    onTurnStart(): void {
      if (phase === "idle") {
        return;
      }
      officialTextResetAvailable = true;
    },
    onOfficialText(): boolean {
      if (phase === "idle" || !officialTextResetAvailable) {
        return false;
      }
      officialTextResetAvailable = false;
      phase = "running";
      bashCount = 0;
      graceTurns = 0;
      ignoreNextTurnEnd = false;
      lastNotified = undefined;
      return true;
    },
    onToolCall(toolName: string): WatchdogToolDecision {
      ensureRunning();
      if (toolName === "bash") {
        bashCount += 1;
      }
      advancePhase();
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
    onTurnEnd(): WatchdogTurnDecision {
      if (phase === "idle") {
        return {};
      }
      advancePhase();
      if (phase === "nudged") {
        if (ignoreNextTurnEnd) {
          ignoreNextTurnEnd = false;
        } else {
          graceTurns += 1;
          advancePhase();
        }
      }
      const notify = takeNotify();
      return notify ? { notify } : {};
    },
    onContext(): WatchdogContextDecision {
      if (phase === "idle") {
        return {};
      }
      advancePhase();
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
    onSettled(): void {
      reset();
    },
  };
}

function isUiHost(ctx: ExtensionContext | undefined): boolean {
  return ctx?.hasUI === true;
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

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!isUiHost(ctx)) {
      return;
    }
    watchdog.onUserRequest();
  });

  function handleVisibleProgress(
    ctx: ExtensionContext,
    message: unknown,
  ): void {
    if (!isUiHost(ctx) || !hasOfficialAssistantText(message)) {
      return;
    }
    watchdog.onOfficialText();
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
    const decision = watchdog.onToolCall(event.toolName);
    announce(ctx, decision.notify);
    if (decision.block) {
      return { block: true, reason: decision.reason };
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!isUiHost(ctx)) {
      return;
    }
    announce(ctx, watchdog.onTurnEnd().notify);
  });

  pi.on("context", async (event, ctx) => {
    if (!isUiHost(ctx)) {
      return;
    }
    const decision = watchdog.onContext();
    announce(ctx, decision.notify);
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
    watchdog.onSettled();
  });

  // runtime 拆掉时无条件释放；不看 hasUI，避免 host 标记丢失时把计数带到下一会话。
  pi.on("session_shutdown", async () => {
    watchdog.onSettled();
  });
}
