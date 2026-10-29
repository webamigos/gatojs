const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "hashedkey",
  "authorization",
  "cookie",
]);

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
      SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redactSensitive(entry),
    ]),
  );
}
