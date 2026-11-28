export const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|apikey|api_key|authorization|cookie|session)/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}
