import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { NotFoundView } from "@/shared/components/not-found-view";

export default async function RootNotFound() {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <NotFoundView />
    </NextIntlClientProvider>
  );
}
