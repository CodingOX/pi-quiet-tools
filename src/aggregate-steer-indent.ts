import { UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { indentAggregateLedger } from "./aggregate-ledger-indent.js";

/**
 * 展开态（Ctrl+O）用户插话（steer）的轨道缩进。
 *
 * 为什么需要第三个宿主：展开态 steer 由 display-intent 的 `UserMessageComponent` 补丁渲染
 * （`resolveAggregateSteerUserPresentation` → `renderExpandedAggregateSteer`），
 * 它既不经过 `ToolExecutionComponent` 也不经过 `AssistantMessageComponent` —— glue 另外
 * 两个宿主都碰不到。不补这一层，折叠态 steer 钉被右移 1 列、展开态轨道仍停 col 2，
 * 邻接的工具行就成了 `   │ ✓` 配 `  │ ↳`，框线参差。
 *
 * 安装位置必须是**最外层**：display-intent 的补丁会在它自己那层里做 gutter / 边框包装，
 * 若我们被包在它内部，拿到的是原始用户消息行（不是 steer 轨道块），判据不会命中。
 * `installAggregateSteerIndentPatch` 因此每次 refresh 都检查 live render 是否带本模块的
 * 标记 —— 不带就再包一层到最外面。
 *
 * 与另两个宿主一致，缩进本身幂等（见 `indentAggregateLedger`），多层叠加也不会二次平移。
 */
const STEER_INDENT_WRAP_KEY = Symbol.for("pi-tools.aggregate-steer-indent.v1");

type SteerRender = ((this: unknown, width: number) => string[]) & {
  [STEER_INDENT_WRAP_KEY]?: true;
};

interface PatchableUserMessagePrototype {
  render(width: number): string[];
}

export function installAggregateSteerIndentPatch(): void {
  // SAFETY: Pi 运行时原型确实提供 render；这里只重声明签名以便版本化包装。
  const prototype =
    UserMessageComponent.prototype as unknown as PatchableUserMessagePrototype;
  const liveRender = prototype.render as SteerRender | undefined;
  if (typeof liveRender !== "function") {
    return;
  }
  // 已在最外层：display-intent 的 reload 重装会先回退到它记录的 original，
  // 本模块的包装随之丢失，那一轮由下一次 refresh 重新包上。
  if (liveRender[STEER_INDENT_WRAP_KEY]) {
    return;
  }

  const innerRender = liveRender;
  // SAFETY: 包装函数与原型方法同签名；Symbol 标记只是本模块的私有版本位。
  const wrappedRender = function wrappedSteerIndentRender(
    this: unknown,
    width: number,
  ): string[] {
    return indentAggregateLedger(innerRender.call(this, width), width);
  } as SteerRender;
  wrappedRender[STEER_INDENT_WRAP_KEY] = true;

  prototype.render = wrappedRender;
}
