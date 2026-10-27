import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockEnv, mockMailer } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    account: { findFirst: vi.fn(), findMany: vi.fn() },
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    organization: { findFirst: vi.fn(), findUnique: vi.fn() },
    member: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
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
  mockMailer: { sendOrganizationInvitationEmail: vi.fn() },
}));

vi.mock("@/shared/lib/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/mailer", () => mockMailer);

import { organization } from "better-auth/plugins";
import { auth } from "../index";
import {
  assertGlobalAdmin,
  requiresGlobalAdminInSingleOrg,
} from "../single-org-guard";

const PASSWORD = "password123";
const INVITEE_EMAIL = "new@example.com";
const now = new Date();

type Caller = {
  globalRole: "superadmin" | "admin" | "user";
  orgRole: "owner" | "admin";
};

async function stubCaller({ globalRole, orgRole }: Caller) {
  const context = await auth.$context;
  const user = {
    id: "caller-1",
    name: "Caller",
    email: "caller@example.com",
    emailVerified: true,
    role: globalRole,
    banned: false,
    createdAt: now,
    updatedAt: now,
  };
  const account = {
    id: "acc-1",
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: await context.password.hash(PASSWORD),
    createdAt: now,
    updatedAt: now,
  };
  const member = {
    id: "mem-1",
    organizationId: "org-1",
    userId: user.id,
    role: orgRole,
    createdAt: now,
  };
  const findCaller = async (args: unknown) =>
    JSON.stringify(args).includes(INVITEE_EMAIL) ? null : user;
  mockPrisma.user.findFirst.mockImplementation(findCaller);
  mockPrisma.user.findUnique.mockImplementation(findCaller);
  mockPrisma.account.findMany.mockResolvedValue([account]);
  mockPrisma.account.findFirst.mockResolvedValue(account);
  mockPrisma.session.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "sess-1",
    }),
  );
  mockPrisma.organization.findFirst.mockResolvedValue({
    id: "org-1",
    name: "Org",
    slug: "org",
    createdAt: now,
  });
  mockPrisma.member.findFirst.mockResolvedValue({ ...member, user });
  mockPrisma.member.findMany.mockResolvedValue([member]);
  mockPrisma.member.count.mockResolvedValue(1);
  mockPrisma.invitation.findFirst.mockResolvedValue(null);
  mockPrisma.invitation.findMany.mockResolvedValue([]);
  mockPrisma.invitation.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "inv-new",
    }),
  );
  mockMailer.sendOrganizationInvitationEmail.mockResolvedValue({ data: null });
}

async function signInHeaders(): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email: "caller@example.com", password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

async function inviteMember(headers: Headers) {
  return auth.api.createInvitation({
    headers,
    body: {
      email: INVITEE_EMAIL,
      role: "member",
      organizationId: "org-1",
    },
  });
}

describe("single-org guard on organization endpoints", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEnv.MULTI_ORG = false;
  });

  it("MULTI_ORG=false: admin organizacji bez roli globalnej → 403 na invite-member", async () => {
    await stubCaller({ globalRole: "user", orgRole: "admin" });
    const headers = await signInHeaders();

    await expect(inviteMember(headers)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
  });

  it("MULTI_ORG=false: owner organizacji bez roli globalnej → 403 na remove-member", async () => {
    await stubCaller({ globalRole: "user", orgRole: "owner" });
    const headers = await signInHeaders();

    await expect(
      auth.api.removeMember({
        headers,
        body: { memberIdOrEmail: "mem-2", organizationId: "org-1" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("MULTI_ORG=false: brak sesji → 403 na invite-member", async () => {
    await stubCaller({ globalRole: "user", orgRole: "admin" });

    await expect(inviteMember(new Headers())).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("MULTI_ORG=false: globalny admin może zaprosić", async () => {
    await stubCaller({ globalRole: "admin", orgRole: "admin" });
    const headers = await signInHeaders();

    await expect(inviteMember(headers)).resolves.toMatchObject({
      email: INVITEE_EMAIL,
      organizationId: "org-1",
    });
    expect(mockPrisma.invitation.create).toHaveBeenCalledTimes(1);
  });

  it("MULTI_ORG=false: superadmin może zaprosić", async () => {
    await stubCaller({ globalRole: "superadmin", orgRole: "admin" });
    const headers = await signInHeaders();

    await expect(inviteMember(headers)).resolves.toMatchObject({
      email: INVITEE_EMAIL,
      organizationId: "org-1",
    });
    expect(mockPrisma.invitation.create).toHaveBeenCalledTimes(1);
  });

  it("MULTI_ORG=true: admin organizacji może zaprosić", async () => {
    mockEnv.MULTI_ORG = true;
    await stubCaller({ globalRole: "user", orgRole: "admin" });
    const headers = await signInHeaders();

    await expect(inviteMember(headers)).resolves.toMatchObject({
      email: INVITEE_EMAIL,
    });
    expect(mockPrisma.invitation.create).toHaveBeenCalledTimes(1);
  });

  it("MULTI_ORG=false: accept-invitation nie jest blokowane przez guard", async () => {
    await stubCaller({ globalRole: "user", orgRole: "admin" });
    const headers = await signInHeaders();

    await expect(
      auth.api.acceptInvitation({
        headers,
        body: { invitationId: "missing" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

const MEMBER_SELF_SERVICE_PATHS = [
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/leave",
  "/organization/set-active",
  "/organization/set-active-team",
  "/organization/check-slug",
  "/organization/has-permission",
];

function mutatingOrganizationPaths(): string[] {
  const plugin = organization({
    teams: { enabled: true },
    dynamicAccessControl: { enabled: true },
  });
  return Object.values(plugin.endpoints)
    .filter((endpoint) => {
      const methods = [endpoint.options.method].flat();
      return typeof endpoint.path === "string" && !methods.includes("GET");
    })
    .map((endpoint) => endpoint.path as string);
}

describe("requiresGlobalAdminInSingleOrg", () => {
  const adminPaths = mutatingOrganizationPaths().filter(
    (path) => !MEMBER_SELF_SERVICE_PATHS.includes(path),
  );

  it("lista endpointów better-auth zawiera endpointy administracyjne", () => {
    expect(adminPaths).toEqual(
      expect.arrayContaining([
        "/organization/update-member-role",
        "/organization/delete",
        "/organization/create-role",
        "/organization/add-team-member",
      ]),
    );
  });

  it.each(adminPaths)(
    "MULTI_ORG=false: %s wymaga globalnego admina",
    (path) => {
      expect(requiresGlobalAdminInSingleOrg(path, false)).toBe(true);
    },
  );

  it.each(adminPaths)("MULTI_ORG=true: %s bez guardu", (path) => {
    expect(requiresGlobalAdminInSingleOrg(path, true)).toBe(false);
  });

  it.each(MEMBER_SELF_SERVICE_PATHS)(
    "MULTI_ORG=false: %s dostępne bez globalnego admina",
    (path) => {
      expect(requiresGlobalAdminInSingleOrg(path, false)).toBe(false);
    },
  );
});

describe("assertGlobalAdmin", () => {
  it.each([["user"], [undefined], [null], ["owner"], ["SuperAdmin"], ["root"]])(
    "rola %j → 403 z komunikatem",
    (role) => {
      expect(() => assertGlobalAdmin(role)).toThrow(
        expect.objectContaining({
          statusCode: 403,
          message: "Zarządzanie organizacją wymaga roli administratora",
        }),
      );
    },
  );

  it("globalny admin przechodzi", () => {
    expect(() => assertGlobalAdmin("admin")).not.toThrow();
  });

  it("superadmin przechodzi", () => {
    expect(() => assertGlobalAdmin("superadmin")).not.toThrow();
  });
});
