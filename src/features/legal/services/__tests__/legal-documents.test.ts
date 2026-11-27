import { describe, expect, it, vi } from "vitest";
import {
  LegalDocumentMissingError,
  resolveLegalDocument,
  type LegalDocumentLoaders,
  type LegalDocumentModule,
} from "../legal-documents";

const { ShippedTermsPl } = vi.hoisted(() => ({
  ShippedTermsPl: () => null,
}));

vi.mock("../../content", () => ({
  legalDocuments: {
    terms: {
      pl: async () => ({ default: ShippedTermsPl, updatedAt: "2026-05-05" }),
    },
    privacy: {},
  },
}));

function TermsPl() {
  return null;
}
function TermsEn() {
  return null;
}
function PrivacyPl() {
  return null;
}

function setup() {
  const termsPl = vi.fn(async (): Promise<LegalDocumentModule> => ({
    default: TermsPl,
    updatedAt: "2026-01-10",
  }));
  const termsEn = vi.fn(async (): Promise<LegalDocumentModule> => ({
    default: TermsEn,
    updatedAt: "2026-02-20",
  }));
  const privacyPl = vi.fn(async (): Promise<LegalDocumentModule> => ({
    default: PrivacyPl,
    updatedAt: "2026-03-30",
  }));
  const loaders: LegalDocumentLoaders = {
    terms: { pl: termsPl, en: termsEn },
    privacy: { pl: privacyPl },
  };
  return { loaders, termsPl, termsEn, privacyPl };
}

describe("resolveLegalDocument", () => {
  it("returns the document in the requested locale when it exists", async () => {
    const { loaders } = setup();

    await expect(
      resolveLegalDocument("terms", "en", loaders, "pl"),
    ).resolves.toEqual({
      Content: TermsEn,
      updatedAt: "2026-02-20",
      locale: "en",
    });
  });

  it("loads only the requested locale when it exists, not the fallback", async () => {
    const { loaders, termsPl, termsEn, privacyPl } = setup();

    await resolveLegalDocument("terms", "en", loaders, "pl");

    expect(termsEn).toHaveBeenCalledTimes(1);
    expect(termsPl).not.toHaveBeenCalled();
    expect(privacyPl).not.toHaveBeenCalled();
  });

  it("falls back to the default locale when the requested one has no file", async () => {
    const { loaders } = setup();

    await expect(
      resolveLegalDocument("privacy", "en", loaders, "pl"),
    ).resolves.toEqual({
      Content: PrivacyPl,
      updatedAt: "2026-03-30",
      locale: "pl",
    });
  });

  it("falls back for a locale the app does not know", async () => {
    const { loaders, termsPl, termsEn } = setup();

    await expect(
      resolveLegalDocument("terms", "de", loaders, "pl"),
    ).resolves.toEqual({
      Content: TermsPl,
      updatedAt: "2026-01-10",
      locale: "pl",
    });
    expect(termsPl).toHaveBeenCalledTimes(1);
    expect(termsEn).not.toHaveBeenCalled();
  });

  it("uses pl as the fallback when none is given", async () => {
    const { loaders } = setup();

    await expect(
      resolveLegalDocument("privacy", "en", loaders),
    ).resolves.toEqual({
      Content: PrivacyPl,
      updatedAt: "2026-03-30",
      locale: "pl",
    });
  });

  it("does not mix documents: privacy in pl is not the terms in pl", async () => {
    const { loaders, termsPl } = setup();

    const resolved = await resolveLegalDocument("privacy", "pl", loaders, "pl");

    expect(resolved.Content).toBe(PrivacyPl);
    expect(termsPl).not.toHaveBeenCalled();
  });

  it("rejects with LegalDocumentMissingError when neither locale has a file", async () => {
    const loaders: LegalDocumentLoaders = { terms: {}, privacy: {} };

    const error = await resolveLegalDocument(
      "terms",
      "en",
      loaders,
      "pl",
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LegalDocumentMissingError);
    expect((error as Error).message).toBe(
      'No legal document "terms" for locale en or pl',
    );
    expect((error as Error).name).toBe("LegalDocumentMissingError");
  });

  it("rejects when only the other document exists", async () => {
    const loaders: LegalDocumentLoaders = {
      terms: {},
      privacy: {
        pl: async () => ({ default: PrivacyPl, updatedAt: "2026-03-30" }),
      },
    };

    await expect(
      resolveLegalDocument("terms", "pl", loaders, "pl"),
    ).rejects.toBeInstanceOf(LegalDocumentMissingError);
  });

  it("without loaders reads the content map and falls back to pl for an unknown locale", async () => {
    await expect(resolveLegalDocument("terms", "de")).resolves.toEqual({
      Content: ShippedTermsPl,
      updatedAt: "2026-05-05",
      locale: "pl",
    });
  });
});
