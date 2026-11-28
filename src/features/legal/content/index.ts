export const legalDocuments = {
  terms: {
    pl: () => import("./terms.pl"),
    en: () => import("./terms.en"),
  },
  privacy: {
    pl: () => import("./privacy.pl"),
    en: () => import("./privacy.en"),
  },
};
