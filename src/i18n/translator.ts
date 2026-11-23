import { createTranslator, type AbstractIntlMessages } from "next-intl";
import type { AppLocale } from "./config";

export type TranslationValues = Record<string, string | number>;
export type Translate = (key: string, values?: TranslationValues) => string;

type LooseTranslator = (key: string, values?: TranslationValues) => string;

export function translatorFor(
  locale: AppLocale,
  messages: Record<string, unknown>,
  namespace: string,
): Translate {
  const translate = createTranslator({
    locale,
    messages: messages as AbstractIntlMessages,
    namespace,
  }) as unknown as LooseTranslator;
  return (key, values) => translate(key, values);
}
