import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockEnv } = vi.hoisted(() => ({
  mockPrisma: {
    verification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  mockEnv: {
    BETTER_AUTH_SECRET: "s".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
    AUTH_PUBLIC_SIGNUP: false,
    MULTI_ORG: false,
  },
}));

vi.mock("@/shared/lib/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));

import { auth } from "../index";
import { WELCOME_SET_PASSWORD_PATH } from "../reset-password-routing";
import { createWelcomeSetPasswordUrl } from "../welcome-set-password";

type VerificationRow = {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

let stored: VerificationRow | null = null;

beforeEach(() => {
  stored = null;
  mockPrisma.verification.create.mockImplementation(
    async ({ data }: { data: Omit<VerificationRow, "id"> }) => {
      stored = { ...data, id: "ver-1" } as VerificationRow;
      return stored;
    },
  );
  mockPrisma.verification.findFirst.mockImplementation(async () => stored);
  mockPrisma.verification.findMany.mockImplementation(async () =>
    stored ? [stored] : [],
  );
  mockPrisma.verification.deleteMany.mockResolvedValue({ count: 0 });
});

describe("createWelcomeSetPasswordUrl", () => {
  it("zapisuje token reset-password dla użytkownika z ważnością 48h", async () => {
    const before = Date.now();

    const url = new URL(await createWelcomeSetPasswordUrl("user-1"));

    const token = url.pathname.split("/").at(-1);
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname).toBe(`/api/auth/reset-password/${token}`);
    expect(url.searchParams.get("callbackURL")).toBe(WELCOME_SET_PASSWORD_PATH);
    expect(stored).toMatchObject({
      identifier: `reset-password:${token}`,
      value: "user-1",
    });
    const ttlMs = stored!.expiresAt.getTime() - before;
    expect(ttlMs).toBeGreaterThan(48 * 60 * 60 * 1000 - 5000);
    expect(ttlMs).toBeLessThanOrEqual(48 * 60 * 60 * 1000 + 5000);
  });

  it("URL przechodzi przez trasę reset-password better-auth na stronę set-password z tokenem", async () => {
    const url = await createWelcomeSetPasswordUrl("user-1");
    const token = new URL(url).pathname.split("/").at(-1);

    const response = await auth.handler(new Request(url));

    expect(response.status).toBe(302);
    const location = new URL(
      response.headers.get("location") ?? "",
      "http://localhost:3000",
    );
    expect(location.pathname).toBe(WELCOME_SET_PASSWORD_PATH);
    expect(location.searchParams.get("token")).toBe(token);
    expect(location.searchParams.get("error")).toBeNull();
  });
});
