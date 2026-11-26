// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CommandContext,
  CommandHook,
  CommandInput,
  RegisteredCommandHook,
} from "@/shared/lib/commands/define-command";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const {
  mockPrisma,
  mockGetAdminUserOrNull,
  mockGetOrgContext,
  mockAuthApi,
  mockLogger,
  mockCreateWelcomeUrl,
  mockSendWelcomeEmail,
  mockTrackAudit,
} = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    invitation: { create: vi.fn(), delete: vi.fn() },
  },
  mockGetAdminUserOrNull: vi.fn(),
  mockGetOrgContext: vi.fn(),
  mockAuthApi: { signUpEmail: vi.fn() },
  mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  mockCreateWelcomeUrl: vi.fn(),
  mockSendWelcomeEmail: vi.fn(),
  mockTrackAudit: vi.fn(),
}));

const { hookStore, emitted, timeline, moduleState } = vi.hoisted(() => ({
  hookStore: { entries: [] as RegisteredCommandHook[] },
  emitted: [] as unknown[],
  timeline: [] as string[],
  moduleState: { list: [] as ModuleDef[], all: [] as ModuleDef[] },
}));

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/auth/helpers", () => ({
  getAdminUserOrNull: () => mockGetAdminUserOrNull(),
}));
vi.mock("@/shared/lib/auth/org-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/auth/org-context")>()),
  getOrgContext: () => mockGetOrgContext(),
}));
vi.mock("@/shared/lib/auth", () => ({ auth: { api: mockAuthApi } }));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/shared/lib/auth/welcome-set-password", () => ({
  createWelcomeSetPasswordUrl: mockCreateWelcomeUrl,
}));
vi.mock("@/shared/lib/mailer", () => ({
  sendWelcomeSetPasswordEmail: mockSendWelcomeEmail,
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/lib/audit", () => ({ trackAudit: mockTrackAudit }));
vi.mock("@/modules.generated", () => ({
  auditSinks: [],
  moduleCommandHooks: hookStore.entries,
  moduleEvents: [],
  moduleSubscribers: [
    {
      module: "probe",
      value: {
        "users.invited": {
          id: "probe.record",
          run: (event: unknown) => {
            timeline.push("event");
            emitted.push(event);
          },
        },
      },
    },
  ],
}));
vi.mock("@/modules.client.generated", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules.client.generated")>();
  moduleState.all = [...actual.clientModules];
  moduleState.list.push(...actual.clientModules);
  return { ...actual, clientModules: moduleState.list };
});

import { NoOrganizationError } from "@/shared/lib/auth/org-context";
import { DomainError } from "@/shared/utils/error-handling";
import usersModule from "../../../module";
import { inviteUserCommand } from "../invite-user-command";

const FAILURE = {
  success: false,
  error: "Nie udało się zaprosić użytkownika",
};
const SERVICE_MODE_ERROR = {
  success: false,
  error: "Potwierdź zmianę w trybie serwisowym",
};
const EXISTING_EMAIL_ERROR = {
  success: false,
  error: "Użytkownik z tym adresem już istnieje",
};

const MEMBER_CONTEXT = {
  userId: "admin-1",
  organizationId: "org-1",
  orgRole: "admin",
  userRole: "admin",
  serviceMode: false,
};

const SERVICE_CONTEXT = {
  userId: "super-1",
  organizationId: "org-1",
  orgRole: "owner",
  userRole: "superadmin",
  serviceMode: true,
};

const validInput = {
  name: "Jan Kowalski",
  email: "jan@firma.pl",
  role: "member" as const,
};

function registerHook(
  before: CommandHook["before"],
  module = "dashboard",
  id = "dashboard.invite-policy",
) {
  const spy = vi.fn<CommandHook["before"]>(before);
  hookStore.entries.push({
    module,
    command: "users.invite",
    hook: { id, before: spy },
  });
  return spy;
}

function invitationData(): Record<string, unknown>[] {
  return mockPrisma.invitation.create.mock.calls.map(
    ([args]) => (args as { data: Record<string, unknown> }).data,
  );
}

function expectNoDatabaseAccess() {
  expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
  expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
  expect(mockPrisma.invitation.delete).not.toHaveBeenCalled();
  expect(mockAuthApi.signUpEmail).not.toHaveBeenCalled();
  expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  hookStore.entries.length = 0;
  emitted.length = 0;
  timeline.length = 0;
  moduleState.list.splice(0, moduleState.list.length, ...moduleState.all);
  mockGetAdminUserOrNull.mockResolvedValue({ id: "admin-1", role: "admin" });
  mockGetOrgContext.mockResolvedValue(MEMBER_CONTEXT);
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.invitation.create.mockResolvedValue({ id: "inv-1" });
  mockPrisma.invitation.delete.mockResolvedValue({});
  mockAuthApi.signUpEmail.mockResolvedValue({ user: { id: "new-user-1" } });
  mockCreateWelcomeUrl.mockResolvedValue("http://localhost:3000/welcome");
  mockSendWelcomeEmail.mockResolvedValue({ data: { id: "mail-1" } });
  mockTrackAudit.mockResolvedValue(undefined);
});

describe("users module declares its commands", () => {
  it("module.ts declares exactly the users.invite command", () => {
    expect(usersModule.commands).toEqual(["users.invite"]);
  });
});

describe("users.invite: a before hook changes the input", () => {
  it("a hook raising a member invite to admin creates an admin invitation and emits role admin", async () => {
    registerHook((input) => ({ ...input, role: "admin" }));

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
    expect(invitationData()).toEqual([
      expect.objectContaining({
        organizationId: "org-1",
        email: "jan@firma.pl",
        role: "admin",
        inviterId: "admin-1",
      }),
    ]);
    expect(emitted).toEqual([
      {
        name: "users.invited",
        organizationId: "org-1",
        actorUserId: "admin-1",
        serviceMode: false,
        payload: {
          invitationId: "inv-1",
          email: "jan@firma.pl",
          role: "admin",
        },
      },
    ]);
  });

  it("a hook raising the role to owner fails with the generic message and touches nothing", async () => {
    registerHook((input) => ({ ...input, role: "owner" }));

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual(FAILURE);
    expectNoDatabaseAccess();
    expect(emitted).toEqual([]);
  });

  it("a hook adding organizationId of another organization still invites into the context's organization", async () => {
    registerHook((input) => ({ ...input, organizationId: "org-2" }));

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
    expect(invitationData()).toEqual([
      expect.objectContaining({ organizationId: "org-1" }),
    ]);
    expect(emitted).toEqual([
      expect.objectContaining({ organizationId: "org-1" }),
    ]);
  });

  it("a hook adding an inviterId and organizationId does not change the inviter or the organization", async () => {
    registerHook((input) => ({
      ...input,
      inviterId: "intruder-1",
      organizationId: "org-2",
    }));

    await inviteUserCommand(validInput);

    expect(invitationData()).toEqual([
      expect.objectContaining({
        organizationId: "org-1",
        inviterId: "admin-1",
      }),
    ]);
    expect(emitted).toEqual([
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "admin-1",
      }),
    ]);
  });

  it("a caller input with inviterId and organizationId invites into the context's organization as the session admin", async () => {
    const result = await inviteUserCommand({
      ...validInput,
      inviterId: "intruder-1",
      organizationId: "org-2",
    });

    expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
    expect(invitationData()).toEqual([
      expect.objectContaining({
        organizationId: "org-1",
        inviterId: "admin-1",
      }),
    ]);
  });

  it("a hook swapping in an email that already exists returns the existing-user error, no invitation, no event", async () => {
    mockPrisma.user.findUnique.mockImplementation(
      async (args: { where: { email: string } }) =>
        args.where.email === "zajety@firma.pl" ? { id: "existing" } : null,
    );
    registerHook((input) => ({ ...input, email: "zajety@firma.pl" }));

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual(EXISTING_EMAIL_ERROR);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "zajety@firma.pl" } }),
    );
    expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
    expect(mockAuthApi.signUpEmail).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });

  it("a hook returning undefined leaves the parsed input for the invitation", async () => {
    registerHook(() => undefined);

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
    expect(invitationData()).toEqual([
      expect.objectContaining({ email: "jan@firma.pl", role: "member" }),
    ]);
  });

  it("a hook changing the role keeps the mail-failed warning of an undelivered welcome email", async () => {
    registerHook((input) => ({ ...input, role: "admin" }));
    mockSendWelcomeEmail.mockRejectedValue(new Error("smtp down"));

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({
      success: true,
      data: { userId: "new-user-1" },
      warning: "mail-failed",
    });
    expect(emitted).toHaveLength(1);
  });
});

describe("users.invite: what a before hook receives", () => {
  it("the hook receives the parsed input: trimmed lowercase email and the default member role", async () => {
    const seen: CommandInput[] = [];
    registerHook((input) => {
      seen.push({ ...input });
    });

    await inviteUserCommand({ name: "Jan Kowalski", email: "  Jan@Firma.PL " });

    expect(seen).toStrictEqual([
      { name: "Jan Kowalski", email: "jan@firma.pl", role: "member" },
    ]);
  });

  it("the hook receives a frozen context of the admin's organization", async () => {
    const contexts: CommandContext[] = [];
    registerHook((_input, context) => {
      contexts.push(context);
    });

    await inviteUserCommand(validInput);

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toEqual(MEMBER_CONTEXT);
    expect(Object.isFrozen(contexts[0])).toBe(true);
  });

  it("a hook assigning context.organizationId fails the command and nothing is written", async () => {
    registerHook((_input, context) => {
      (context as { organizationId: string }).organizationId = "org-2";
    });

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual(FAILURE);
    expectNoDatabaseAccess();
    expect(emitted).toEqual([]);
  });

  it("two invitations run the hook once each, each on its own input", async () => {
    const seen: unknown[] = [];
    registerHook((input) => {
      seen.push(input.email);
    });

    await inviteUserCommand(validInput);
    await inviteUserCommand({ ...validInput, email: "ewa@firma.pl" });

    expect(seen).toEqual(["jan@firma.pl", "ewa@firma.pl"]);
    expect(invitationData().map((data) => data.email)).toEqual([
      "jan@firma.pl",
      "ewa@firma.pl",
    ]);
  });
});

describe("users.invite: a before hook vetoes", () => {
  it("a hook throwing DomainError returns its message, with no database access and no event", async () => {
    registerHook(() => {
      throw new DomainError("Zaproszenia są wstrzymane");
    });

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({
      success: false,
      error: "Zaproszenia są wstrzymane",
    });
    expectNoDatabaseAccess();
    expect(emitted).toEqual([]);
  });

  it("a hook throwing a plain Error returns the generic message, not the error text", async () => {
    registerHook(() => {
      throw new Error("policy service down");
    });

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual(FAILURE);
    expectNoDatabaseAccess();
    expect(emitted).toEqual([]);
  });
});

describe("users.invite: checks before the hooks", () => {
  it("a caller without the admin role gets Brak uprawnień; no hook, no organization read", async () => {
    mockGetAdminUserOrNull.mockResolvedValue(null);
    const before = registerHook(() => undefined);

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({ success: false, error: "Brak uprawnień" });
    expect(before).not.toHaveBeenCalled();
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expectNoDatabaseAccess();
    expect(emitted).toEqual([]);
  });

  it("NoOrganizationError from the session returns the generic message and no hook runs", async () => {
    mockGetOrgContext.mockRejectedValue(new NoOrganizationError());
    const before = registerHook(() => undefined);

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual(FAILURE);
    expect(before).not.toHaveBeenCalled();
    expectNoDatabaseAccess();
  });

  it("service mode without a confirmation is refused before the hook", async () => {
    mockGetAdminUserOrNull.mockResolvedValue({
      id: "super-1",
      role: "superadmin",
    });
    mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);
    const before = registerHook(() => undefined);

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expect(before).not.toHaveBeenCalled();
    expectNoDatabaseAccess();
  });

  it("service mode with the active organization's confirmation runs the hook once and creates the invitation", async () => {
    mockGetAdminUserOrNull.mockResolvedValue({
      id: "super-1",
      role: "superadmin",
    });
    mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);
    const before = registerHook(() => undefined);

    const result = await inviteUserCommand(validInput, {
      serviceModeConfirmed: true,
      organizationId: "org-1",
    });

    expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
    expect(before).toHaveBeenCalledTimes(1);
    expect(invitationData()).toEqual([
      expect.objectContaining({
        organizationId: "org-1",
        inviterId: "super-1",
      }),
    ]);
  });

  it("service mode without a confirmation and invalid input returns the service-mode error, not the field message", async () => {
    mockGetAdminUserOrNull.mockResolvedValue({
      id: "super-1",
      role: "superadmin",
    });
    mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);

    const result = await inviteUserCommand({
      ...validInput,
      email: "not-an-email",
    });

    expect(result).toEqual(SERVICE_MODE_ERROR);
  });

  it("invalid input returns the schema message of the field and no hook runs", async () => {
    const before = registerHook(() => undefined);

    const result = await inviteUserCommand({
      ...validInput,
      email: "not-an-email",
    });

    expect(result).toEqual({ success: false, error: "Invalid email address" });
    expect(before).not.toHaveBeenCalled();
    expectNoDatabaseAccess();
  });

  it("a caller role of owner is refused with the schema message before any hook", async () => {
    const before = registerHook(() => undefined);

    const result = await inviteUserCommand({ ...validInput, role: "owner" });

    expect(result.success).toBe(false);
    expect(result).not.toEqual(FAILURE);
    expect(before).not.toHaveBeenCalled();
    expectNoDatabaseAccess();
  });

  it("with the users module disabled the invite fails with the generic message and no hook runs", async () => {
    moduleState.list.splice(
      moduleState.list.findIndex((moduleDef) => moduleDef.key === "users"),
      1,
    );
    const before = registerHook(() => undefined);

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual(FAILURE);
    expect(before).not.toHaveBeenCalled();
    expect(mockGetAdminUserOrNull).not.toHaveBeenCalled();
    expectNoDatabaseAccess();
  });

  it("a hook of a module that is disabled at call time does not run and the invitation is created", async () => {
    const before = registerHook(
      (input) => ({ ...input, role: "admin" }),
      "invoices",
      "invoices.invite-policy",
    );

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual({ success: true, data: { userId: "new-user-1" } });
    expect(before).not.toHaveBeenCalled();
    expect(invitationData()).toEqual([
      expect.objectContaining({ role: "member" }),
    ]);
  });
});

describe("users.invite: users.invited is emitted only after a successful run", () => {
  it("the event comes after the welcome email", async () => {
    mockSendWelcomeEmail.mockImplementation(async () => {
      timeline.push("mail");
      return { data: { id: "mail-1" } };
    });

    await inviteUserCommand(validInput);

    expect(timeline).toEqual(["mail", "event"]);
  });

  it("a failed email verification fails the invite and emits nothing", async () => {
    mockPrisma.user.update.mockRejectedValue(new Error("db down"));

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual(FAILURE);
    expect(emitted).toEqual([]);
  });

  it("a failed invitation write fails the invite and emits nothing", async () => {
    registerHook((input) => ({ ...input, role: "admin" }));
    mockPrisma.invitation.create.mockRejectedValue(new Error("db down"));

    const result = await inviteUserCommand(validInput);

    expect(result).toEqual(FAILURE);
    expect(mockAuthApi.signUpEmail).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });
});
