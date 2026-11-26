import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockEnv, signedUp, created, timeline } = vi.hoisted(() => ({
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
    APP_URL: "http://localhost:3000",
    AUTH_PUBLIC_SIGNUP: true,
    MULTI_ORG: false,
    ADMIN_IMPERSONATION: false,
  },
  signedUp: [] as unknown[],
  created: [] as unknown[],
  timeline: [] as string[],
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/mailer", () => ({
  sendOrganizationInvitationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("@/modules.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.generated")>()),
  moduleEvents: [],
  moduleSubscribers: [
    {
      module: "probe",
      value: {
        "auth.signed-up": {
          id: "probe.signed-up",
          run: (event: unknown) => {
            timeline.push("auth.signed-up");
            signedUp.push(event);
          },
        },
        "organizations.created": {
          id: "probe.created",
          run: (event: unknown) => {
            timeline.push("organizations.created");
            created.push(event);
          },
        },
      },
    },
  ],
}));

import { auth } from "../index";
import { withInviteSignup } from "../invite-signup-scope";

const signupBody = {
  name: "Jan",
  email: "jan@example.com",
  password: "password123",
};

type AfterUserCreate = NonNullable<
  NonNullable<
    NonNullable<
      NonNullable<typeof auth.options.databaseHooks>["user"]
    >["create"]
  >["after"]
>;

const createdUser = {
  id: "user-direct",
  email: "direct@example.com",
  name: "Direct",
  emailVerified: false,
  createdAt: new Date("2026-11-26T00:00:00.000Z"),
  updatedAt: new Date("2026-11-26T00:00:00.000Z"),
} as Parameters<AfterUserCreate>[0];

function afterUserCreate(): AfterUserCreate {
  const after = auth.options.databaseHooks?.user?.create?.after;
  if (!after) {
    throw new Error("databaseHooks.user.create.after is missing");
  }
  return after;
}

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
  mockPrisma.organization.create.mockResolvedValue({
    id: "org-new",
    slug: "jan-organizacja-abcd1234",
  });
  mockPrisma.member.create.mockImplementation((args: unknown) => args);
  mockPrisma.invitation.update.mockImplementation((args: unknown) => args);
  mockPrisma.$transaction.mockImplementation(async (ops: unknown) =>
    Array.isArray(ops) ? ops : undefined,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockEnv.AUTH_PUBLIC_SIGNUP = true;
  mockEnv.MULTI_ORG = false;
  signedUp.length = 0;
  created.length = 0;
  timeline.length = 0;
  stubUserPersistence();
});

describe("databaseHooks.user.create.after: auth.signed-up", () => {
  it("joining the only organization emits one auth.signed-up for that organization with the new user as actor", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-only" });

    await auth.api.signUpEmail({ body: signupBody });

    expect(signedUp).toEqual([
      {
        name: "auth.signed-up",
        organizationId: "org-only",
        actorUserId: "user-new",
        payload: { userId: "user-new", email: "jan@example.com" },
      },
    ]);
    expect(created).toEqual([]);
  });

  it("signing up with an invitation emits auth.signed-up for the invitation's organization", async () => {
    mockEnv.AUTH_PUBLIC_SIGNUP = false;
    mockPrisma.invitation.findFirst.mockResolvedValue({
      id: "inv-1",
      organizationId: "org-invited",
      role: "admin",
    });

    await auth.api.signUpEmail({
      body: { ...signupBody, invitationId: "inv-1" } as typeof signupBody,
    });

    expect(signedUp).toEqual([
      {
        name: "auth.signed-up",
        organizationId: "org-invited",
        actorUserId: "user-new",
        payload: { userId: "user-new", email: "jan@example.com" },
      },
    ]);
  });

  it("MULTI_ORG=true emits organizations.created and then auth.signed-up for the new organization", async () => {
    mockEnv.MULTI_ORG = true;

    await auth.api.signUpEmail({ body: signupBody });

    expect(signedUp).toEqual([
      {
        name: "auth.signed-up",
        organizationId: "org-new",
        actorUserId: "user-new",
        payload: { userId: "user-new", email: "jan@example.com" },
      },
    ]);
    expect(created).toEqual([
      {
        name: "organizations.created",
        organizationId: "org-new",
        actorUserId: "user-new",
        payload: {
          name: "Jan — organizacja",
          slug: "jan-organizacja-abcd1234",
          ownerUserId: "user-new",
        },
      },
    ]);
    expect(timeline).toEqual(["organizations.created", "auth.signed-up"]);
  });

  it("a user created by admin createUser has no membership and emits nothing", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-only" });

    await auth.api.createUser({
      body: {
        name: "Ewa",
        email: "ewa@example.com",
        password: "password123",
      },
    });

    expect(signedUp).toEqual([]);
    expect(created).toEqual([]);
  });

  it("a failing membership write when joining the only organization emits no auth.signed-up", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-only" });
    mockPrisma.member.create.mockRejectedValue(new Error("db down"));

    await auth.api.signUpEmail({ body: signupBody }).catch(() => undefined);

    expect(mockPrisma.member.create).toHaveBeenCalledTimes(1);
    expect(signedUp).toEqual([]);
  });

  it("a failing membership transaction when joining by invitation emits no auth.signed-up", async () => {
    mockEnv.AUTH_PUBLIC_SIGNUP = false;
    mockPrisma.invitation.findFirst.mockResolvedValue({
      id: "inv-1",
      organizationId: "org-invited",
      role: "admin",
    });
    mockPrisma.$transaction.mockRejectedValue(new Error("db down"));

    await auth.api
      .signUpEmail({
        body: { ...signupBody, invitationId: "inv-1" } as typeof signupBody,
      })
      .catch(() => undefined);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(signedUp).toEqual([]);
  });

  it("a failing organization create on MULTI_ORG=true emits neither organizations.created nor auth.signed-up", async () => {
    mockEnv.MULTI_ORG = true;
    mockPrisma.organization.create.mockRejectedValue(new Error("db down"));

    await auth.api.signUpEmail({ body: signupBody }).catch(() => undefined);

    expect(mockPrisma.organization.create).toHaveBeenCalledTimes(1);
    expect(created).toEqual([]);
    expect(signedUp).toEqual([]);
  });

  it("the hook called with a join membership in the context emits auth.signed-up with the membership organization", async () => {
    await afterUserCreate()(createdUser, {
      signupMembership: {
        action: "join",
        organizationId: "org-7",
        role: "member",
      },
    } as unknown as Parameters<AfterUserCreate>[1]);

    expect(signedUp).toEqual([
      {
        name: "auth.signed-up",
        organizationId: "org-7",
        actorUserId: "user-direct",
        payload: { userId: "user-direct", email: "direct@example.com" },
      },
    ]);
  });

  it("the hook called without a context emits nothing", async () => {
    await afterUserCreate()(createdUser, null);

    expect(signedUp).toEqual([]);
    expect(mockPrisma.member.create).not.toHaveBeenCalled();
  });

  it("the hook called with a context without a membership emits nothing", async () => {
    await afterUserCreate()(
      createdUser,
      {} as unknown as Parameters<AfterUserCreate>[1],
    );

    expect(signedUp).toEqual([]);
  });
});

const INVITATION = {
  id: "inv-1",
  organizationId: "org-invited",
  role: "admin",
};

describe("databaseHooks.user.create.after: admin invite scope", () => {
  it("a sign-up inside withInviteSignup emits no auth.signed-up and still creates the invitation's membership", async () => {
    mockEnv.AUTH_PUBLIC_SIGNUP = false;
    mockPrisma.invitation.findFirst.mockResolvedValue(INVITATION);

    await withInviteSignup(() =>
      auth.api.signUpEmail({
        body: { ...signupBody, invitationId: "inv-1" } as typeof signupBody,
      }),
    );

    expect(signedUp).toEqual([]);
    expect(created).toEqual([]);
    expect(mockPrisma.member.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.member.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-new",
        organizationId: "org-invited",
        role: "admin",
      }),
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("the hook called directly inside withInviteSignup with a join membership emits nothing and still writes the membership", async () => {
    await withInviteSignup(() =>
      afterUserCreate()(createdUser, {
        signupMembership: {
          action: "join",
          organizationId: "org-7",
          role: "member",
        },
      } as unknown as Parameters<AfterUserCreate>[1]),
    );

    expect(signedUp).toEqual([]);
    expect(mockPrisma.member.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.member.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-direct",
        organizationId: "org-7",
        role: "member",
      }),
    });
  });

  it("a public sign-up after a finished invite scope emits auth.signed-up again", async () => {
    mockEnv.AUTH_PUBLIC_SIGNUP = false;
    mockPrisma.invitation.findFirst.mockResolvedValue(INVITATION);
    await withInviteSignup(() =>
      auth.api.signUpEmail({
        body: { ...signupBody, invitationId: "inv-1" } as typeof signupBody,
      }),
    );

    await auth.api.signUpEmail({
      body: {
        ...signupBody,
        email: "ewa@example.com",
        invitationId: "inv-1",
      } as typeof signupBody,
    });

    expect(signedUp).toEqual([
      {
        name: "auth.signed-up",
        organizationId: "org-invited",
        actorUserId: "user-new",
        payload: { userId: "user-new", email: "ewa@example.com" },
      },
    ]);
  });

  it("a public sign-up running concurrently with an invite scope still emits its own auth.signed-up", async () => {
    mockPrisma.invitation.findFirst.mockResolvedValue(INVITATION);
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-only" });
    mockPrisma.user.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: data.email === "ewa@example.com" ? "user-ewa" : "user-new",
      }),
    );

    await Promise.all([
      withInviteSignup(() =>
        auth.api.signUpEmail({
          body: { ...signupBody, invitationId: "inv-1" } as typeof signupBody,
        }),
      ),
      auth.api.signUpEmail({
        body: { ...signupBody, name: "Ewa", email: "ewa@example.com" },
      }),
    ]);

    expect(signedUp).toEqual([
      {
        name: "auth.signed-up",
        organizationId: "org-only",
        actorUserId: "user-ewa",
        payload: { userId: "user-ewa", email: "ewa@example.com" },
      },
    ]);
  });

  it("a public sign-up with forged inviteSignup, adminInvite and isInviteSignup body fields still emits one auth.signed-up", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-only" });

    await auth.api.signUpEmail({
      body: {
        ...signupBody,
        inviteSignup: true,
        adminInvite: true,
        isInviteSignup: true,
      } as typeof signupBody,
    });

    expect(signedUp).toEqual([
      {
        name: "auth.signed-up",
        organizationId: "org-only",
        actorUserId: "user-new",
        payload: { userId: "user-new", email: "jan@example.com" },
      },
    ]);
  });

  it("a public sign-up by invitation with forged marker fields in the body still emits auth.signed-up for the invitation's organization", async () => {
    mockEnv.AUTH_PUBLIC_SIGNUP = false;
    mockPrisma.invitation.findFirst.mockResolvedValue(INVITATION);

    await auth.api.signUpEmail({
      body: {
        ...signupBody,
        invitationId: "inv-1",
        inviteSignup: true,
        adminInvite: "true",
        isInviteSignup: "1",
      } as typeof signupBody,
    });

    expect(signedUp).toEqual([
      {
        name: "auth.signed-up",
        organizationId: "org-invited",
        actorUserId: "user-new",
        payload: { userId: "user-new", email: "jan@example.com" },
      },
    ]);
  });

  it("a public sign-up with forged marker headers still emits one auth.signed-up", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-only" });

    await auth.api.signUpEmail({
      body: signupBody,
      headers: new Headers({
        "x-invite-signup": "true",
        "x-admin-invite": "true",
        "invite-signup": "1",
      }),
    });

    expect(signedUp).toEqual([
      {
        name: "auth.signed-up",
        organizationId: "org-only",
        actorUserId: "user-new",
        payload: { userId: "user-new", email: "jan@example.com" },
      },
    ]);
  });
});
