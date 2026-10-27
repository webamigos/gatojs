export type ModuleMessages = {
  key: string;
  messages: Record<string, unknown>;
};

const NAMESPACE_KEY = /^[a-z][a-zA-Z0-9-]*$/;

export function mergeMessages(
  core: Record<string, unknown>,
  modules: ModuleMessages[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...core };
  for (const { key, messages } of modules) {
    if (!NAMESPACE_KEY.test(key)) {
      throw new Error(`Nieprawidłowy klucz namespace i18n: ${key}`);
    }
    if (Object.hasOwn(merged, key)) {
      throw new Error(`Kolizja namespace i18n: ${key}`);
    }
    merged[key] = messages;
  }
  return merged;
}
