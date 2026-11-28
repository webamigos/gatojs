import { notFound } from "next/navigation";
import { getMessages, setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { routing } from "@/i18n/routing";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/env";
import { Slot } from "@/shared/components/slot";
import { anonymousViewer } from "@/shared/lib/modules/slot-access";

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
      <Slot
        id="app.root"
        context={{ locale }}
        viewer={anonymousViewer(env.MULTI_ORG)}
      />
      <Toaster />
    </NextIntlClientProvider>
  );
}
