import type { AppLocale } from "./config";
import { loadMessages } from "./load-messages";
import { translatorFor, type Translate } from "./translator";

export async function getTranslator(
  locale: AppLocale,
  namespace: string,
): Promise<Translate> {
  return translatorFor(locale, await loadMessages(locale), namespace);
}
