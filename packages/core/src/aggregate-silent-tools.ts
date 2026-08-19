import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import {
  resolveSilentAggregateLines,
  SILENT_AGGREGATE_TOOLS,
} from "./aggregate-silent-ledger.js";

const AGGREGATE_PATCH_KEY = Symbol.for(
  "pi-tool-display-intent.aggregate-tool-execution.v1",
);
const SILENT_WRAP_KEY_V1 = Symbol.for("pi-tools.aggregate-silent-wrap.v1");
const SILENT_WRAP_KEY_V2 = Symbol.for("pi-tools.aggregate-silent-wrap.v2");
const SILENT_WRAP_KEY = Symbol.for("pi-tools.aggregate-silent-wrap.v3");
const SILENT_INNER_KEY = Symbol.for("pi-tools.aggregate-silent-inner.v2");

export { SILENT_AGGREGATE_TOOLS };

interface AggregatePatchState {
  patchedRender?: (width: number) => string[];
  projection?: unknown;
}

interface PatchableToolExecutionPrototype {
  render(width: number): string[];
  [AGGREGATE_PATCH_KEY]?: AggregatePatchState;
}

type PatchedRender = ((this: unknown, width: number) => string[]) & {
  [SILENT_WRAP_KEY_V1]?: true;
  [SILENT_WRAP_KEY_V2]?: true;
  [SILENT_WRAP_KEY]?: true;
  [SILENT_INNER_KEY]?: (this: unknown, width: number) => string[];
};

export function installAggregateSilentToolsPatch(): void {
  const prototype = ToolExecutionComponent.prototype as PatchableToolExecutionPrototype;
  const aggregateState = prototype[AGGREGATE_PATCH_KEY];
  const currentRender = aggregateState?.patchedRender as PatchedRender | undefined;
  if (!currentRender) {
    return;
  }
  if (currentRender[SILENT_WRAP_KEY]) {
    return;
  }

  const innerRender = currentRender[SILENT_INNER_KEY] ?? currentRender;
  const wrappedRender = function wrappedAggregateRender(
    this: unknown,
    width: number,
  ): string[] {
    const context = this as { toolName?: unknown; expanded?: unknown };
    const toolName = typeof context.toolName === "string" ? context.toolName : "";
    const lines = innerRender.call(this, width);
    return resolveSilentAggregateLines(toolName, lines, {
      expanded: context.expanded === true,
    });
  } as PatchedRender;
  wrappedRender[SILENT_WRAP_KEY] = true;
  wrappedRender[SILENT_INNER_KEY] = innerRender;

  aggregateState!.patchedRender = wrappedRender;
  if (prototype.render === currentRender) {
    prototype.render = wrappedRender;
  }
}
