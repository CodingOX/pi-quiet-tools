import toolDisplayIntentExtension from "../src/index.js";
import { hasPrecedingAggregateToolsLedger } from "../src/aggregate-activity.js";

type ToolDisplayIntentExtensionWithAggregateState = typeof toolDisplayIntentExtension & {
	hasPrecedingAggregateToolsLedger?: (message: unknown) => boolean;
};

const extension = toolDisplayIntentExtension as ToolDisplayIntentExtensionWithAggregateState;
extension.hasPrecedingAggregateToolsLedger = hasPrecedingAggregateToolsLedger;

export default extension;
