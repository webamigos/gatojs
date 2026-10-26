import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindFirst, mockEnv } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockEnv: {
    BETTER_AUTH_SECRET: "s".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
    AUTH_PUBLIC_SIGNUP: false,
  },
}));

vi.mock("@/shared/lib/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/prisma", () => ({
  prisma: { invitation: { findFirst: mockFindFirst } },
}));

import { auth } from "../index";

describe("auth.api.signUpEmail", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockEnv.AUTH_PUBLIC_SIGNUP = false;
  });

  it("zwraca 403 gdy publiczna rejestracja wyłączona i brak zaproszenia", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Jan",
          email: "jan@example.com",
          password: "password123",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});
