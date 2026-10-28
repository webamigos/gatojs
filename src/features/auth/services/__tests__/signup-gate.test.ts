import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindFirst } = vi.hoisted(() => ({ mockFindFirst: vi.fn() }));

vi.mock("@/shared/lib/prisma", () => ({
  prisma: { invitation: { findFirst: mockFindFirst } },
}));

import { enforceSignupPolicy, readBodyString } from "../signup-gate";

const validBody = { email: "Jan@Example.com", invitationId: "inv-1" };

async function expectForbidden(promise: Promise<void>) {
  await expect(promise).rejects.toMatchObject({
    status: "FORBIDDEN",
    statusCode: 403,
    message: "Rejestracja jest wyłączona",
  });
}

describe("enforceSignupPolicy", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it("odrzuca rejestrację bez invitationId gdy publiczna wyłączona", async () => {
    await expectForbidden(
      enforceSignupPolicy({ email: "a@b.pl", password: "x" }, false),
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it.each([
    [{ email: "a@b.pl", invitationId: 123 }],
    [{ email: "a@b.pl", invitationId: "" }],
    [{ invitationId: "inv-1" }],
    [{ email: 5, invitationId: "inv-1" }],
    [undefined],
    [null],
  ])("odrzuca nieprawidłowe body %j bez zapytania do bazy", async (body) => {
    await expectForbidden(enforceSignupPolicy(body, false));
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("szuka ważnego zaproszenia na ten email", async () => {
    mockFindFirst.mockResolvedValue({ id: "inv-1" });
    const before = Date.now();

    await enforceSignupPolicy(validBody, false);

    const { where } = mockFindFirst.mock.calls[0][0];
    expect(where).toMatchObject({
      id: "inv-1",
      email: { equals: "Jan@Example.com", mode: "insensitive" },
      status: "pending",
    });
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    expect(where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("odrzuca gdy brak pasującego zaproszenia", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expectForbidden(enforceSignupPolicy(validBody, false));
  });

  it("pozwala gdy zaproszenie pasuje", async () => {
    mockFindFirst.mockResolvedValue({ id: "inv-1" });
    await expect(
      enforceSignupPolicy(validBody, false),
    ).resolves.toBeUndefined();
  });

  it("pozwala przy publicznej rejestracji bez zapytania do bazy", async () => {
    await expect(
      enforceSignupPolicy({ email: "a@b.pl" }, true),
    ).resolves.toBeUndefined();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});

describe("readBodyString", () => {
  it("zwraca niepusty napis", () => {
    expect(readBodyString({ email: "a@b.pl" }, "email")).toBe("a@b.pl");
  });

  it.each([
    [{ email: "" }],
    [{ email: 5 }],
    [{ email: { equals: "a@b.pl" } }],
    [{ email: ["a@b.pl"] }],
    [{ email: null }],
    [{}],
    [null],
    ["email"],
  ])("body %j → undefined", (body) => {
    expect(readBodyString(body, "email")).toBeUndefined();
  });

  it.each([["toString"], ["constructor"], ["__proto__"]])(
    "nie czyta odziedziczonego klucza %s",
    (key) => {
      expect(readBodyString({}, key)).toBeUndefined();
    },
  );
});
