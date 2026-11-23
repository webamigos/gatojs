import type { AppLocale } from "./config";
import { mergeMessages } from "./merge-messages";

export async function loadCoreMessages(
  locale: AppLocale,
): Promise<Record<string, unknown>> {
  return (await import(`@/app/messages/${locale}.json`)).default;
}

export async function loadMessages(
  locale: AppLocale,
): Promise<Record<string, unknown>> {
  const { moduleMessages } = await import("@/modules.generated");
  const core = await loadCoreMessages(locale);
  const modules = await Promise.all(
    moduleMessages[locale].map(async ({ key, load }) => ({
      key,
      messages: await load(),
    })),
  );
  return mergeMessages(core, modules);
}
