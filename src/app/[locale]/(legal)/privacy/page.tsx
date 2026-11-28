import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isModuleEnabled } from "@/shared/lib/modules/require-module-enabled";
import { legalSettings } from "@/features/legal/legal-settings";
import { LegalDocumentPage } from "@/features/legal/components/legal-document-page";

interface LegalPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: LegalPageProps): Promise<Metadata> {
  if (!isModuleEnabled("legal")) {
    return {};
  }
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("privacy-title") };
}

export default async function LegalPage({
  params,
}: LegalPageProps): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!isModuleEnabled("legal")) {
    notFound();
  }
  if (legalSettings.error !== null) {
    throw legalSettings.error;
  }
  return <LegalDocumentPage document="privacy" locale={locale} />;
}
