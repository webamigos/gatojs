import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  resolveLegalDocument,
  type LegalDocumentKey,
} from "../services/legal-documents";

const titleKeys = {
  terms: "terms-title",
  privacy: "privacy-title",
} as const satisfies Record<LegalDocumentKey, string>;

function parseIsoDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

export async function LegalDocumentPage({
  document,
  locale,
}: {
  document: LegalDocumentKey;
  locale: string;
}): Promise<ReactNode> {
  const [t, format, { Content, updatedAt }] = await Promise.all([
    getTranslations({ locale, namespace: "legal" }),
    getFormatter({ locale }),
    resolveLegalDocument(document, locale),
  ]);
  const date = format.dateTime(parseIsoDate(updatedAt), { dateStyle: "long" });

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t(titleKeys[document])}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("last-updated", { date })}
        </p>
      </header>
      <article className="legal-document grid gap-4 text-sm leading-relaxed [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_td]:align-top [&_th]:border [&_th]:p-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
        <Content />
      </article>
    </div>
  );
}
