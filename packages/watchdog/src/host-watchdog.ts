import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { hasOfficialAssistantText } from "./assistant-text.js";

/**
 * 看门狗：人正在看的会话里，bash 失控时先 nudge 再宽限，到期拦住后续工具，逼它开口汇报。
 * 子会话同一套 80+10，但开口不清零——父代理看不见子会话正文，开口续跑等于没汇报。
 * 子会话到点是交未完成卷并结束本轮，不是给用户播报。
 *
 * 只数 bash，不数墙钟——Ask / 子代理干等不会自己绊索。
 * 可见正文只重置 UI-host 的 bash 账和宽限；不杀正在跑的命令。
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

export interface WatchdogPolicy {
  /** host 开口=人看见进度所以清零；child 开口父代理看不见，清零会放它继续闷跑。 */
  resetOnOfficialText: boolean;
  nudgeInstruction: string;
  hardStopInstruction: string;
}

export const NUDGE_INSTRUCTION =
  "【quiet-tools 看门狗】本请求 bash 过多。用户几乎看不到你的过程。thinking、工具调用和你写给自己的指令，对用户没有意义——他们只能读可见正文，才能知道你在做什么。本回合必须先在可见正文（不要写进 thinking）用中文写清：1) 正在做什么；2) 是否仍专注于目标、有没有过度发散；3) 还差哪些步骤就能收口。可见正文出现后看门狗会重置；之后若再连续闷头调 bash，会再次进入宽限。不要复述工具日志，不要道歉。";

export const HARD_STOP_INSTRUCTION =
  "【quiet-tools 看门狗】宽限已结束，禁止继续调用工具。立刻用中文可见正文回复（不要 thinking、不要任何工具）：1) 当前做到哪；2) 建议用户下一步做什么。各一两句。不要道歉，不要罗列已调用的工具。";

export const CHILD_NUDGE_INSTRUCTION =
  "【quiet-tools 看门狗】本请求 bash 过多。你是子代理，父代理正在等你交卷；你写在本会话里的正文他们看不见。立刻停止继续调用工具，用可见正文向父代理交一份未完成交接（不要写进 thinking）：1) 已经完成什么；2) 还没完成什么；3) 建议父代理 resume 你还是自己接着干。第一行写 INCOMPLETE。不要道歉，不要复述工具日志。";

export const CHILD_HARD_STOP_INSTRUCTION =
  "【quiet-tools 看门狗】宽限已结束，禁止继续调用工具。立刻只用可见正文向父代理交未完成交接（不要 thinking、不要任何工具）：1) 已经完成什么；2) 还没完成什么；3) 建议父代理下一步。第一行写 INCOMPLETE。不要道歉。";

export const HOST_WATCHDOG_POLICY: WatchdogPolicy = {
  resetOnOfficialText: true,
  nudgeInstruction: NUDGE_INSTRUCTION,
  hardStopInstruction: HARD_STOP_INSTRUCTION,
};

export const CHILD_WATCHDOG_POLICY: WatchdogPolicy = {
  resetOnOfficialText: false,
  nudgeInstruction: CHILD_NUDGE_INSTRUCTION,
  hardStopInstruction: CHILD_HARD_STOP_INSTRUCTION,
};

/**
 * 人类可见的提示行（`ctx.ui.notify`）。
 *
 * ⚠️ 这两条**只给人看**，不进模型上下文；模型看到的是 `context` 事件注入的
 * `NUDGE_INSTRUCTION` / `HARD_STOP_INSTRUCTION`。所以它们的口吻、详略都可以和指令
 * 分开定 —— 别把指令里的长句抄到这里。
 *
 * 为什么 nudge 用「已请模型汇报」这种陈述句，而不是「请尽快收口」：第一档本来就是
 * 「叫它开口」而不是「叫它收尾」，指令里也明说汇报后可以继续。旧文案在后半句催收口，
 * 和指令自相矛盾。
 */
export const NUDGE_NOTIFY = "看门狗：bash 过多，已请模型汇报进度";
export const HARD_STOP_NOTIFY = "看门狗：已禁止继续调用工具";

const WATCHDOG_INSTALL_KEY = Symbol.for("pi-quiet-tools.host-watchdog.v1");

/**
 * 跨扩展双装守卫。
 *
 * 为什么不能只靠 `pi[Symbol.for(...)]`：Pi 为**每个扩展**各建一份 API 对象
 * （loader.js `createExtensionAPI()`，每次 loadExtension 调一次），所以挂在 `pi` 上的
 * 标记只能挡住「同一个 pi 装两次」，挡不住「主包 + 独立装的 watchdog 包」。
 * 那个组合是真实场景：主包 bundle 了一份，用户又可能单独 install 一次。
 *
 * 跨扩展的后果比 notify 严重，因为 Pi 的 `tool_call` / `context` 事件会广播给**所有**
 * 扩展的 handler（runner.js `emitToolCall` 遍历 this.extensions）：
 *   1. 两套账各自累计，几乎同时 nudge，用户看到两条 notify；
 *   2. `context` 的 messages 是链式传递的，第二个 handler 会在第一个已注入的
 *      基础上再注入一条，模型上下文里出现两条看门狗指令。
 *
 * 修法用的是「后装者接管」（last install wins）：每次安装取一个递增的 generation，
 * 并把自己的 handler 包一层，发现 generation 已不是自己时就静默让路。
 *
 * 为什么不是「先装者独占 + 引用计数」：那种设计在 owner 泄漏时会**永久**禁掉看门狗
 * （只剩一个失活的占位），而且回调顺序不确定，先装者未必还活着。让最新那次安装
 * 接管，则是自愈的 —— 无论中间发生过什么，最后装上的那份一定在跑。
 *
 * 这个状态必须挂在 `globalThis` 上：`pi` 是 per-extension 的，进程内跨扩展共享
 * 只能靠全局；而 generation 只是计数，天然不会跨会话泄漏语义。
 */
const WATCHDOG_ACTIVE_GENERATION_KEY = Symbol.for(
  "pi-quiet-tools.host-watchdog.active-generation.v1",
);

interface WatchdogGenerationState {
  current: number;
}

function watchdogGenerationState(): WatchdogGenerationState {
  const host = globalThis as Record<PropertyKey, unknown>;
  const existing = host[WATCHDOG_ACTIVE_GENERATION_KEY];
  if (
    existing &&
    typeof existing === "object" &&
    typeof (existing as WatchdogGenerationState).current === "number"
  ) {
    return existing as WatchdogGenerationState;
  }
  const created: WatchdogGenerationState = { current: 0 };
  host[WATCHDOG_ACTIVE_GENERATION_KEY] = created;
  return created;
}


const ANONYMOUS_CHILD_KEY = "__anonymous_child__";

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
  /** 本回合第一次可见正文：host 清 bash、退出宽限/硬停；child 故意不清。 */
  onOfficialText(): boolean;
  onSettled(): void;
}

interface PiWithWatchdog extends ExtensionAPI {
  [WATCHDOG_INSTALL_KEY]?: true;
}

export function createWatchdog(
  limits: WatchdogLimits = DEFAULT_WATCHDOG_LIMITS,
  policy: WatchdogPolicy = HOST_WATCHDOG_POLICY,
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
      // 子会话正文到不了父代理；清零等于放它继续闷跑。
      if (!policy.resetOnOfficialText) {
        return false;
      }
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
        decision.reason = policy.hardStopInstruction;
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
        decision.instruction = policy.nudgeInstruction;
      } else if (phase === "hard_stop") {
        decision.instruction = policy.hardStopInstruction;
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

function childSessionKey(ctx: ExtensionContext): string {
  const id = ctx.sessionManager?.getSessionId?.();
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  // 没有 session id 时宁可用一只匿名账本，也不要每条事件新建一只（永远绊不到）。
  return ANONYMOUS_CHILD_KEY;
}

function announce(
  ctx: ExtensionContext | undefined,
  notify: WatchdogNotify | undefined,
): void {
  if (!notify || !isUiHost(ctx)) {
    return;
  }
  const message = notify === "nudge" ? NUDGE_NOTIFY : HARD_STOP_NOTIFY;
  // severity 用 "info"：Pi 的 warning 会渲染成满亮黄色 + "Warning: " 前缀（interactive-mode
  // 的 showWarning），在终端里比正文还扎眼。这条只是「下一步有动作」的提醒，不是错误，
  // 走 showStatus 的 dim 灰更贴 quiet-tools 的调性。
  ctx?.ui.notify(message, "info");
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
  hostWatchdog: HostWatchdog = createWatchdog(),
): void {
  const target = pi as PiWithWatchdog;
  // 第一层：同一扩展实例重复调用（幂等）。
  if (target[WATCHDOG_INSTALL_KEY]) {
    return;
  }

  target[WATCHDOG_INSTALL_KEY] = true;

  // 第二层：跨扩展去重。本次安装领一个 generation；此后每个 handler 入口都先
  // 核对 generation 是否仍属于自己 —— 若已被更晚的安装接管，就静默返回，
  // 把事件让给那个真正在跑的看门狗。
  const generationState = watchdogGenerationState();
  const myGeneration = ++generationState.current;
  const isActive = (): boolean => generationState.current === myGeneration;

  // 同一 runtime 上 host / 多个 child 事件会打到同一只 pi；按会话拆账，绝不混算。
  const childWatchdogs = new Map<string, HostWatchdog>();

  function childWatchdog(ctx: ExtensionContext): HostWatchdog {
    const key = childSessionKey(ctx);
    const existing = childWatchdogs.get(key);
    if (existing) {
      return existing;
    }
    const created = createWatchdog(hostWatchdog.limits(), CHILD_WATCHDOG_POLICY);
    childWatchdogs.set(key, created);
    return created;
  }

  function watchdogFor(
    ctx: ExtensionContext | undefined,
  ): HostWatchdog | undefined {
    if (!ctx) {
      return undefined;
    }
    if (isUiHost(ctx)) {
      return hostWatchdog;
    }
    return childWatchdog(ctx);
  }

  function dropChild(ctx: ExtensionContext): void {
    const key = childSessionKey(ctx);
    childWatchdogs.get(key)?.onSettled();
    childWatchdogs.delete(key);
  }

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!isActive()) return;
    watchdogFor(ctx)?.onUserRequest();
  });

  function handleVisibleProgress(
    ctx: ExtensionContext,
    message: unknown,
  ): void {
    if (!hasOfficialAssistantText(message)) {
      return;
    }
    watchdogFor(ctx)?.onOfficialText();
  }

  pi.on("turn_start", async (_event, ctx) => {
    if (!isActive()) return;
    watchdogFor(ctx)?.onTurnStart();
  });

  pi.on("message_update", async (event, ctx) => {
    if (!isActive()) return;
    handleVisibleProgress(ctx, event.message);
  });

  pi.on("message_end", async (event, ctx) => {
    if (!isActive()) return;
    handleVisibleProgress(ctx, event.message);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isActive()) return;
    const watchdog = watchdogFor(ctx);
    if (!watchdog) {
      return;
    }
    const decision = watchdog.onToolCall(event.toolName);
    announce(ctx, decision.notify);
    if (decision.block) {
      return { block: true, reason: decision.reason };
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!isActive()) return;
    const watchdog = watchdogFor(ctx);
    if (!watchdog) {
      return;
    }
    announce(ctx, watchdog.onTurnEnd().notify);
  });

  pi.on("context", async (event, ctx) => {
    if (!isActive()) return;
    const watchdog = watchdogFor(ctx);
    if (!watchdog) {
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
    if (!isActive() || !ctx) {
      return;
    }
    if (isUiHost(ctx)) {
      hostWatchdog.onSettled();
      return;
    }
    dropChild(ctx);
  });

  // runtime 拆掉时释放。host 停机清全部；child 只丢自己那本账。
  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx && !isUiHost(ctx)) {
      dropChild(ctx);
      return;
    }
    hostWatchdog.onSettled();
    for (const child of childWatchdogs.values()) {
      child.onSettled();
    }
    childWatchdogs.clear();
  });
}
