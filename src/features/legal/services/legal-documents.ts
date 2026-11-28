import type { ComponentType } from "react";
import { defaultLocale } from "@/i18n/config";
import { legalDocuments } from "../content";

export type LegalDocumentKey = "terms" | "privacy";

export type LegalDocumentModule = { default: ComponentType; updatedAt: string };

export type LegalDocumentLoaders = Record<
  LegalDocumentKey,
  Partial<Record<string, () => Promise<LegalDocumentModule>>>
>;

export class LegalDocumentMissingError extends Error {
  name = "LegalDocumentMissingError";
}

export async function resolveLegalDocument(
  document: LegalDocumentKey,
  locale: string,
  loaders: LegalDocumentLoaders = legalDocuments,
  fallbackLocale: string = defaultLocale,
): Promise<{ Content: ComponentType; updatedAt: string; locale: string }> {
  const available = loaders[document];
  for (const candidate of [locale, fallbackLocale]) {
    const load = available[candidate];
    if (load !== undefined) {
      const loaded = await load();
      return {
        Content: loaded.default,
        updatedAt: loaded.updatedAt,
        locale: candidate,
      };
    }
  }
  throw new LegalDocumentMissingError(
    `No legal document "${document}" for locale ${locale} or ${fallbackLocale}`,
  );
}
