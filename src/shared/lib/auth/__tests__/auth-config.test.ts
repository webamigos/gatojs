import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockEnv, mockMailer } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
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
    ADMIN_IMPERSONATION: false,
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
  role: string;
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

function rejectNonScalarId(args: unknown) {
  if (/"(id|userId)":\[/.test(JSON.stringify(args ?? null))) {
    throw new Error("Invalid prisma invocation: id must be a string");
  }
}

async function stubUsers(authInstance: Auth, users: StoredUser[]) {
  const context = await authInstance.$context;
  const passwordHash = await context.password.hash(PASSWORD);
  const findUser = async (args: unknown) => {
    rejectNonScalarId(args);
    return (
      users.find(
        (user) => argsMention(args, user.id) || argsMention(args, user.email),
      ) ?? null
    );
  };
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
  mockEnv.ADMIN_IMPERSONATION = false;
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

  it("globalny admin przy ADMIN_IMPERSONATION=false nie może podszyć się pod zwykłego użytkownika", async () => {
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

    await expect(
      auth.api.impersonateUser({ headers, body: { userId: "user-2" } }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.session.create).not.toHaveBeenCalled();
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

const SUPERADMIN_EMAIL = "service@webamigos.pl";
const OTHER_SUPERADMIN_EMAIL = "service-2@webamigos.pl";
const OTHER_ADMIN_EMAIL = "other-admin@example.com";
const REGULAR_EMAIL = "regular@example.com";

const adminCaller = buildUser({
  id: "admin-1",
  email: CALLER_EMAIL,
  role: "admin",
});
const superadminAccount = buildUser({
  id: "super-1",
  email: SUPERADMIN_EMAIL,
  role: "superadmin",
});
const otherSuperadminAccount = buildUser({
  id: "super-2",
  email: OTHER_SUPERADMIN_EMAIL,
  role: "superadmin",
});
const otherAdminAccount = buildUser({
  id: "admin-2",
  email: OTHER_ADMIN_EMAIL,
  role: "admin",
});
const regularAccount = buildUser({
  id: "user-2",
  email: REGULAR_EMAIL,
  role: "user",
});

const ALL_ACCOUNTS = [
  adminCaller,
  superadminAccount,
  otherSuperadminAccount,
  otherAdminAccount,
  regularAccount,
];

async function signInAs(authInstance: Auth, email: string) {
  await stubUsers(authInstance, ALL_ACCOUNTS);
  mockPrisma.member.findFirst.mockResolvedValue(null);
  const headers = await signInHeaders(authInstance, email);
  mockPrisma.session.create.mockClear();
  return headers;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (caught: unknown) => caught,
  );
}

function expectNoUserWrites() {
  expect(mockPrisma.user.create).not.toHaveBeenCalled();
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
  expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  expect(mockPrisma.user.deleteMany).not.toHaveBeenCalled();
  expect(mockPrisma.account.create).not.toHaveBeenCalled();
  expect(mockPrisma.account.update).not.toHaveBeenCalled();
  expect(mockPrisma.account.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.account.delete).not.toHaveBeenCalled();
  expect(mockPrisma.account.deleteMany).not.toHaveBeenCalled();
  expect(mockPrisma.session.create).not.toHaveBeenCalled();
  expect(mockPrisma.session.delete).not.toHaveBeenCalled();
  expect(mockPrisma.session.deleteMany).not.toHaveBeenCalled();
}

function stubUserUpdate() {
  mockPrisma.user.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...otherAdminAccount,
      ...data,
    }),
  );
}

type AdminCall = (api: Auth["api"], headers: Headers) => Promise<unknown>;

describe("plugin admin: konto superadmina jest nietykalne dla admina", () => {
  it.each<[string, AdminCall]>([
    [
      "setRole",
      (api, headers) =>
        api.setRole({ headers, body: { userId: "super-1", role: "user" } }),
    ],
    [
      "removeUser",
      (api, headers) =>
        api.removeUser({ headers, body: { userId: "super-1" } }),
    ],
    [
      "banUser",
      (api, headers) => api.banUser({ headers, body: { userId: "super-1" } }),
    ],
    [
      "unbanUser",
      (api, headers) => api.unbanUser({ headers, body: { userId: "super-1" } }),
    ],
    [
      "setUserPassword",
      (api, headers) =>
        api.setUserPassword({
          headers,
          body: { userId: "super-1", newPassword: "hijacked-password-1" },
        }),
    ],
    [
      "adminUpdateUser",
      (api, headers) =>
        api.adminUpdateUser({
          headers,
          body: { userId: "super-1", data: { name: "Przejęty" } },
        }),
    ],
    [
      "impersonateUser",
      (api, headers) =>
        api.impersonateUser({ headers, body: { userId: "super-1" } }),
    ],
    [
      "revokeUserSessions",
      (api, headers) =>
        api.revokeUserSessions({ headers, body: { userId: "super-1" } }),
    ],
    [
      "listUserSessions",
      (api, headers) =>
        api.listUserSessions({ headers, body: { userId: "super-1" } }),
    ],
  ])(
    "admin → %s na koncie superadmina → 403 i brak zmian w bazie",
    async (_, call) => {
      const headers = await signInAs(auth, CALLER_EMAIL);

      const error = await rejection(call(auth.api, headers));

      expect(error).toMatchObject({ statusCode: 403 });
      expectNoUserWrites();
      expect(mockPrisma.session.findMany).not.toHaveBeenCalled();
    },
  );

  it("admin → revokeUserSession z tokenem sesji superadmina → 403 i sesja zostaje", async () => {
    await stubUsers(auth, ALL_ACCOUNTS);
    mockPrisma.member.findFirst.mockResolvedValue(null);
    const superadminSignIn = await auth.api.signInEmail({
      body: { email: SUPERADMIN_EMAIL, password: PASSWORD },
    });
    const headers = await signInHeaders(auth, CALLER_EMAIL);
    mockPrisma.session.create.mockClear();

    const error = await rejection(
      auth.api.revokeUserSession({
        headers,
        body: { sessionToken: superadminSignIn.token },
      }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });

  it("admin przy ADMIN_IMPERSONATION=true → impersonateUser superadmina → 403", async () => {
    mockEnv.ADMIN_IMPERSONATION = true;
    vi.resetModules();
    const { auth: authWithImpersonation } = await import("../index");
    const headers = await signInAs(authWithImpersonation, CALLER_EMAIL);

    const error = await rejection(
      authWithImpersonation.api.impersonateUser({
        headers,
        body: { userId: "super-1" },
      }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });
});

describe("plugin admin: nadanie roli superadmin", () => {
  it.each<[string, AdminCall]>([
    [
      "setRole na zwykłym użytkowniku",
      (api, headers) =>
        api.setRole({
          headers,
          body: { userId: "user-2", role: "superadmin" },
        }),
    ],
    [
      "setRole na sobie",
      (api, headers) =>
        api.setRole({
          headers,
          body: { userId: "admin-1", role: "superadmin" },
        }),
    ],
    [
      "setRole z tablicą ról",
      (api, headers) =>
        api.setRole({
          headers,
          body: { userId: "user-2", role: ["user", "superadmin"] },
        }),
    ],
    [
      "createUser z role",
      (api, headers) =>
        api.createUser({
          headers,
          body: {
            email: "intruder@example.com",
            password: PASSWORD,
            name: "Intruz",
            role: "superadmin",
          },
        }),
    ],
    [
      "createUser z data.role",
      (api, headers) =>
        api.createUser({
          headers,
          body: {
            email: "intruder@example.com",
            password: PASSWORD,
            name: "Intruz",
            data: { role: "superadmin" },
          },
        }),
    ],
    [
      "adminUpdateUser z data.role",
      (api, headers) =>
        api.adminUpdateUser({
          headers,
          body: { userId: "user-2", data: { role: "superadmin" } },
        }),
    ],
  ])("admin → %s = superadmin → 403 i brak zmian w bazie", async (_, call) => {
    const headers = await signInAs(auth, CALLER_EMAIL);

    const error = await rejection(call(auth.api, headers));

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });

  it("admin → setRole zwykłego użytkownika na admin → sukces", async () => {
    const headers = await signInAs(auth, CALLER_EMAIL);
    mockPrisma.user.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...regularAccount,
        ...data,
      }),
    );

    const result = await auth.api.setRole({
      headers,
      body: { userId: "user-2", role: "admin" },
    });

    expect(result.user).toMatchObject({ id: "user-2", role: "admin" });
  });
});

describe("plugin admin: uprawnienia superadmina", () => {
  it("superadmin → setRole admina na user → sukces", async () => {
    const headers = await signInAs(auth, SUPERADMIN_EMAIL);
    stubUserUpdate();

    const result = await auth.api.setRole({
      headers,
      body: { userId: "admin-2", role: "user" },
    });

    expect(result.user).toMatchObject({ id: "admin-2", role: "user" });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "user" }),
      }),
    );
  });

  it("superadmin → impersonateUser admina → sukces", async () => {
    const headers = await signInAs(auth, SUPERADMIN_EMAIL);

    await auth.api.impersonateUser({ headers, body: { userId: "admin-2" } });

    expect(storedSessionData()).toMatchObject({
      userId: "admin-2",
      impersonatedBy: "super-1",
    });
  });

  it("superadmin → impersonateUser zwykłego użytkownika → sukces", async () => {
    const headers = await signInAs(auth, SUPERADMIN_EMAIL);

    await auth.api.impersonateUser({ headers, body: { userId: "user-2" } });

    expect(storedSessionData()).toMatchObject({
      userId: "user-2",
      impersonatedBy: "super-1",
    });
  });

  it("superadmin → impersonateUser innego superadmina → 403", async () => {
    const headers = await signInAs(auth, SUPERADMIN_EMAIL);

    const error = await rejection(
      auth.api.impersonateUser({ headers, body: { userId: "super-2" } }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });

  it("superadmin → setRole innego superadmina na user → sukces", async () => {
    const headers = await signInAs(auth, SUPERADMIN_EMAIL);
    mockPrisma.user.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...otherSuperadminAccount,
        ...data,
      }),
    );

    const result = await auth.api.setRole({
      headers,
      body: { userId: "super-2", role: "user" },
    });

    expect(result.user).toMatchObject({ id: "super-2", role: "user" });
  });

  it("superadmin → listUsers → sukces", async () => {
    const headers = await signInAs(auth, SUPERADMIN_EMAIL);
    mockPrisma.user.findMany.mockResolvedValue([superadminAccount]);
    mockPrisma.user.count.mockResolvedValue(1);

    const result = await auth.api.listUsers({ headers, query: {} });

    expect(result.users).toEqual([
      expect.objectContaining({ id: "super-1", email: SUPERADMIN_EMAIL }),
    ]);
  });
});

describe("plugin admin: ADMIN_IMPERSONATION=true", () => {
  async function importAuthWithImpersonation() {
    mockEnv.ADMIN_IMPERSONATION = true;
    vi.resetModules();
    const { auth: authWithImpersonation } = await import("../index");
    return authWithImpersonation;
  }

  it("admin → impersonateUser zwykłego użytkownika → sukces", async () => {
    const authWithImpersonation = await importAuthWithImpersonation();
    const headers = await signInAs(authWithImpersonation, CALLER_EMAIL);

    await authWithImpersonation.api.impersonateUser({
      headers,
      body: { userId: "user-2" },
    });

    expect(storedSessionData()).toMatchObject({
      userId: "user-2",
      impersonatedBy: "admin-1",
    });
  });

  it("admin → impersonateUser innego admina → 403", async () => {
    const authWithImpersonation = await importAuthWithImpersonation();
    const headers = await signInAs(authWithImpersonation, CALLER_EMAIL);

    const error = await rejection(
      authWithImpersonation.api.impersonateUser({
        headers,
        body: { userId: "admin-2" },
      }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });
});

const SUPERADMIN_ID_AS_ARRAY = ["super-1"] as unknown as string;

describe("plugin admin: userId spoza stringa nie omija ochrony superadmina", () => {
  it.each<[string, AdminCall]>([
    [
      "banUser",
      (api, headers) =>
        api.banUser({ headers, body: { userId: SUPERADMIN_ID_AS_ARRAY } }),
    ],
    [
      "setRole",
      (api, headers) =>
        api.setRole({
          headers,
          body: { userId: SUPERADMIN_ID_AS_ARRAY, role: "user" },
        }),
    ],
    [
      "setUserPassword",
      (api, headers) =>
        api.setUserPassword({
          headers,
          body: {
            userId: SUPERADMIN_ID_AS_ARRAY,
            newPassword: "hijacked-password-1",
          },
        }),
    ],
    [
      "revokeUserSessions",
      (api, headers) =>
        api.revokeUserSessions({
          headers,
          body: { userId: SUPERADMIN_ID_AS_ARRAY },
        }),
    ],
    [
      "removeUser",
      (api, headers) =>
        api.removeUser({ headers, body: { userId: SUPERADMIN_ID_AS_ARRAY } }),
    ],
    [
      "listUserSessions",
      (api, headers) =>
        api.listUserSessions({
          headers,
          body: { userId: SUPERADMIN_ID_AS_ARRAY },
        }),
    ],
  ])(
    'admin → %s z userId ["super-1"] → 403 i brak zmian w bazie',
    async (_, call) => {
      const headers = await signInAs(auth, CALLER_EMAIL);

      const error = await rejection(call(auth.api, headers));

      expect(error).toMatchObject({ statusCode: 403 });
      expectNoUserWrites();
      expect(mockPrisma.session.findMany).not.toHaveBeenCalled();
    },
  );

  async function postBanUser(headers: Headers, userId: unknown) {
    return auth.handler(
      new Request("http://localhost:3000/api/auth/admin/ban-user", {
        method: "POST",
        headers: {
          cookie: headers.get("cookie") ?? "",
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ userId }),
      }),
    );
  }

  it('POST /api/auth/admin/ban-user z userId ["super-1"] przez handler HTTP → 403', async () => {
    const headers = await signInAs(auth, CALLER_EMAIL);

    const response = await postBanUser(headers, ["super-1"]);

    expect(response.status).toBe(403);
    expectNoUserWrites();
  });

  it("POST /api/auth/admin/ban-user zwykłego użytkownika przez handler HTTP → 200", async () => {
    const headers = await signInAs(auth, CALLER_EMAIL);
    mockPrisma.user.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...regularAccount,
        ...data,
      }),
    );
    mockPrisma.session.findMany.mockResolvedValue([]);
    mockPrisma.session.deleteMany.mockResolvedValue({ count: 0 });

    const response = await postBanUser(headers, "user-2");

    expect(response.status).toBe(200);
  });

  it('superadmin → impersonateUser z userId ["super-2"] → 403', async () => {
    const headers = await signInAs(auth, SUPERADMIN_EMAIL);

    const error = await rejection(
      auth.api.impersonateUser({
        headers,
        body: { userId: ["super-2"] as unknown as string },
      }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });
});

describe("plugin admin: rola aktora z bazy, nie z cookie cache", () => {
  it("superadmin zdegradowany w bazie do admina nie nadaje sobie roli superadmin w tej samej sesji", async () => {
    const demotable = { ...superadminAccount };
    await stubUsers(auth, [demotable, regularAccount]);
    mockPrisma.member.findFirst.mockResolvedValue(null);
    const headers = await signInHeaders(auth, SUPERADMIN_EMAIL);
    mockPrisma.session.create.mockClear();
    demotable.role = "admin";

    const error = await rejection(
      auth.api.setRole({
        headers,
        body: { userId: "super-1", role: "superadmin" },
      }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });

  it("superadmin zdegradowany w bazie do admina nie podszywa się pod admina", async () => {
    const demotable = { ...superadminAccount };
    await stubUsers(auth, [demotable, otherAdminAccount]);
    mockPrisma.member.findFirst.mockResolvedValue(null);
    const headers = await signInHeaders(auth, SUPERADMIN_EMAIL);
    mockPrisma.session.create.mockClear();
    demotable.role = "admin";

    const error = await rejection(
      auth.api.impersonateUser({ headers, body: { userId: "admin-2" } }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });
});

describe("plugin admin: zaufane wywołanie serwerowe createUser", () => {
  function stubUserCreation() {
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
  }

  const SERVICE_ACCOUNT = {
    email: "service-new@webamigos.pl",
    password: PASSWORD,
    name: "Serwis",
    role: "superadmin",
  } as const;

  it("bez nagłówków i bez sesji tworzy konto z rolą superadmin", async () => {
    stubUserCreation();

    const result = await auth.api.createUser({ body: SERVICE_ACCOUNT });

    expect(result.user).toMatchObject({
      email: "service-new@webamigos.pl",
      role: "superadmin",
    });
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.create.mock.calls[0][0].data).toMatchObject({
      role: "superadmin",
    });
  });

  it("z pustymi nagłówkami bez sesji jest odrzucone", async () => {
    stubUserCreation();

    const error = await rejection(
      auth.api.createUser({ headers: new Headers(), body: SERVICE_ACCOUNT }),
    );

    expect(error).toMatchObject({
      statusCode: expect.toSatisfy((code: number) => [401, 403].includes(code)),
    });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});

describe("plugin admin: cel z rolą wielowartościową", () => {
  it('admin → banUser na koncie z rolą "user,superadmin" → 403', async () => {
    const mixedRole = buildUser({
      id: "mixed-1",
      email: "mixed@example.com",
      role: "user,superadmin",
    });
    await stubUsers(auth, [adminCaller, mixedRole]);
    mockPrisma.member.findFirst.mockResolvedValue(null);
    const headers = await signInHeaders(auth, CALLER_EMAIL);
    mockPrisma.session.create.mockClear();

    const error = await rejection(
      auth.api.banUser({ headers, body: { userId: "mixed-1" } }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });

  it('admin → setRole z rolą "user,superadmin" jest odrzucone bez zmian w bazie', async () => {
    const headers = await signInAs(auth, CALLER_EMAIL);

    const error = await rejection(
      auth.api.setRole({
        headers,
        body: {
          userId: "user-2",
          role: "user,superadmin" as unknown as "user",
        },
      }),
    );

    expect(error).toMatchObject({
      statusCode: expect.toSatisfy((code: number) => [400, 403].includes(code)),
    });
    expectNoUserWrites();
  });
});

describe("plugin admin: nieustalony cel → odmowa", () => {
  it("admin → listUserSessions nieistniejącego użytkownika → 403", async () => {
    const headers = await signInAs(auth, CALLER_EMAIL);
    mockPrisma.session.findMany.mockResolvedValue([]);

    const error = await rejection(
      auth.api.listUserSessions({ headers, body: { userId: "ghost-1" } }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expect(mockPrisma.session.findMany).not.toHaveBeenCalled();
  });

  it("admin → revokeUserSession z nieznanym tokenem → 403", async () => {
    const headers = await signInAs(auth, CALLER_EMAIL);

    const error = await rejection(
      auth.api.revokeUserSession({
        headers,
        body: { sessionToken: "token-ghost" },
      }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });

  it.each([
    [CALLER_EMAIL, false],
    [CALLER_EMAIL, true],
    [SUPERADMIN_EMAIL, false],
    [SUPERADMIN_EMAIL, true],
    [REGULAR_EMAIL, true],
  ] as const)(
    "%s → impersonateUser nieistniejącego użytkownika (ADMIN_IMPERSONATION=%s) → 403",
    async (email, adminImpersonation) => {
      mockEnv.ADMIN_IMPERSONATION = adminImpersonation;
      vi.resetModules();
      const { auth: freshAuth } = await import("../index");
      const headers = await signInAs(freshAuth, email);

      const error = await rejection(
        freshAuth.api.impersonateUser({ headers, body: { userId: "ghost-1" } }),
      );

      expect(error).toMatchObject({ statusCode: 403 });
      expectNoUserWrites();
    },
  );
});

describe("plugin admin: cel z userId i sessionToken naraz", () => {
  it("POST /api/auth/admin/revoke-user-session z userId zwykłego usera i tokenem superadmina → 403, sesja zostaje", async () => {
    await stubUsers(auth, ALL_ACCOUNTS);
    mockPrisma.member.findFirst.mockResolvedValue(null);
    const superadminSignIn = await auth.api.signInEmail({
      body: { email: SUPERADMIN_EMAIL, password: PASSWORD },
    });
    const headers = await signInHeaders(auth, CALLER_EMAIL);
    mockPrisma.session.create.mockClear();

    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/admin/revoke-user-session", {
        method: "POST",
        headers: {
          cookie: headers.get("cookie") ?? "",
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: "user-2",
          sessionToken: superadminSignIn.token,
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mockPrisma.session.delete).not.toHaveBeenCalled();
    expect(mockPrisma.session.deleteMany).not.toHaveBeenCalled();
    expectNoUserWrites();
  });
});

describe("plugin admin: wywołanie z request bez headers", () => {
  function banUserRequest(cookie: string | null) {
    return new Request("http://localhost:3000/api/auth/admin/ban-user", {
      method: "POST",
      headers: {
        ...(cookie === null ? {} : { cookie }),
        origin: "http://localhost:3000",
      },
    });
  }

  it("admin → banUser superadmina z request z ciasteczkiem admina → 403 i brak zmian w bazie", async () => {
    const headers = await signInAs(auth, CALLER_EMAIL);

    const error = await rejection(
      auth.api.banUser({
        request: banUserRequest(headers.get("cookie") ?? ""),
        body: { userId: "super-1" },
      }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });

  it("banUser superadmina z request bez ciasteczka → dokładnie 403 i brak zmian w bazie", async () => {
    await stubUsers(auth, ALL_ACCOUNTS);

    const error = await rejection(
      auth.api.banUser({
        request: banUserRequest(null),
        body: { userId: "super-1" },
      }),
    );

    expect(error).toMatchObject({ statusCode: 403 });
    expectNoUserWrites();
  });
});
