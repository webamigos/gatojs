import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockEnv, mockMailer } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    account: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    verification: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    organization: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    member: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    invitation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockEnv: {
    BETTER_AUTH_SECRET: "s".repeat(32),
    APP_URL: "http://localhost:3000",
    AUTH_PUBLIC_SIGNUP: false,
    MULTI_ORG: false,
  },
  mockMailer: {
    sendOrganizationInvitationEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  },
}));

vi.mock("@/shared/lib/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/mailer", () => mockMailer);

import { auth } from "../index";

type Auth = typeof auth;
type StoredUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: "admin" | "user";
  banned: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const PASSWORD = "password123";
const CALLER_EMAIL = "caller@example.com";
const INVITEE_EMAIL = "new@example.com";
const now = new Date();

function buildUser(
  overrides: Partial<StoredUser> & Pick<StoredUser, "id" | "email">,
): StoredUser {
  return {
    name: "Caller",
    emailVerified: true,
    role: "user",
    banned: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function argsMention(args: unknown, value: string): boolean {
  return JSON.stringify(args ?? null).includes(`"${value}"`);
}

async function stubUsers(authInstance: Auth, users: StoredUser[]) {
  const context = await authInstance.$context;
  const passwordHash = await context.password.hash(PASSWORD);
  const findUser = async (args: unknown) =>
    users.find(
      (user) => argsMention(args, user.id) || argsMention(args, user.email),
    ) ?? null;
  mockPrisma.user.findFirst.mockImplementation(findUser);
  mockPrisma.user.findUnique.mockImplementation(findUser);
  const accountFor = async (args: unknown) => {
    const owner = users.find((user) => argsMention(args, user.id));
    return owner
      ? [
          {
            id: `acc-${owner.id}`,
            userId: owner.id,
            accountId: owner.id,
            providerId: "credential",
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [];
  };
  mockPrisma.account.findMany.mockImplementation(accountFor);
  mockPrisma.account.findFirst.mockImplementation(
    async (args: unknown) => (await accountFor(args))[0] ?? null,
  );
  const sessions: Record<string, unknown>[] = [];
  mockPrisma.session.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      const session = { ...data, id: `sess-${sessions.length + 1}` };
      sessions.push(session);
      return session;
    },
  );
  const findSession = async (args: unknown) =>
    sessions.find((session) => argsMention(args, String(session.token))) ??
    null;
  mockPrisma.session.findFirst.mockImplementation(findSession);
  mockPrisma.session.findUnique.mockImplementation(findSession);
}

async function signInHeaders(
  authInstance: Auth,
  email = CALLER_EMAIL,
): Promise<Headers> {
  const { headers } = await authInstance.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

function storedSessionData(): Record<string, unknown> {
  expect(mockPrisma.session.create).toHaveBeenCalledTimes(1);
  return mockPrisma.session.create.mock.calls[0][0].data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockEnv.APP_URL = "http://localhost:3000";
  mockEnv.AUTH_PUBLIC_SIGNUP = false;
  mockEnv.MULTI_ORG = false;
});

describe("sesja: domyślna aktywna organizacja", () => {
  const caller = buildUser({ id: "user-1", email: CALLER_EMAIL });

  it("logowanie ustawia activeOrganizationId na organizację najstarszego członkostwa", async () => {
    await stubUsers(auth, [caller]);
    mockPrisma.member.findFirst.mockImplementation(
      async (args: {
        where?: { userId?: string };
        orderBy?: { createdAt?: string };
      }) =>
        args?.where?.userId === "user-1" && args?.orderBy?.createdAt === "asc"
          ? { id: "mem-old", organizationId: "org-oldest", userId: "user-1" }
          : { id: "mem-new", organizationId: "org-newest", userId: "user-1" },
    );

    await auth.api.signInEmail({
      body: { email: CALLER_EMAIL, password: PASSWORD },
    });

    expect(storedSessionData()).toMatchObject({
      activeOrganizationId: "org-oldest",
    });
  });

  it("logowanie zachowuje userId, token i expiresAt sesji", async () => {
    await stubUsers(auth, [caller]);
    mockPrisma.member.findFirst.mockResolvedValue({
      id: "mem-old",
      organizationId: "org-oldest",
      userId: "user-1",
    });

    const result = await auth.api.signInEmail({
      body: { email: CALLER_EMAIL, password: PASSWORD },
    });

    const data = storedSessionData();
    expect(data.userId).toBe("user-1");
    expect(data.token).toBe(result.token);
    expect(typeof data.token).toBe("string");
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect((data.expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("użytkownik bez członkostwa loguje się z activeOrganizationId null", async () => {
    await stubUsers(auth, [caller]);
    mockPrisma.member.findFirst.mockResolvedValue(null);

    const result = await auth.api.signInEmail({
      body: { email: CALLER_EMAIL, password: PASSWORD },
    });

    expect(result.user.id).toBe("user-1");
    expect(storedSessionData().activeOrganizationId).toBeNull();
  });
});

describe("plugin admin: role", () => {
  it("globalny admin może wywołać listUsers", async () => {
    const admin = buildUser({
      id: "admin-1",
      email: CALLER_EMAIL,
      role: "admin",
    });
    await stubUsers(auth, [admin]);
    mockPrisma.member.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([admin]);
    mockPrisma.user.count.mockResolvedValue(1);
    const headers = await signInHeaders(auth);

    const result = await auth.api.listUsers({ headers, query: {} });

    expect(result.users).toEqual([
      expect.objectContaining({ id: "admin-1", email: CALLER_EMAIL }),
    ]);
  });

  it("użytkownik z rolą user nie może wywołać listUsers", async () => {
    const user = buildUser({ id: "user-1", email: CALLER_EMAIL, role: "user" });
    await stubUsers(auth, [user]);
    mockPrisma.member.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.user.count.mockResolvedValue(1);
    const headers = await signInHeaders(auth);

    const error = await auth.api.listUsers({ headers, query: {} }).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({
      statusCode: expect.toSatisfy((code: number) => [401, 403].includes(code)),
    });
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("globalny admin nie może podszyć się pod innego admina", async () => {
    const admin = buildUser({
      id: "admin-1",
      email: CALLER_EMAIL,
      role: "admin",
    });
    const otherAdmin = buildUser({
      id: "admin-2",
      email: "other-admin@example.com",
      role: "admin",
    });
    await stubUsers(auth, [admin, otherAdmin]);
    mockPrisma.member.findFirst.mockResolvedValue(null);
    const headers = await signInHeaders(auth);
    mockPrisma.session.create.mockClear();

    await expect(
      auth.api.impersonateUser({ headers, body: { userId: "admin-2" } }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.session.create).not.toHaveBeenCalled();
  });

  it("globalny admin może podszyć się pod zwykłego użytkownika", async () => {
    const admin = buildUser({
      id: "admin-1",
      email: CALLER_EMAIL,
      role: "admin",
    });
    const regular = buildUser({
      id: "user-2",
      email: "regular@example.com",
      role: "user",
    });
    await stubUsers(auth, [admin, regular]);
    mockPrisma.member.findFirst.mockResolvedValue(null);
    const headers = await signInHeaders(auth);
    mockPrisma.session.create.mockClear();

    await auth.api.impersonateUser({ headers, body: { userId: "user-2" } });

    expect(storedSessionData()).toMatchObject({
      userId: "user-2",
      impersonatedBy: "admin-1",
    });
  });

  it("rejestracja tworzy użytkownika z rolą user", async () => {
    mockEnv.AUTH_PUBLIC_SIGNUP = true;
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
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-only" });
    mockPrisma.member.create.mockImplementation((args: unknown) => args);
    mockPrisma.$transaction.mockImplementation(async (ops: unknown) =>
      Array.isArray(ops) ? ops : undefined,
    );
    mockPrisma.session.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: "sess-new",
      }),
    );

    await auth.api.signUpEmail({
      body: { name: "Jan", email: "jan@example.com", password: PASSWORD },
    });

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.create.mock.calls[0][0].data).toMatchObject({
      email: "jan@example.com",
      role: "user",
    });
  });
});

async function stubInvitingAdmin(authInstance: Auth) {
  const admin = buildUser({
    id: "admin-1",
    name: "Anna Admin",
    email: CALLER_EMAIL,
    role: "admin",
  });
  await stubUsers(authInstance, [admin]);
  const member = {
    id: "mem-1",
    organizationId: "org-1",
    userId: admin.id,
    role: "owner",
    createdAt: now,
  };
  mockPrisma.organization.findFirst.mockResolvedValue({
    id: "org-1",
    name: "Firma Testowa",
    slug: "firma-testowa",
    createdAt: now,
  });
  mockPrisma.member.findFirst.mockResolvedValue({ ...member, user: admin });
  mockPrisma.member.findMany.mockResolvedValue([member]);
  mockPrisma.member.count.mockResolvedValue(1);
  mockPrisma.invitation.findFirst.mockResolvedValue(null);
  mockPrisma.invitation.findMany.mockResolvedValue([]);
  mockPrisma.invitation.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "inv-42",
    }),
  );
  mockMailer.sendOrganizationInvitationEmail.mockResolvedValue({ data: null });
}

async function inviteMember(authInstance: Auth) {
  const headers = await signInHeaders(authInstance);
  return authInstance.api.createInvitation({
    headers,
    body: { email: INVITEE_EMAIL, role: "member", organizationId: "org-1" },
  });
}

describe("organizacja: mail z zaproszeniem", () => {
  it("zaproszenie wysyła mail z linkiem akceptacji, nazwą organizacji i imieniem zapraszającego", async () => {
    await stubInvitingAdmin(auth);

    await inviteMember(auth);

    expect(mockMailer.sendOrganizationInvitationEmail).toHaveBeenCalledTimes(1);
    expect(mockMailer.sendOrganizationInvitationEmail).toHaveBeenCalledWith({
      to: INVITEE_EMAIL,
      organizationName: "Firma Testowa",
      inviterName: "Anna Admin",
      acceptUrl: "http://localhost:3000/accept-invitation/inv-42",
    });
  });

  it("APP_URL z końcowym ukośnikiem → link akceptacji bez podwójnego ukośnika", async () => {
    mockEnv.APP_URL = "http://localhost:3000/";
    vi.resetModules();
    const { auth: authWithSlash } = await import("../index");
    await stubInvitingAdmin(authWithSlash);

    await inviteMember(authWithSlash);

    expect(mockMailer.sendOrganizationInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptUrl: "http://localhost:3000/accept-invitation/inv-42",
      }),
    );
  });
});

describe("mail resetu hasła", () => {
  it("prośba o reset dla istniejącego użytkownika wysyła jeden mail z linkiem resetu", async () => {
    await stubUsers(auth, [buildUser({ id: "user-1", email: CALLER_EMAIL })]);
    mockPrisma.verification.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: "ver-1",
      }),
    );
    mockMailer.sendPasswordResetEmail.mockResolvedValue({ data: null });

    await auth.api.requestPasswordReset({
      body: { email: CALLER_EMAIL, redirectTo: "/reset-password" },
    });

    expect(mockMailer.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [{ to, resetUrl }] = mockMailer.sendPasswordResetEmail.mock.calls[0];
    expect(to).toBe(CALLER_EMAIL);
    expect(resetUrl).toMatch(
      /^http:\/\/localhost:3000\/api\/auth\/reset-password\/[^/?]+/,
    );
  });

  it("prośba o reset dla nieistniejącego emaila nie wysyła maila", async () => {
    await stubUsers(auth, []);
    mockPrisma.verification.findMany.mockResolvedValue([]);
    mockPrisma.verification.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.verification.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: "ver-1",
      }),
    );

    await auth.api.requestPasswordReset({
      body: { email: "ghost@example.com", redirectTo: "/reset-password" },
    });

    expect(mockMailer.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
