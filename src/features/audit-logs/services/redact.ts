const REDACTED = "[REDACTED]";

const SENSITIVE_FRAGMENTS = [
  "password",
  "secret",
  "token",
  "apikey",
  "authorization",
  "cookie",
  "privatekey",
  "hashedkey",
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return SENSITIVE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function hasToJSON(value: object): value is { toJSON: () => unknown } {
  return typeof (value as { toJSON?: unknown }).toJSON === "function";
}

function redactEntries(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactSensitive(entry),
    ]),
  );
}

function isRedactableObject(value: unknown): value is object {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function redactSerialized(json: unknown): unknown {
  // WHY: JSON.stringify calls toJSON once per value; recursing through
  // redactSensitive would call it again and loop on toJSON returning this.
  return isRedactableObject(json) ? redactEntries(json) : redactSensitive(json);
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (!isRedactableObject(value)) {
    return value;
  }
  if (hasToJSON(value)) {
    return redactSerialized(value.toJSON());
  }
  return redactEntries(value);
}
