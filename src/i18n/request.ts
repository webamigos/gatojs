import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isAppLocale } from "./config";
import { loadMessages } from "./load-messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isAppLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
