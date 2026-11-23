import messagesEn from "@/app/messages/en.json";
import messagesPl from "@/app/messages/pl.json";
import { defaultLocale, type AppLocale } from "./config";
import { translatorFor, type Translate } from "./translator";

const bundledCoreMessages: Record<string, Record<string, unknown>> = {
  pl: messagesPl,
  en: messagesEn,
};

export function getCoreTranslator(
  locale: AppLocale,
  namespace: string,
): Translate {
  // WHY: better-auth guards throw synchronously, so core messages are bundled;
  // a locale without a bundled file falls back to the default one.
  const bundled = bundledCoreMessages[locale];
  return bundled
    ? translatorFor(locale, bundled, namespace)
    : translatorFor(
        defaultLocale,
        bundledCoreMessages[defaultLocale],
        namespace,
      );
}
