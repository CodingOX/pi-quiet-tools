import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { indentAggregateLedger } from "./aggregate-ledger-indent.js";
import { omitCollapsedLedgerNarration } from "./aggregate-omit-ledger-narration.js";
import { resolveSilentAggregateLines } from "./aggregate-silent-ledger.js";

const AGGREGATE_PATCH_KEY = Symbol.for(
  "pi-tool-display-intent.aggregate-tool-execution.v1",
);
// wrap key 提到 v6：包装器挂在原型上、跨 /reload 存活，沿用旧 key 会让新逻辑
// 被 `liveRender[SILENT_WRAP_KEY] && liveRender === currentRender` 提前 return 掉，
// 表现为「改了却看不到效果」。inner key 不变 —— 它只记录被包裹的下一层 render。
const SILENT_WRAP_KEY = Symbol.for("pi-tools.aggregate-silent-wrap.v6");
const SILENT_INNER_KEY = Symbol.for("pi-tools.aggregate-silent-inner.v2");

interface AggregatePatchState {
  patchedRender?: (width: number) => string[];
  projection?: unknown;
}

interface PatchableToolExecutionPrototype {
  render(width: number): string[];
  [AGGREGATE_PATCH_KEY]?: AggregatePatchState;
}

type PatchedRender = ((this: unknown, width: number) => string[]) & {
  [SILENT_WRAP_KEY]?: true;
  [SILENT_INNER_KEY]?: (this: unknown, width: number) => string[];
};

function unwrapSilentInner(
  currentRender: PatchedRender,
  liveRender: PatchedRender,
): (this: unknown, width: number) => string[] {
  if (typeof currentRender[SILENT_INNER_KEY] === "function") {
    return currentRender[SILENT_INNER_KEY];
  }
  if (typeof liveRender[SILENT_INNER_KEY] === "function") {
    return liveRender[SILENT_INNER_KEY];
  }
  return currentRender;
}

export function installAggregateSilentToolsPatch(): void {
  const prototype =
    ToolExecutionComponent.prototype as PatchableToolExecutionPrototype;
  const aggregateState = prototype[AGGREGATE_PATCH_KEY];
  const currentRender = aggregateState?.patchedRender as
    | PatchedRender
    | undefined;
  if (!currentRender) {
    return;
  }

  const liveRender = prototype.render as PatchedRender;
  if (liveRender[SILENT_WRAP_KEY] && liveRender === currentRender) {
    return;
  }

  const innerRender = unwrapSilentInner(currentRender, liveRender);
  const wrappedRender = function wrappedAggregateRender(
    this: unknown,
    width: number,
  ): string[] {
    const context = this as { toolName?: unknown; expanded?: unknown };
    const toolName =
      typeof context.toolName === "string" ? context.toolName : "";
    const lines = innerRender.call(this, width);
    return indentAggregateLedger(
      omitCollapsedLedgerNarration(
        resolveSilentAggregateLines(toolName, lines, {
          expanded: context.expanded === true,
        }),
      ),
      width,
    );
  } as PatchedRender;
  wrappedRender[SILENT_WRAP_KEY] = true;
  wrappedRender[SILENT_INNER_KEY] = innerRender;

  aggregateState!.patchedRender = wrappedRender;
  prototype.render = wrappedRender;
}
