import type { LegalDocumentLoaders } from "../services/legal-documents";

export const legalDocuments: LegalDocumentLoaders = {
  terms: {
    pl: () => import("./terms.pl"),
    en: () => import("./terms.en"),
  },
  privacy: {
    pl: () => import("./privacy.pl"),
    en: () => import("./privacy.en"),
  },
};
