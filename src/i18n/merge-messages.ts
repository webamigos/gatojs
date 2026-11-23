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
      throw new Error(`Invalid i18n namespace key: ${key}`);
    }
    if (Object.hasOwn(merged, key)) {
      throw new Error(`i18n namespace collision: ${key}`);
    }
    merged[key] = messages;
  }
  return merged;
}
