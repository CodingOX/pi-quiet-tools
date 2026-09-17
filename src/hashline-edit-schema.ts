import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

type JsonSchemaObject = {
  additionalProperties?: unknown;
  properties?: Record<string, unknown>;
};

function asSchema(parameters: unknown): JsonSchemaObject | undefined {
  if (parameters === null || typeof parameters !== "object") {
    return undefined;
  }
  return parameters as JsonSchemaObject;
}

function schemaHasPath(parameters: unknown): boolean {
  const properties = asSchema(parameters)?.properties;
  return Boolean(properties && Object.hasOwn(properties, "path"));
}

/**
 * 复制 TypeBox/JSON Schema 对象，只把 additionalProperties 改成 false。
 *
 * 必须带上非枚举 Kind（TypeBox 1.3 是 ~kind 字符串，旧版可能是 symbol），
 * 否则 Pi 做 constrained sampling 时会把副本当成普通 JSON，不再当 schema 用。
 */
function forbidAdditionalProperties<T>(parameters: T): T {
  if (parameters === null || typeof parameters !== "object") {
    return parameters;
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    parameters,
  ) as PropertyDescriptorMap;
  descriptors.additionalProperties = {
    configurable: true,
    enumerable: true,
    writable: true,
    value: false,
  };
  return Object.create(Object.getPrototypeOf(parameters), descriptors) as T;
}

type NonObjectArgs =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;
type PreparedEditInput =
  | Record<string, unknown>
  | readonly unknown[]
  | NonObjectArgs;

function stripLoosePath(args: unknown): PreparedEditInput {
  if (args === null || typeof args !== "object") {
    return args as NonObjectArgs;
  }
  if (Array.isArray(args)) {
    return args;
  }
  const {
    path: _path,
    file_path: _filePath,
    ...rest
  } = args as Record<string, unknown>;
  return rest;
}

/**
 * 默认锚点模式下，模型常把 write 的 path 带给 replace/insert。
 * 上游 prepareArguments 可能先把 file_path 收成 path，所以剥字段必须发生在它之后。
 */
function wrapPrepareArguments(
  inner: ToolDefinition["prepareArguments"] | undefined,
  stripPath: boolean,
): ToolDefinition["prepareArguments"] | undefined {
  if (!stripPath) {
    return inner;
  }
  return (args: unknown) => {
    const prepared = inner ? inner(args) : args;
    return stripLoosePath(prepared);
  };
}

/**
 * 锁 hashline 编辑工具交给模型的 schema：只许声明过的字段。
 *
 * 上游默认 additionalProperties: true，模型会把 path 当合法参数送进去，
 * 随后在 assertReq 里被非字符串/未知字段炸掉。胶层只改注册副本。
 * requirePath 打开时 path 已在 properties 里，只关 extra、不剥 path。
 */
export function lockHashlineEditSchema(tool: ToolDefinition): ToolDefinition {
  return {
    ...tool,
    parameters: forbidAdditionalProperties(tool.parameters),
    prepareArguments: wrapPrepareArguments(
      tool.prepareArguments,
      !schemaHasPath(tool.parameters),
    ),
  };
}
