import { getRequestConfig } from "next-intl/server";
import { moduleMessages } from "@/modules.generated";
import { mergeMessages } from "./merge-messages";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  const locale =
    requested &&
    routing.locales.includes(requested as (typeof routing.locales)[number])
      ? (requested as (typeof routing.locales)[number])
      : routing.defaultLocale;

  const core = (await import(`@/app/messages/${locale}.json`)).default;
  const modules = await Promise.all(
    moduleMessages[locale].map(async ({ key, load }) => ({
      key,
      messages: await load(),
    })),
  );

  return {
    locale,
    messages: mergeMessages(core, modules),
  };
});
