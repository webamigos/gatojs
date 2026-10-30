// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetOrgContext } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetOrgContext: vi.fn(),
}));

vi.mock("@/shared/lib/env", () => ({ env: { MULTI_ORG: false } }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "session=abc" })),
}));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({ redirect: vi.fn() }));
vi.mock("@/shared/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));
vi.mock("@/shared/lib/auth/org-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/auth/org-context")>()),
  getOrgContext: () => mockGetOrgContext(),
}));

import { NoOrganizationError } from "@/shared/lib/auth/org-context";
import { readOrgContextForApi } from "../api-org-context";

const CONTEXT = {
  userId: "user-1",
  organizationId: "org-a",
  orgRole: "member",
  userRole: "user",
  serviceMode: false,
};

beforeEach(() => {
  mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
  mockGetOrgContext.mockResolvedValue(CONTEXT);
});

describe("readOrgContextForApi", () => {
  it("czyta sesję z bazy z disableCookieCache", async () => {
    await readOrgContextForApi();

    expect(mockGetSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    );
  });

  it("zwraca 401 bez sesji i nie woła getOrgContext", async () => {
    mockGetSession.mockResolvedValue(null);

    expect(await readOrgContextForApi()).toEqual({ ok: false, status: 401 });
    expect(mockGetOrgContext).not.toHaveBeenCalled();
  });

  it("zwraca 403 dla NoOrganizationError", async () => {
    mockGetOrgContext.mockRejectedValue(new NoOrganizationError());

    expect(await readOrgContextForApi()).toEqual({ ok: false, status: 403 });
  });

  it("rzuca dalej błąd inny niż NoOrganizationError", async () => {
    mockGetOrgContext.mockRejectedValue(new Error("db down"));

    await expect(readOrgContextForApi()).rejects.toThrow("db down");
  });
});
