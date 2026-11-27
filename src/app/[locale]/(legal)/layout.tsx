import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { BrandLogo } from "@/shared/components/brand-logo";
import { getBranding } from "@/shared/lib/modules/branding";
import { CookieSettingsButton } from "@/features/legal/components/cookie-settings-button";

const footerLinkClass =
  "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

export default async function LegalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal" });
  const { logo } = getBranding();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-3xl items-center px-4 py-6 sm:px-6">
        <Link href="/" aria-label={t("footer-home")}>
          {logo !== undefined ? (
            <BrandLogo logo={logo} />
          ) : (
            <span className="font-semibold">{t("footer-home")}</span>
          )}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 sm:px-6">
        {children}
      </main>
      <footer className="border-t">
        <nav
          aria-label={t("footer-label")}
          className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-6 text-sm sm:px-6"
        >
          <Link href="/terms" className={footerLinkClass}>
            {t("footer-terms")}
          </Link>
          <Link href="/privacy" className={footerLinkClass}>
            {t("footer-privacy")}
          </Link>
          <CookieSettingsButton label="footer" />
          <Link href="/" className={`${footerLinkClass} ml-auto`}>
            {t("footer-home")}
          </Link>
        </nav>
      </footer>
    </div>
  );
}
