import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockEnv } = vi.hoisted(() => ({
  mockPrisma: {
    invitation: { findFirst: vi.fn(), update: vi.fn() },
    organization: { findFirst: vi.fn(), create: vi.fn() },
    member: { create: vi.fn(), findFirst: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    account: { create: vi.fn() },
    $transaction: vi.fn(),
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

const signupBody = {
  name: "Jan",
  email: "jan@example.com",
  password: "password123",
};

function stubUserPersistence() {
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "user-new",
    }),
  );
  mockPrisma.account.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "acc-new",
    }),
  );
  mockPrisma.member.create.mockImplementation((args: unknown) => args);
  mockPrisma.invitation.update.mockImplementation((args: unknown) => args);
  mockPrisma.$transaction.mockImplementation(async (ops: unknown) =>
    Array.isArray(ops) ? ops : undefined,
  );
}

describe("auth.api.signUpEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEnv.AUTH_PUBLIC_SIGNUP = false;
    mockEnv.MULTI_ORG = false;
    stubUserPersistence();
  });

  it("zwraca 403 gdy publiczna rejestracja wyłączona i brak zaproszenia", async () => {
    await expect(
      auth.api.signUpEmail({ body: signupBody }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.invitation.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("MULTI_ORG=false bez organizacji → czytelny błąd i brak użytkownika", async () => {
    mockEnv.AUTH_PUBLIC_SIGNUP = true;
    mockPrisma.organization.findFirst.mockResolvedValue(null);

    await expect(auth.api.signUpEmail({ body: signupBody })).rejects.toThrow(
      "Aplikacja nie jest skonfigurowana: uruchom npm run admin:create",
    );
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.account.create).not.toHaveBeenCalled();
    expect(mockPrisma.member.create).not.toHaveBeenCalled();
  });

  it("błąd resolveSignupMembership przerywa rejestrację przed utworzeniem użytkownika", async () => {
    mockEnv.AUTH_PUBLIC_SIGNUP = true;
    mockPrisma.organization.findFirst.mockRejectedValue(new Error("db down"));

    await expect(auth.api.signUpEmail({ body: signupBody })).rejects.toThrow();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.member.create).not.toHaveBeenCalled();
  });

  it("MULTI_ORG=false dołącza nowego użytkownika do jedynej organizacji", async () => {
    mockEnv.AUTH_PUBLIC_SIGNUP = true;
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-only" });

    await auth.api.signUpEmail({ body: signupBody });

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.member.create).toHaveBeenCalledWith({
      data: { organizationId: "org-only", userId: "user-new", role: "member" },
    });
    expect(mockPrisma.organization.create).not.toHaveBeenCalled();
  });

  it("MULTI_ORG=true zakłada organizację nowemu użytkownikowi jako owner", async () => {
    mockEnv.AUTH_PUBLIC_SIGNUP = true;
    mockEnv.MULTI_ORG = true;

    await auth.api.signUpEmail({ body: signupBody });

    const { data } = mockPrisma.organization.create.mock.calls[0][0];
    expect(data.name).toBe("Jan — organizacja");
    expect(data.members).toEqual({
      create: { userId: "user-new", role: "owner" },
    });
  });

  it("rejestracja z zaproszeniem dołącza do organizacji zaproszenia i akceptuje zaproszenie", async () => {
    mockPrisma.invitation.findFirst.mockResolvedValue({
      id: "inv-1",
      organizationId: "org-invited",
      role: "admin",
    });

    await auth.api.signUpEmail({
      body: { ...signupBody, invitationId: "inv-1" } as typeof signupBody,
    });

    expect(mockPrisma.member.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-invited",
        userId: "user-new",
        role: "admin",
      },
    });
    expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "accepted" },
    });
    expect(mockPrisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it("publiczna rejestracja wyłączona: ważne zaproszenie przepuszcza bramkę", async () => {
    mockPrisma.invitation.findFirst.mockResolvedValue({
      id: "inv-1",
      organizationId: "org-invited",
      role: "member",
    });

    await expect(
      auth.api.signUpEmail({
        body: { ...signupBody, invitationId: "inv-1" } as typeof signupBody,
      }),
    ).resolves.toMatchObject({ user: { id: "user-new" } });

    expect(mockPrisma.invitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "inv-1",
          email: { equals: signupBody.email, mode: "insensitive" },
          status: "pending",
        }),
      }),
    );
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
  });

  it("publiczna rejestracja wyłączona: nieważne zaproszenie → 403", async () => {
    mockPrisma.invitation.findFirst.mockResolvedValue(null);

    await expect(
      auth.api.signUpEmail({
        body: { ...signupBody, invitationId: "inv-x" } as typeof signupBody,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("użytkownik tworzony przez admin createUser nie dostaje członkostwa", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-only" });

    await auth.api.createUser({
      body: {
        name: "Ewa",
        email: "ewa@example.com",
        password: "password123",
      },
    });

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.member.create).not.toHaveBeenCalled();
    expect(mockPrisma.organization.create).not.toHaveBeenCalled();
    expect(mockPrisma.organization.findFirst).not.toHaveBeenCalled();
  });
});

describe("organization plugin", () => {
  it("tworzenie organizacji przez użytkownika tylko przy MULTI_ORG=true", async () => {
    const plugin = auth.options.plugins.find(
      (candidate) => candidate.id === "organization",
    ) as unknown as {
      options: { allowUserToCreateOrganization: () => Promise<boolean> };
    };

    mockEnv.MULTI_ORG = false;
    await expect(plugin.options.allowUserToCreateOrganization()).resolves.toBe(
      false,
    );
    mockEnv.MULTI_ORG = true;
    await expect(plugin.options.allowUserToCreateOrganization()).resolves.toBe(
      true,
    );
  });
});
