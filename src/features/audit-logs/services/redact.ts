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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !(value instanceof Date)
  );
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactSensitive(entry),
    ]),
  );
}
