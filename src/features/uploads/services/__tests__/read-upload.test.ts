// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "org-a";
const ORG_B = "org-b";
const PUBLIC_ID = "11111111-1111-4111-8111-111111111111";
const PRIVATE_ID = "22222222-2222-4222-8222-222222222222";
const MISSING_ID = "33333333-3333-4333-8333-333333333333";
const BYTES = new Uint8Array([1, 2, 3, 4]);

interface Row {
  id: string;
  organizationId: string;
  key: string;
  fileName: string;
  mimeType: string;
  visibility: "PUBLIC" | "ORGANIZATION";
}

const {
  mockGetSession,
  mockMemberFindFirst,
  mockOrganizationFindUnique,
  mockGetObject,
  uploadStore,
  uploadQueries,
} = vi.hoisted(() => {
  const uploadStore = { rows: [] as Row[] };
  const matches = (row: Row, where: Record<string, unknown> | undefined) =>
    Object.entries(where ?? {}).every(
      ([field, value]) =>
        (row as unknown as Record<string, unknown>)[field] === value,
    );
  const find = vi.fn(
    async (args: { where?: Record<string, unknown> }) =>
      uploadStore.rows.find((row) => matches(row, args.where)) ?? null,
  );
  return {
    mockGetSession: vi.fn(),
    mockMemberFindFirst: vi.fn(),
    mockOrganizationFindUnique: vi.fn(),
    mockGetObject: vi.fn(),
    uploadStore,
    uploadQueries: {
      findFirst: find,
      findUnique: find,
      findFirstOrThrow: find,
      findUniqueOrThrow: find,
      findMany: vi.fn(async (args: { where?: Record<string, unknown> }) =>
        uploadStore.rows.filter((row) => matches(row, args.where)),
      ),
    },
  };
});

vi.mock("@/shared/lib/env", () => ({ env: { MULTI_ORG: false } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));
vi.mock("@/shared/lib/prisma", () => ({
  prisma: {
    member: { findFirst: mockMemberFindFirst },
    organization: { findUnique: mockOrganizationFindUnique },
    upload: uploadQueries,
  },
}));
vi.mock("../storage", () => ({ getObject: mockGetObject }));
vi.mock("@/shared/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { readUploadForDownload } from "../read-upload";

function signIn(activeOrganizationId: string | null): void {
  mockGetSession.mockResolvedValue({
    user: { id: "user-1", role: "user" },
    session: { activeOrganizationId },
  });
  mockMemberFindFirst.mockResolvedValue({ role: "member" });
  mockOrganizationFindUnique.mockResolvedValue({ id: activeOrganizationId });
}

function queryCount(): number {
  return Object.values(uploadQueries).reduce(
    (sum, query) => sum + query.mock.calls.length,
    0,
  );
}

beforeEach(() => {
  uploadStore.rows = [
    {
      id: PUBLIC_ID,
      organizationId: ORG_A,
      key: "orgs/org-a/editor-image/pub.jpg",
      fileName: "logo.png",
      mimeType: "image/png",
      visibility: "PUBLIC",
    },
    {
      id: PRIVATE_ID,
      organizationId: ORG_A,
      key: "orgs/org-a/private-scan/priv.pdf",
      fileName: "raport.pdf",
      mimeType: "application/pdf",
      visibility: "ORGANIZATION",
    },
  ];
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue(null);
  mockMemberFindFirst.mockReset();
  mockOrganizationFindUnique.mockReset();
  mockGetObject.mockReset();
  mockGetObject.mockResolvedValue({
    body: BYTES,
    contentType: "application/octet-stream",
  });
  Object.values(uploadQueries).forEach((query) => query.mockClear());
});

describe("readUploadForDownload", () => {
  it("zwraca 404 dla id, które nie jest uuid, bez zapytania do bazy i storage", async () => {
    const result = await readUploadForDownload("../../etc/passwd");

    expect(result).toEqual({ status: 404 });
    expect(queryCount()).toBe(0);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it("zwraca 404 dla nieistniejącego rekordu", async () => {
    const result = await readUploadForDownload(MISSING_ID);

    expect(result).toEqual({ status: 404 });
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it("plik PUBLIC bez sesji daje 200 z nagłówkami z rekordu i nosniff", async () => {
    const result = await readUploadForDownload(PUBLIC_ID);

    expect(result).toEqual({
      status: 200,
      body: BYTES,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition":
          "inline; filename=\"logo.png\"; filename*=UTF-8''logo.png",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
    expect(mockGetObject).toHaveBeenCalledWith(
      "orgs/org-a/editor-image/pub.jpg",
    );
  });

  it("plik PUBLIC jest dostępny także z aktywną inną organizacją", async () => {
    signIn(ORG_B);

    const result = await readUploadForDownload(PUBLIC_ID);

    expect(result.status).toBe(200);
  });

  it("plik ORGANIZATION bez sesji daje 404 i nie czyta storage", async () => {
    const result = await readUploadForDownload(PRIVATE_ID);

    expect(result).toEqual({ status: 404 });
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it("plik ORGANIZATION z aktywną organizacją pliku daje 200 z prywatnym cache", async () => {
    signIn(ORG_A);

    const result = await readUploadForDownload(PRIVATE_ID);

    expect(result).toEqual({
      status: 200,
      body: BYTES,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          "inline; filename=\"raport.pdf\"; filename*=UTF-8''raport.pdf",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  });

  it("plik ORGANIZATION z aktywną inną organizacją daje 404 i nie czyta storage", async () => {
    signIn(ORG_B);

    const result = await readUploadForDownload(PRIVATE_ID);

    expect(result).toEqual({ status: 404 });
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it("plik ORGANIZATION z sesją bez aktywnej organizacji daje 404", async () => {
    signIn(null);

    const result = await readUploadForDownload(PRIVATE_ID);

    expect(result).toEqual({ status: 404 });
  });

  it("zwraca 404, gdy obiekt zniknął ze storage", async () => {
    mockGetObject.mockResolvedValue(null);

    const result = await readUploadForDownload(PUBLIC_ID);

    expect(result).toEqual({ status: 404 });
  });

  it("nazwa pliku z cudzysłowem i nową linią nie trafia surowa do Content-Disposition", async () => {
    uploadStore.rows[0]!.fileName = 'a"\r\nSet-Cookie: x=1.png';

    const result = await readUploadForDownload(PUBLIC_ID);

    expect(result.status).toBe(200);
    if (result.status === 200) {
      const disposition = result.headers["Content-Disposition"]!;
      expect(disposition).not.toMatch(/[\r\n]/);
      expect(disposition).toBe(
        "inline; filename=\"a___Set-Cookie: x=1.png\"; filename*=UTF-8''a%22%0D%0ASet-Cookie%3A%20x%3D1.png",
      );
    }
  });
});
