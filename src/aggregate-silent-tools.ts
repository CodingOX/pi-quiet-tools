import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";

const AGGREGATE_PATCH_KEY = Symbol.for(
  "pi-tool-display-intent.aggregate-tool-execution.v1",
);
const SILENT_WRAP_KEY = Symbol.for("pi-tools.aggregate-silent-wrap.v1");

export const SILENT_AGGREGATE_TOOLS = new Set([
  "read",
  "replace",
  "undo_last_replace",
]);

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
};

function shouldSilenceTool(toolName: string): boolean {
  return SILENT_AGGREGATE_TOOLS.has(toolName);
}

export function installAggregateSilentToolsPatch(): void {
  const prototype = ToolExecutionComponent.prototype as PatchableToolExecutionPrototype;
  const aggregateState = prototype[AGGREGATE_PATCH_KEY];
  const aggregateRender = aggregateState?.patchedRender as PatchedRender | undefined;
  if (!aggregateRender || aggregateRender[SILENT_WRAP_KEY]) {
    return;
  }

  const wrappedRender = function wrappedAggregateRender(
    this: unknown,
    width: number,
  ): string[] {
    const context = this as { toolName?: unknown };
    const toolName = typeof context.toolName === "string" ? context.toolName : "";
    if (shouldSilenceTool(toolName)) {
      return [];
    }
    return aggregateRender.call(this, width);
  } as PatchedRender;
  wrappedRender[SILENT_WRAP_KEY] = true;

  aggregateState!.patchedRender = wrappedRender;
  if (prototype.render === aggregateRender) {
    prototype.render = wrappedRender;
  }
}
