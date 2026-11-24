export type AttributeValue = string | number | boolean;

export type NormalizedAttributes = Record<string, AttributeValue>;

function errorType(error: Error): string {
  // WHY: production bundles minify class names; a string literal assigned to name survives, so name wins.
  const name: unknown = error.name;
  if (typeof name === "string" && name !== "" && name !== "Error") {
    return name;
  }
  return error.constructor.name || "Error";
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeAttributes(
  attributes?: Record<string, unknown>,
): NormalizedAttributes {
  if (!attributes) {
    return {};
  }

  const result: NormalizedAttributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (value instanceof Error) {
      result[`${key}.type`] = errorType(value);
      result[`${key}.message`] = value.message;
      if (value.stack) {
        result[`${key}.stacktrace`] = value.stack;
      }
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result[key] = value;
    } else if (value instanceof Date) {
      result[key] = Number.isNaN(value.getTime())
        ? value.toString()
        : value.toISOString();
    } else {
      result[key] = serialize(value);
    }
  }
  return result;
}
