export type ModuleMessages = {
  key: string;
  messages: Record<string, unknown>;
};

export function mergeMessages(
  core: Record<string, unknown>,
  modules: ModuleMessages[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...core };
  for (const { key, messages } of modules) {
    if (key in merged) {
      throw new Error(`Kolizja namespace i18n: ${key}`);
    }
    merged[key] = messages;
  }
  return merged;
}
