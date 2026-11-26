// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as OrgContextModule from "@/shared/lib/auth/org-context";
import type { OrgContext } from "@/shared/lib/auth/org-context";
import type { OperationResult } from "@/shared/types/common";
import type * as ErrorHandlingModule from "@/shared/utils/error-handling";
import type * as DefineCommandModule from "../define-command";
import type * as RunCommandModule from "../run-command";
import type {
  CommandAccess,
  CommandContext,
  CommandEmit,
  CommandHook,
  CommandSchema,
  RegisteredCommandHook,
} from "../define-command";

const {
  mockGetOrgContext,
  mockGetAdminUserOrNull,
  mockRequireModuleAccess,
  mockLogger,
  hookStore,
  received,
  timeline,
} = vi.hoisted(() => ({
  mockGetOrgContext: vi.fn(),
  mockGetAdminUserOrNull: vi.fn(),
  mockRequireModuleAccess: vi.fn(),
  mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  hookStore: { entries: [] as RegisteredCommandHook[] },
  received: [] as unknown[],
  timeline: [] as string[],
}));

vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/env", () => ({ env: { MULTI_ORG: false } }));
vi.mock("@/shared/lib/prisma", () => ({ prisma: {} }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/lib/auth/org-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/auth/org-context")>()),
  getOrgContext: () => mockGetOrgContext(),
}));
vi.mock("@/shared/lib/auth/helpers", () => ({
  getAdminUserOrNull: () => mockGetAdminUserOrNull(),
}));
vi.mock("@/shared/lib/auth/require-module-access", () => ({
  requireModuleAccess: (key: string) => mockRequireModuleAccess(key),
}));
vi.mock("@/modules.generated", () => ({
  auditSinks: [],
  moduleCommandHooks: hookStore.entries,
  moduleEvents: [],
  moduleSubscribers: [
    {
      module: "probe",
      value: {
        "users.invitation-canceled": {
          id: "probe.record",
          run: (event: unknown) => {
            timeline.push("subscriber");
            received.push(event);
          },
        },
      },
    },
  ],
}));
vi.mock("@/modules.client.generated", () => ({
  authClientPlugins: [],
  gatoBranding: {},
  clientModules: [
    {
      key: "probe",
      nav: [],
      routePrefixes: [],
      commands: [
        "probe.delete",
        "probe.scoped",
        "probe.workspace",
        "probe.trim",
        "probe.silent",
        "probe.both",
        "probe.transform",
        "probe.pipe",
        "probe.nullable-union",
        "probe.lazy",
        "probe.",
      ],
      permissions: {
        "probe.manage": {
          defaultRoles: ["owner"],
          labelKey: "permission-manage",
        },
      },
    },
    {
      key: "zeta",
      nav: [],
      routePrefixes: [],
      commands: ["probe.borrowed", "zetax.run"],
    },
    { key: "alpha", nav: [], routePrefixes: [] },
    { key: "m", nav: [], routePrefixes: [] },
    { key: "bare", nav: [], routePrefixes: [] },
  ],
}));

let NoOrganizationError: typeof OrgContextModule.NoOrganizationError;
let DomainError: typeof ErrorHandlingModule.DomainError;
let CommandError: typeof DefineCommandModule.CommandError;
let defineCommand: typeof DefineCommandModule.defineCommand;
let runCommand: typeof RunCommandModule.runCommand;

// WHY: runCommand remembers one command object per key for the process,
// so every test gets fresh module instances and builds its own commands.
async function loadModules(): Promise<void> {
  vi.resetModules();
  ({ NoOrganizationError } = await import("@/shared/lib/auth/org-context"));
  ({ DomainError } = await import("@/shared/utils/error-handling"));
  ({ CommandError, defineCommand } = await import("../define-command"));
  ({ runCommand } = await import("../run-command"));
}

const FAILURE = "Probe failed";
const DENIED = "Probe denied";
const FAILURE_RESULT = { success: false, error: FAILURE };
const DENIED_RESULT = { success: false, error: DENIED };
const SERVICE_MODE_ERROR = {
  success: false,
  error: "Potwierdź zmianę w trybie serwisowym",
};

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_ID = "33333333-3333-4333-8333-333333333333";

const ID_INPUT: CommandSchema = z.object({ id: z.uuid() });
const ORG_INPUT: CommandSchema = z.object({
  id: z.uuid(),
  organizationId: z.string().optional(),
});
const WORKSPACE_INPUT: CommandSchema = z.object({
  id: z.uuid(),
  workspaceId: z.string().meta({ organizationScoped: true }).optional(),
});
const TRIM_INPUT: CommandSchema = z.object({
  name: z.string().trim().min(1),
});

type ProbeEvent = "users.invitation-canceled";
type ProbeRun = (
  input: z.output<CommandSchema>,
  context: CommandContext,
  emit: CommandEmit<ProbeEvent>,
) => Promise<OperationResult<unknown>>;
type LooseEmit = (name: string, payload: unknown) => void;

const runSpy = vi.fn<ProbeRun>();

interface ProbeOptions {
  key?: string;
  module?: string;
  access?: CommandAccess;
  input?: CommandSchema;
  permission?: string;
  deniedMessage?: string;
  invalidInputMessage?: (error: z.ZodError) => string;
}

function probeCommand(options: ProbeOptions = {}) {
  return defineCommand({
    key: "probe.delete",
    module: "probe",
    access: "member",
    input: ID_INPUT,
    failureMessage: FAILURE,
    events: ["users.invitation-canceled"],
    run: (input, context, emit) => runSpy(input, context, emit),
    ...options,
  });
}

const silentCommand = () =>
  defineCommand({
    key: "probe.silent",
    module: "probe",
    access: "member",
    input: ID_INPUT,
    failureMessage: FAILURE,
    run: (input, context, emit) =>
      runSpy(input, context, emit as unknown as CommandEmit<ProbeEvent>),
  });

function memberContext(overrides: Partial<OrgContext> = {}): OrgContext {
  return {
    userId: "user-1",
    organizationId: "org-a",
    orgRole: "member",
    userRole: "user",
    serviceMode: false,
    ...overrides,
  };
}

function serviceContext(): OrgContext {
  return memberContext({
    userId: "super-1",
    orgRole: "owner",
    userRole: "superadmin",
    serviceMode: true,
  });
}

function nextRedirect(): Error {
  return Object.assign(new Error("NEXT_REDIRECT"), {
    digest: "NEXT_REDIRECT;replace;/sign-in;307;",
  });
}

function hookEntry(
  module: string,
  id: string,
  before: CommandHook["before"],
  command = "probe.delete",
): RegisteredCommandHook {
  return { module, command, hook: { id, before } };
}

function registerHooks(...entries: RegisteredCommandHook[]): void {
  hookStore.entries.push(...entries);
}

function spyHook(command = "probe.delete") {
  const before = vi.fn<CommandHook["before"]>(() => undefined);
  registerHooks(hookEntry("probe", "probe.spy", before, command));
  return before;
}

function runInputs(): unknown[] {
  return runSpy.mock.calls.map(([input]) => input);
}

function runContexts(): CommandContext[] {
  return runSpy.mock.calls.map(([, context]) => context);
}

beforeEach(async () => {
  await loadModules();
  hookStore.entries.length = 0;
  received.length = 0;
  timeline.length = 0;
  mockGetOrgContext.mockReset();
  mockGetOrgContext.mockImplementation(async () => memberContext());
  mockGetAdminUserOrNull.mockReset();
  mockGetAdminUserOrNull.mockResolvedValue({ id: "user-1", role: "admin" });
  mockRequireModuleAccess.mockReset();
  mockRequireModuleAccess.mockImplementation(async () => memberContext());
  runSpy.mockReset();
  runSpy.mockResolvedValue({ success: true });
});

describe("runCommand: module checks come first", () => {
  it("a disabled module returns the failure message without a session read, a hook or run", async () => {
    const before = spyHook("invoices.delete");
    const command = probeCommand({
      key: "invoices.delete",
      module: "invoices",
    });

    const result = await runCommand(command, { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(mockRequireModuleAccess).not.toHaveBeenCalled();
    expect(mockGetAdminUserOrNull).not.toHaveBeenCalled();
    expect(before).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a disabled module is logged as a warning, not as an error", async () => {
    await runCommand(
      probeCommand({ key: "invoices.delete", module: "invoices" }),
      { id: ID },
      undefined,
    );

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("a disabled module fails even with a service-mode context and a valid confirmation", async () => {
    mockGetOrgContext.mockImplementation(async () => serviceContext());
    const command = probeCommand({
      key: "invoices.delete",
      module: "invoices",
    });

    const result = await runCommand(
      command,
      { id: ID },
      { serviceModeConfirmed: true, organizationId: "org-a" },
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(mockGetOrgContext).not.toHaveBeenCalled();
  });

  it("a command key its module does not declare returns the failure message without a session read or run", async () => {
    const before = spyHook("probe.undeclared");
    const command = probeCommand({ key: "probe.undeclared" });

    const result = await runCommand(command, { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(before).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("checks the declaration before the session: a redirecting session read is never reached", async () => {
    mockGetOrgContext.mockRejectedValue(nextRedirect());

    const result = await runCommand(
      probeCommand({ key: "probe.undeclared" }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
  });

  it("a module without a commands list refuses every command", async () => {
    const result = await runCommand(
      probeCommand({ key: "bare.delete", module: "bare" }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("only the command's own module counts: a key declared by another module is refused", async () => {
    const result = await runCommand(
      probeCommand({ key: "probe.borrowed" }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });
});

describe("runCommand: session guard by access", () => {
  it('"member" reads getOrgContext once and passes its values to run', async () => {
    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(mockGetOrgContext).toHaveBeenCalledTimes(1);
    expect(mockRequireModuleAccess).not.toHaveBeenCalled();
    expect(mockGetAdminUserOrNull).not.toHaveBeenCalled();
    expect(runContexts()).toEqual([memberContext()]);
  });

  it("NoOrganizationError from getOrgContext returns the failure message, no hook, no run", async () => {
    mockGetOrgContext.mockRejectedValue(new NoOrganizationError());
    const before = spyHook();

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(before).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a NEXT_REDIRECT from getOrgContext is rethrown", async () => {
    const redirect = nextRedirect();
    mockGetOrgContext.mockRejectedValue(redirect);

    await expect(
      runCommand(probeCommand(), { id: ID }, undefined),
    ).rejects.toBe(redirect);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('"module" calls requireModuleAccess with the module key and uses its context', async () => {
    const moduleContext = memberContext({ userId: "user-module" });
    mockRequireModuleAccess.mockResolvedValue(moduleContext);

    const result = await runCommand(
      probeCommand({ access: "module" }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual({ success: true });
    expect(mockRequireModuleAccess).toHaveBeenCalledTimes(1);
    expect(mockRequireModuleAccess).toHaveBeenCalledWith("probe");
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(runContexts()).toEqual([memberContext({ userId: "user-module" })]);
  });

  it('"module" in service mode without a confirmation is refused', async () => {
    mockRequireModuleAccess.mockImplementation(async () => serviceContext());

    const result = await runCommand(
      probeCommand({ access: "module" }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('"global-admin" with no admin user returns deniedMessage without getOrgContext, a hook or run', async () => {
    mockGetAdminUserOrNull.mockResolvedValue(null);
    const before = spyHook();

    const result = await runCommand(
      probeCommand({ access: "global-admin", deniedMessage: DENIED }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(DENIED_RESULT);
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(before).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('"global-admin" with no admin user and no deniedMessage returns the failure message', async () => {
    mockGetAdminUserOrNull.mockResolvedValue(null);

    const result = await runCommand(
      probeCommand({ access: "global-admin" }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('"global-admin" checks the admin before the organization: no admin wins over a missing organization', async () => {
    mockGetAdminUserOrNull.mockResolvedValue(null);
    mockGetOrgContext.mockRejectedValue(new NoOrganizationError());

    const result = await runCommand(
      probeCommand({ access: "global-admin", deniedMessage: DENIED }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(DENIED_RESULT);
  });

  it('"global-admin" with an admin user reads getOrgContext and runs', async () => {
    mockGetOrgContext.mockImplementation(async () =>
      memberContext({ userRole: "admin" }),
    );

    const result = await runCommand(
      probeCommand({ access: "global-admin", deniedMessage: DENIED }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual({ success: true });
    expect(mockGetAdminUserOrNull).toHaveBeenCalledTimes(1);
    expect(mockGetOrgContext).toHaveBeenCalledTimes(1);
    expect(runContexts()).toEqual([memberContext({ userRole: "admin" })]);
  });

  it('"global-admin" rethrows a NEXT_REDIRECT from the admin read', async () => {
    const redirect = nextRedirect();
    mockGetAdminUserOrNull.mockRejectedValue(redirect);

    await expect(
      runCommand(
        probeCommand({ access: "global-admin" }),
        { id: ID },
        undefined,
      ),
    ).rejects.toBe(redirect);
  });

  it('"global-admin" in service mode without a confirmation is refused', async () => {
    mockGetOrgContext.mockImplementation(async () => serviceContext());

    const result = await runCommand(
      probeCommand({ access: "global-admin" }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expect(runSpy).not.toHaveBeenCalled();
  });
});

describe("runCommand: service mode", () => {
  it("service mode without a confirmation is refused before any hook or run", async () => {
    mockGetOrgContext.mockImplementation(async () => serviceContext());
    const before = spyHook();

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expect(before).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("service mode with another organization's confirmation is refused", async () => {
    mockGetOrgContext.mockImplementation(async () => serviceContext());

    const result = await runCommand(
      probeCommand(),
      { id: ID },
      { serviceModeConfirmed: true, organizationId: "org-b" },
    );

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("outside service mode a stale confirmation of another organization is refused", async () => {
    const result = await runCommand(
      probeCommand(),
      { id: ID },
      { serviceModeConfirmed: true, organizationId: "org-b" },
    );

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("service mode with the active organization's confirmation runs", async () => {
    mockGetOrgContext.mockImplementation(async () => serviceContext());

    const result = await runCommand(
      probeCommand(),
      { id: ID },
      { serviceModeConfirmed: true, organizationId: "org-a" },
    );

    expect(result).toEqual({ success: true });
    expect(runInputs()).toEqual([{ id: ID }]);
  });

  it("the service-mode check comes before the input check", async () => {
    mockGetOrgContext.mockImplementation(async () => serviceContext());

    const result = await runCommand(probeCommand(), { id: "bad" }, undefined);

    expect(result).toEqual(SERVICE_MODE_ERROR);
  });

  it("the service-mode check comes before the permission check", async () => {
    mockGetOrgContext.mockImplementation(async () =>
      memberContext({ serviceMode: true }),
    );

    const result = await runCommand(
      probeCommand({ permission: "probe.manage", deniedMessage: DENIED }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(SERVICE_MODE_ERROR);
  });
});

describe("runCommand: input", () => {
  it.each([null, undefined, "text", 5, {}, { id: "not-a-uuid" }, { id: 5 }])(
    "invalid input %j returns the failure message, no hook, no run",
    async (input) => {
      const before = spyHook();

      const result = await runCommand(probeCommand(), input, undefined);

      expect(result).toEqual(FAILURE_RESULT);
      expect(before).not.toHaveBeenCalled();
      expect(runSpy).not.toHaveBeenCalled();
    },
  );

  it("run receives the parsed input, without unknown keys", async () => {
    await runCommand(probeCommand(), { id: ID, extra: "x" }, undefined);

    expect(runInputs()).toStrictEqual([{ id: ID }]);
  });

  it("hooks receive the parsed input, not the raw one", async () => {
    const seen: unknown[] = [];
    registerHooks(
      hookEntry(
        "probe",
        "probe.record",
        (input) => {
          seen.push({ ...input });
        },
        "probe.trim",
      ),
    );

    await runCommand(
      probeCommand({ key: "probe.trim", input: TRIM_INPUT }),
      { name: "  first  " },
      undefined,
    );

    expect(seen).toStrictEqual([{ name: "first" }]);
  });

  it("the input check comes before the permission check", async () => {
    const result = await runCommand(
      probeCommand({ permission: "probe.manage", deniedMessage: DENIED }),
      { id: "bad" },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
  });
});

describe("runCommand: permission", () => {
  it("a member on a permission with defaultRoles owner gets deniedMessage, no hook, no run", async () => {
    const before = spyHook();

    const result = await runCommand(
      probeCommand({ permission: "probe.manage", deniedMessage: DENIED }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(DENIED_RESULT);
    expect(before).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("an org admin on a permission with defaultRoles owner is denied too", async () => {
    mockGetOrgContext.mockImplementation(async () =>
      memberContext({ orgRole: "admin" }),
    );

    const result = await runCommand(
      probeCommand({ permission: "probe.manage", deniedMessage: DENIED }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(DENIED_RESULT);
  });

  it("a denied permission without deniedMessage returns the failure message", async () => {
    const result = await runCommand(
      probeCommand({ permission: "probe.manage" }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("an owner passes the permission and runs", async () => {
    mockGetOrgContext.mockImplementation(async () =>
      memberContext({ orgRole: "owner" }),
    );

    const result = await runCommand(
      probeCommand({ permission: "probe.manage", deniedMessage: DENIED }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual({ success: true });
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("a global admin who is a plain org member passes the permission", async () => {
    mockGetOrgContext.mockImplementation(async () =>
      memberContext({ userRole: "admin" }),
    );

    const result = await runCommand(
      probeCommand({ permission: "probe.manage", deniedMessage: DENIED }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual({ success: true });
  });

  it("an undeclared permission key fails with the failure message and never runs", async () => {
    mockGetOrgContext.mockImplementation(async () =>
      memberContext({ orgRole: "owner" }),
    );

    const result = await runCommand(
      probeCommand({ permission: "probe.nope", deniedMessage: DENIED }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });
});

describe("runCommand: before hooks", () => {
  it("a hook returning another id makes run receive that id", async () => {
    registerHooks(hookEntry("probe", "probe.swap", () => ({ id: OTHER_ID })));

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(runInputs()).toStrictEqual([{ id: OTHER_ID }]);
  });

  it("a hook returning undefined leaves the parsed input for run", async () => {
    registerHooks(hookEntry("probe", "probe.noop", () => undefined));

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(runInputs()).toStrictEqual([{ id: ID }]);
  });

  it("a hook returning null leaves the parsed input for run", async () => {
    registerHooks(
      hookEntry("probe", "probe.null", () => null as unknown as undefined),
    );

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual({ success: true });
    expect(runInputs()).toStrictEqual([{ id: ID }]);
  });

  it("the second hook receives the first hook's output and run the second's", async () => {
    const seenBySecond: unknown[] = [];
    registerHooks(
      hookEntry("probe", "probe.first", () => ({ id: OTHER_ID })),
      hookEntry("probe", "probe.second", (input) => {
        seenBySecond.push({ ...input });
        return { id: THIRD_ID };
      }),
    );

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(seenBySecond).toStrictEqual([{ id: OTHER_ID }]);
    expect(runInputs()).toStrictEqual([{ id: THIRD_ID }]);
  });

  it("hooks run in registry order: zeta before alpha", async () => {
    const order: string[] = [];
    registerHooks(
      hookEntry("zeta", "zeta.hook", () => {
        order.push("zeta");
      }),
      hookEntry("alpha", "alpha.hook", () => {
        order.push("alpha");
      }),
    );

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(order).toEqual(["zeta", "alpha"]);
  });

  it("hooks keep the registry order inside one module, without sorting again", async () => {
    const order: string[] = [];
    registerHooks(
      hookEntry("m", "m.b", () => {
        order.push("m.b");
      }),
      hookEntry("m", "m.a", () => {
        order.push("m.a");
      }),
    );

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(order).toEqual(["m.b", "m.a"]);
  });

  it("the second hook starts only after the first one settled", async () => {
    const order: string[] = [];
    registerHooks(
      hookEntry("probe", "probe.slow", async () => {
        order.push("slow:start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push("slow:end");
        return { id: OTHER_ID };
      }),
      hookEntry("probe", "probe.fast", (input) => {
        order.push(`fast:start:${String(input.id)}`);
      }),
    );

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(order).toEqual(["slow:start", "slow:end", `fast:start:${OTHER_ID}`]);
  });

  it("a hook registered for another command does not run", async () => {
    const before = spyHook("probe.trim");

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(before).not.toHaveBeenCalled();
    expect(runInputs()).toStrictEqual([{ id: ID }]);
  });

  it("a hook of a module that is not enabled does not run", async () => {
    const before = vi.fn<CommandHook["before"]>(() => ({ id: OTHER_ID }));
    registerHooks(hookEntry("ghost", "ghost.swap", before));

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual({ success: true });
    expect(before).not.toHaveBeenCalled();
    expect(runInputs()).toStrictEqual([{ id: ID }]);
  });

  it("an enabled module's hook still runs next to a disabled module's hook", async () => {
    registerHooks(
      hookEntry("ghost", "ghost.swap", () => ({ id: THIRD_ID })),
      hookEntry("alpha", "alpha.swap", () => ({ id: OTHER_ID })),
    );

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(runInputs()).toStrictEqual([{ id: OTHER_ID }]);
  });

  it("a hook throwing DomainError returns its message and stops later hooks and run", async () => {
    const later = vi.fn<CommandHook["before"]>(() => undefined);
    registerHooks(
      hookEntry("probe", "probe.veto", () => {
        throw new DomainError("This file is attached to an issued invoice");
      }),
      hookEntry("probe", "probe.later", later),
    );

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual({
      success: false,
      error: "This file is attached to an issued invoice",
    });
    expect(later).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a hook throwing a plain Error returns the failure message, not the error text", async () => {
    registerHooks(
      hookEntry("probe", "probe.crash", () => {
        throw new Error("database exploded");
      }),
    );

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a hook returning input that fails the schema returns the failure message, run not called", async () => {
    registerHooks(hookEntry("probe", "probe.broken", () => ({ id: 42 })));

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("run receives the hook output parsed again: transforms apply", async () => {
    registerHooks(
      hookEntry(
        "probe",
        "probe.rename",
        () => ({ name: "  renamed  " }),
        "probe.trim",
      ),
    );

    await runCommand(
      probeCommand({ key: "probe.trim", input: TRIM_INPUT }),
      { name: "first" },
      undefined,
    );

    expect(runInputs()).toStrictEqual([{ name: "renamed" }]);
  });

  it("a hook output that fails the schema only after its transform is rejected", async () => {
    registerHooks(
      hookEntry("probe", "probe.blank", () => ({ name: "   " }), "probe.trim"),
    );

    const result = await runCommand(
      probeCommand({ key: "probe.trim", input: TRIM_INPUT }),
      { name: "first" },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("an organizationId a hook adds for a schema without it is stripped before run", async () => {
    registerHooks(
      hookEntry("probe", "probe.smuggle", () => ({
        id: OTHER_ID,
        organizationId: "org-b",
      })),
    );

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual({ success: true });
    expect(runInputs()).toStrictEqual([{ id: OTHER_ID }]);
  });

  it("a second call starts again from its own input", async () => {
    let calls = 0;
    registerHooks(
      hookEntry("probe", "probe.once", () => {
        calls += 1;
        return calls === 1 ? { id: OTHER_ID } : undefined;
      }),
    );

    const command = probeCommand();

    await runCommand(command, { id: ID }, undefined);
    await runCommand(command, { id: ID }, undefined);

    expect(runInputs()).toStrictEqual([{ id: OTHER_ID }, { id: ID }]);
  });
});

describe("runCommand: the frozen context", () => {
  it("a hook and run get the same frozen copy of the context", async () => {
    const original = memberContext();
    mockGetOrgContext.mockResolvedValue(original);
    const seen: CommandContext[] = [];
    registerHooks(
      hookEntry("probe", "probe.look", (_input, context) => {
        seen.push(context);
      }),
    );

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(seen).toHaveLength(1);
    expect(Object.isFrozen(seen[0])).toBe(true);
    expect(seen[0]).toEqual(memberContext());
    expect(seen[0]).not.toBe(original);
    expect(runContexts()[0]).toBe(seen[0]);
    expect(Object.isFrozen(original)).toBe(false);
  });

  it("run gets a frozen context also with no hooks", async () => {
    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(Object.isFrozen(runContexts()[0])).toBe(true);
  });

  it("a hook assigning context.organizationId throws a TypeError, the command fails, run not called", async () => {
    const errors: unknown[] = [];
    registerHooks(
      hookEntry("probe", "probe.tamper", (_input, context) => {
        try {
          (context as { organizationId: string }).organizationId = "x";
        } catch (error) {
          errors.push(error);
          throw error;
        }
      }),
    );

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("run sees context.organizationId unchanged after a hook tried to change it", async () => {
    const swallowed: unknown[] = [];
    registerHooks(
      hookEntry("probe", "probe.tamper", (_input, context) => {
        try {
          (context as { organizationId: string }).organizationId = "x";
        } catch (error) {
          swallowed.push(error);
        }
      }),
    );

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(swallowed[0]).toBeInstanceOf(TypeError);
    expect(runContexts()[0]?.organizationId).toBe("org-a");
  });
});

describe("runCommand: organization-scoped fields", () => {
  const scoped = () => probeCommand({ key: "probe.scoped", input: ORG_INPUT });
  const workspace = () =>
    probeCommand({ key: "probe.workspace", input: WORKSPACE_INPUT });

  function scopedHook(
    id: string,
    before: CommandHook["before"],
    command = "probe.scoped",
  ) {
    registerHooks(hookEntry("probe", id, before, command));
  }

  it("a hook adding organizationId of another organization fails, run not called", async () => {
    scopedHook("probe.foreign", () => ({ id: ID, organizationId: "org-b" }));

    const result = await runCommand(scoped(), { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a caller input with another organization's organizationId fails without any hook", async () => {
    const result = await runCommand(
      scoped(),
      { id: ID, organizationId: "org-b" },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a caller input with the context's organizationId runs", async () => {
    const result = await runCommand(
      scoped(),
      { id: ID, organizationId: "org-a" },
      undefined,
    );

    expect(result).toEqual({ success: true });
    expect(runInputs()).toStrictEqual([{ id: ID, organizationId: "org-a" }]);
  });

  it("a hook keeping the context's organizationId runs with the hook's other changes", async () => {
    scopedHook("probe.keep", () => ({ id: OTHER_ID, organizationId: "org-a" }));

    const result = await runCommand(
      scoped(),
      { id: ID, organizationId: "org-a" },
      undefined,
    );

    expect(result).toEqual({ success: true });
    expect(runInputs()).toStrictEqual([
      { id: OTHER_ID, organizationId: "org-a" },
    ]);
  });

  it("a hook setting organizationId the caller left out fails even with the context's value", async () => {
    scopedHook("probe.fill", () => ({ id: ID, organizationId: "org-a" }));

    const result = await runCommand(scoped(), { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a hook turning a foreign organizationId into the context's one still fails", async () => {
    scopedHook("probe.launder", () => ({ id: ID, organizationId: "org-a" }));

    const result = await runCommand(
      scoped(),
      { id: ID, organizationId: "org-b" },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a hook dropping the caller's organizationId fails", async () => {
    scopedHook("probe.drop", () => ({ id: ID }));

    const result = await runCommand(
      scoped(),
      { id: ID, organizationId: "org-a" },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a hook changing organizationId in place on the input it got fails", async () => {
    scopedHook("probe.in-place", (input) => {
      input.organizationId = "org-b";
    });

    const result = await runCommand(
      scoped(),
      { id: ID, organizationId: "org-a" },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a hook changing a field marked organizationScoped fails", async () => {
    scopedHook(
      "probe.workspace-swap",
      () => ({ id: ID, workspaceId: "org-b" }),
      "probe.workspace",
    );

    const result = await runCommand(
      workspace(),
      { id: ID, workspaceId: "org-a" },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a caller value of a marked field that is not the context's organization fails", async () => {
    const result = await runCommand(
      workspace(),
      { id: ID, workspaceId: "org-b" },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: ID }, { id: ID }],
    [
      { id: ID, workspaceId: "org-a" },
      { id: ID, workspaceId: "org-a" },
    ],
  ])(
    "a marked field left out or equal to the context's organization runs (%j)",
    async (input, expected) => {
      const result = await runCommand(workspace(), input, undefined);

      expect(result).toEqual({ success: true });
      expect(runInputs()).toStrictEqual([expected]);
    },
  );
});

describe("runCommand: result and events", () => {
  it("returns run's result object as is", async () => {
    const outcome = { success: true, data: { n: 1 } };
    runSpy.mockResolvedValue(outcome);

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toBe(outcome);
    expect(result).toEqual({ success: true, data: { n: 1 } });
  });

  it("returns run's own failure as is", async () => {
    runSpy.mockResolvedValue({ success: false, error: "Custom failure" });

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual({ success: false, error: "Custom failure" });
  });

  it("a successful run emits its event once with the context origin", async () => {
    runSpy.mockImplementation(async (_input, _context, emit) => {
      emit("users.invitation-canceled", { invitationId: "inv-1" });
      return { success: true };
    });

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(received).toEqual([
      {
        name: "users.invitation-canceled",
        organizationId: "org-a",
        actorUserId: "user-1",
        serviceMode: false,
        payload: { invitationId: "inv-1" },
      },
    ]);
  });

  it("emits only after run resolved", async () => {
    runSpy.mockImplementation(async (_input, _context, emit) => {
      emit("users.invitation-canceled", { invitationId: "inv-1" });
      timeline.push("emit-called");
      await Promise.resolve();
      timeline.push("run-finished");
      return { success: true };
    });

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(timeline).toEqual(["emit-called", "run-finished", "subscriber"]);
  });

  it("emits recorded events in record order", async () => {
    runSpy.mockImplementation(async (_input, _context, emit) => {
      emit("users.invitation-canceled", { invitationId: "inv-1" });
      emit("users.invitation-canceled", { invitationId: "inv-2" });
      return { success: true };
    });

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(received).toEqual([
      {
        name: "users.invitation-canceled",
        organizationId: "org-a",
        actorUserId: "user-1",
        serviceMode: false,
        payload: { invitationId: "inv-1" },
      },
      {
        name: "users.invitation-canceled",
        organizationId: "org-a",
        actorUserId: "user-1",
        serviceMode: false,
        payload: { invitationId: "inv-2" },
      },
    ]);
  });

  it("in service mode the origin is the entered organization and the superadmin", async () => {
    mockGetOrgContext.mockImplementation(async () => serviceContext());
    runSpy.mockImplementation(async (_input, _context, emit) => {
      emit("users.invitation-canceled", { invitationId: "inv-1" });
      return { success: true };
    });

    await runCommand(
      probeCommand(),
      { id: ID },
      { serviceModeConfirmed: true, organizationId: "org-a" },
    );

    expect(received).toEqual([
      {
        name: "users.invitation-canceled",
        organizationId: "org-a",
        actorUserId: "super-1",
        serviceMode: true,
        payload: { invitationId: "inv-1" },
      },
    ]);
  });

  it("run returning a failure emits nothing", async () => {
    runSpy.mockImplementation(async (_input, _context, emit) => {
      emit("users.invitation-canceled", { invitationId: "inv-1" });
      return { success: false, error: "Custom failure" };
    });

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual({ success: false, error: "Custom failure" });
    expect(received).toEqual([]);
  });

  it("run throwing after emit returns the failure message and emits nothing", async () => {
    runSpy.mockImplementation(async (_input, _context, emit) => {
      emit("users.invitation-canceled", { invitationId: "inv-1" });
      throw new Error("write failed");
    });

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(received).toEqual([]);
  });

  it("run throwing DomainError returns its message", async () => {
    runSpy.mockRejectedValue(new DomainError("Brak uprawnień"));

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual({ success: false, error: "Brak uprawnień" });
  });

  it("run throwing NEXT_REDIRECT is rethrown", async () => {
    const redirect = nextRedirect();
    runSpy.mockRejectedValue(redirect);

    await expect(
      runCommand(probeCommand(), { id: ID }, undefined),
    ).rejects.toBe(redirect);
  });

  it("emit of an event the command does not declare throws a CommandError inside run and fails the command", async () => {
    const errors: unknown[] = [];
    runSpy.mockImplementation(async (_input, _context, emit) => {
      try {
        (emit as unknown as LooseEmit)("auth.signed-up", {
          userId: "user-1",
          email: "a@b.c",
        });
      } catch (error) {
        errors.push(error);
        throw error;
      }
      return { success: true };
    });

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      name: "CommandError",
      message: "command probe.delete does not declare event auth.signed-up",
    });
  });

  it("a command without events cannot emit, and nothing reaches the subscriber", async () => {
    runSpy.mockImplementation(async (_input, _context, emit) => {
      (emit as unknown as LooseEmit)("users.invitation-canceled", {
        invitationId: "inv-1",
      });
      return { success: true };
    });

    const result = await runCommand(silentCommand(), { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(received).toEqual([]);
  });

  it("a declared emit followed by an undeclared one emits nothing", async () => {
    runSpy.mockImplementation(async (_input, _context, emit) => {
      emit("users.invitation-canceled", { invitationId: "inv-1" });
      (emit as unknown as LooseEmit)("auth.signed-up", {
        userId: "user-1",
        email: "a@b.c",
      });
      return { success: true };
    });

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(received).toEqual([]);
  });

  it("a refused command emits nothing", async () => {
    mockGetOrgContext.mockImplementation(async () => serviceContext());
    runSpy.mockImplementation(async (_input, _context, emit) => {
      emit("users.invitation-canceled", { invitationId: "inv-1" });
      return { success: true };
    });

    await runCommand(probeCommand(), { id: ID }, undefined);

    expect(received).toEqual([]);
  });
});

describe("runCommand: the logged command errors", () => {
  const BOTH_INPUT: CommandSchema = z.object({
    id: z.uuid(),
    organizationId: z.string().optional(),
    workspaceId: z.string().meta({ organizationScoped: true }).optional(),
  });

  function loggedCommandError(): Error {
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(FAILURE, {
      err: expect.any(CommandError),
    });
    const [, details] = mockLogger.error.mock.calls[0] as [
      string,
      { err: Error },
    ];
    expect(details.err.name).toBe("CommandError");
    return details.err;
  }

  it("an undeclared key logs the not-declared CommandError", async () => {
    const result = await runCommand(
      probeCommand({ key: "probe.undeclared" }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(loggedCommandError().message).toBe(
      "command not declared by module probe: probe.undeclared",
    );
  });

  it("a module without a commands field logs the not-declared CommandError, not a TypeError", async () => {
    const result = await runCommand(
      probeCommand({ key: "bare.delete", module: "bare" }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(loggedCommandError().message).toBe(
      "command not declared by module bare: bare.delete",
    );
  });

  it("a key declared only by another module logs the not-declared CommandError of the command's module", async () => {
    await runCommand(
      probeCommand({ key: "probe.borrowed" }),
      { id: ID },
      undefined,
    );

    expect(loggedCommandError().message).toBe(
      "command not declared by module probe: probe.borrowed",
    );
  });

  it("a hook returning invalid input logs the invalid-input CommandError with the command key", async () => {
    registerHooks(hookEntry("probe", "probe.broken", () => ({ id: 42 })));

    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(loggedCommandError().message).toBe(
      "before hooks returned invalid input for probe.delete",
    );
  });

  it("a hook output failing the schema after its transform logs the invalid-input CommandError", async () => {
    registerHooks(
      hookEntry("probe", "probe.blank", () => ({ name: "   " }), "probe.trim"),
    );

    await runCommand(
      probeCommand({ key: "probe.trim", input: TRIM_INPUT }),
      { name: "first" },
      undefined,
    );

    expect(loggedCommandError().message).toBe(
      "before hooks returned invalid input for probe.trim",
    );
  });

  it("a hook adding a foreign organizationId logs the organization-scoped CommandError naming the field", async () => {
    registerHooks(
      hookEntry(
        "probe",
        "probe.foreign",
        () => ({ id: ID, organizationId: "org-b" }),
        "probe.scoped",
      ),
    );

    const result = await runCommand(
      probeCommand({ key: "probe.scoped", input: ORG_INPUT }),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(loggedCommandError().message).toBe(
      "organization-scoped field rejected for probe.scoped: organizationId",
    );
  });

  it("a caller's foreign organizationId without hooks logs the organization-scoped CommandError", async () => {
    await runCommand(
      probeCommand({ key: "probe.scoped", input: ORG_INPUT }),
      { id: ID, organizationId: "org-b" },
      undefined,
    );

    expect(loggedCommandError().message).toBe(
      "organization-scoped field rejected for probe.scoped: organizationId",
    );
  });

  it("a changed marked field logs the organization-scoped CommandError naming that field", async () => {
    registerHooks(
      hookEntry(
        "probe",
        "probe.workspace-swap",
        () => ({ id: ID, workspaceId: "org-b" }),
        "probe.workspace",
      ),
    );

    await runCommand(
      probeCommand({ key: "probe.workspace", input: WORKSPACE_INPUT }),
      { id: ID, workspaceId: "org-a" },
      undefined,
    );

    expect(loggedCommandError().message).toBe(
      "organization-scoped field rejected for probe.workspace: workspaceId",
    );
  });

  it("with two scoped fields the error names the one that was rejected", async () => {
    await runCommand(
      probeCommand({ key: "probe.both", input: BOTH_INPUT }),
      { id: ID, organizationId: "org-a", workspaceId: "org-b" },
      undefined,
    );

    expect(loggedCommandError().message).toBe(
      "organization-scoped field rejected for probe.both: workspaceId",
    );
    expect(runSpy).not.toHaveBeenCalled();
  });
});

describe("runCommand: organization-scoped fields under wrappers", () => {
  const marked = () => z.string().meta({ organizationScoped: true });

  it.each([
    [
      "probe.transform",
      "transform",
      z.object({
        id: z.uuid(),
        teamId: marked().transform((value) => value),
      }),
    ],
    [
      "probe.pipe",
      "pipe",
      z.object({ id: z.uuid(), teamId: z.string().pipe(marked()) }),
    ],
    [
      "probe.nullable-union",
      "union with null",
      z.object({ id: z.uuid(), teamId: z.union([marked(), z.null()]) }),
    ],
    [
      "probe.lazy",
      "lazy",
      z.object({ id: z.uuid(), teamId: z.lazy(() => marked()) }),
    ],
  ])(
    "%s: a marked field under %s with another organization's id fails, run not called",
    async (key, _wrapper, input) => {
      const result = await runCommand(
        probeCommand({ key, input }),
        { id: ID, teamId: "org-b" },
        undefined,
      );

      expect(result).toEqual(FAILURE_RESULT);
      expect(runSpy).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "probe.transform",
      "transform",
      z.object({
        id: z.uuid(),
        teamId: marked().transform((value) => value),
      }),
    ],
    [
      "probe.pipe",
      "pipe",
      z.object({ id: z.uuid(), teamId: z.string().pipe(marked()) }),
    ],
    [
      "probe.nullable-union",
      "union with null",
      z.object({ id: z.uuid(), teamId: z.union([marked(), z.null()]) }),
    ],
    [
      "probe.lazy",
      "lazy",
      z.object({ id: z.uuid(), teamId: z.lazy(() => marked()) }),
    ],
  ])(
    "%s: a marked field under %s with the context's organization runs",
    async (key, _wrapper, input) => {
      const result = await runCommand(
        probeCommand({ key, input }),
        { id: ID, teamId: "org-a" },
        undefined,
      );

      expect(result).toEqual({ success: true });
      expect(runInputs()).toStrictEqual([{ id: ID, teamId: "org-a" }]);
    },
  );

  it("a hook swapping a marked field under a pipe fails, run not called", async () => {
    registerHooks(
      hookEntry(
        "probe",
        "probe.pipe-swap",
        () => ({ id: ID, teamId: "org-b" }),
        "probe.pipe",
      ),
    );

    const result = await runCommand(
      probeCommand({
        key: "probe.pipe",
        input: z.object({ id: z.uuid(), teamId: z.string().pipe(marked()) }),
      }),
      { id: ID, teamId: "org-a" },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });
});

describe("runCommand: the command belongs to its module", () => {
  const borrowed = () =>
    defineCommand({
      key: "probe.borrowed",
      module: "probe",
      access: "member",
      input: ID_INPUT,
      failureMessage: FAILURE,
      run: (input, context, emit) =>
        runSpy(input, context, emit as unknown as CommandEmit<ProbeEvent>),
    });

  function loggedError(): Error {
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [message, details] = mockLogger.error.mock.calls[0] as [
      string,
      { err: Error },
    ];
    expect(message).toBe(FAILURE);
    expect(details.err).toBeInstanceOf(CommandError);
    return details.err;
  }

  it("a command spread into another module that declares its key fails before the session, run not called", async () => {
    const forged = { ...borrowed(), module: "zeta" };

    const result = await runCommand(forged, { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(mockRequireModuleAccess).not.toHaveBeenCalled();
    expect(mockGetAdminUserOrNull).not.toHaveBeenCalled();
    expect(loggedError().message).toBe(
      "command key probe.borrowed is not owned by module zeta",
    );
  });

  it("the ownership check runs before the module-enabled check", async () => {
    const forged = { ...borrowed(), module: "invoices" };

    const result = await runCommand(forged, { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(loggedError().message).toBe(
      "command key probe.borrowed is not owned by module invoices",
    );
  });

  it("a key that only starts with the module name without the dot is not owned", async () => {
    const forged = { ...borrowed(), key: "zetax.run", module: "zeta" };

    const result = await runCommand(forged, { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(loggedError().message).toBe(
      "command key zetax.run is not owned by module zeta",
    );
  });

  it("a hand-built key with nothing after the module's dot is not owned", async () => {
    const forged = { ...probeCommand(), key: "probe." };

    const result = await runCommand(forged, { id: ID }, undefined);

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(loggedError().message).toBe(
      "command key probe. is not owned by module probe",
    );
  });

  it("a command of its own module still runs", async () => {
    const result = await runCommand(probeCommand(), { id: ID }, undefined);

    expect(result).toEqual({ success: true });
    expect(runSpy).toHaveBeenCalledTimes(1);
  });
});

describe("runCommand: one command object per key", () => {
  const firstRun = vi.fn<ProbeRun>();
  const secondRun = vi.fn<ProbeRun>();

  function deleteCommand(run: typeof firstRun) {
    return defineCommand({
      key: "probe.delete",
      module: "probe",
      access: "member",
      input: ID_INPUT,
      failureMessage: FAILURE,
      run: (input, context, emit) =>
        run(input, context, emit as unknown as CommandEmit<ProbeEvent>),
    });
  }

  beforeEach(() => {
    firstRun.mockReset();
    firstRun.mockResolvedValue({ success: true, data: "first" });
    secondRun.mockReset();
    secondRun.mockResolvedValue({ success: true, data: "second" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("the same object run twice passes both times", async () => {
    const first = deleteCommand(firstRun);

    expect(await runCommand(first, { id: ID }, undefined)).toEqual({
      success: true,
      data: "first",
    });
    expect(await runCommand(first, { id: ID }, undefined)).toEqual({
      success: true,
      data: "first",
    });
    expect(firstRun).toHaveBeenCalledTimes(2);
  });

  it("a second object for the same key fails, its run is not called, and the first keeps working", async () => {
    const first = deleteCommand(firstRun);
    const second = deleteCommand(secondRun);

    const firstResult = await runCommand(first, { id: ID }, undefined);
    const secondResult = await runCommand(second, { id: ID }, undefined);
    const againResult = await runCommand(first, { id: ID }, undefined);

    expect(firstResult).toEqual({ success: true, data: "first" });
    expect(secondResult).toEqual(FAILURE_RESULT);
    expect(againResult).toEqual({ success: true, data: "first" });
    expect(secondRun).not.toHaveBeenCalled();
    expect(firstRun).toHaveBeenCalledTimes(2);
  });

  it("the second object is refused before the session read", async () => {
    await runCommand(deleteCommand(firstRun), { id: ID }, undefined);
    mockGetOrgContext.mockClear();

    await runCommand(deleteCommand(secondRun), { id: ID }, undefined);

    expect(mockGetOrgContext).not.toHaveBeenCalled();
  });

  it("logs the duplicate as a CommandError naming the key", async () => {
    await runCommand(deleteCommand(firstRun), { id: ID }, undefined);

    await runCommand(deleteCommand(secondRun), { id: ID }, undefined);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [message, details] = mockLogger.error.mock.calls[0] as [
      string,
      { err: Error },
    ];
    expect(message).toBe(FAILURE);
    expect(details.err).toBeInstanceOf(CommandError);
    expect(details.err.message).toBe(
      "two command objects registered for probe.delete",
    );
  });

  it("objects with different keys do not conflict", async () => {
    const first = deleteCommand(firstRun);

    await runCommand(first, { id: ID }, undefined);
    const silent = await runCommand(silentCommand(), { id: ID }, undefined);

    expect(silent).toEqual({ success: true });
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("in development the newest object replaces the remembered one, and the first runs again afterwards", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await loadModules();
    const first = deleteCommand(firstRun);
    const second = deleteCommand(secondRun);

    const firstResult = await runCommand(first, { id: ID }, undefined);
    const secondResult = await runCommand(second, { id: ID }, undefined);
    const againResult = await runCommand(first, { id: ID }, undefined);

    expect(firstResult).toEqual({ success: true, data: "first" });
    expect(secondResult).toEqual({ success: true, data: "second" });
    expect(againResult).toEqual({ success: true, data: "first" });
    expect(secondRun).toHaveBeenCalledTimes(1);
    expect(firstRun).toHaveBeenCalledTimes(2);
  });

  it("in production a second object is refused", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await loadModules();

    await runCommand(deleteCommand(firstRun), { id: ID }, undefined);
    const result = await runCommand(
      deleteCommand(secondRun),
      { id: ID },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(secondRun).not.toHaveBeenCalled();
  });
});

describe("runCommand: invalidInputMessage", () => {
  const STRING_ID_INPUT: CommandSchema = z.object({ id: z.string() });
  const firstPath = (error: z.ZodError) =>
    "first: " + (error.issues[0]?.path.join(".") ?? "");

  it("a failed first parse returns the custom message built from the ZodError, no hook, no run", async () => {
    const before = spyHook();

    const result = await runCommand(
      probeCommand({ input: STRING_ID_INPUT, invalidInputMessage: firstPath }),
      { id: 1 },
      undefined,
    );

    expect(result).toEqual({ success: false, error: "first: id" });
    expect(before).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("the custom message receives a ZodError describing the rejected field, once", async () => {
    const message = vi.fn<(error: z.ZodError) => string>(() => "custom");

    await runCommand(
      probeCommand({ input: STRING_ID_INPUT, invalidInputMessage: message }),
      { id: 1 },
      undefined,
    );

    expect(message).toHaveBeenCalledTimes(1);
    const [error] = message.mock.calls[0] as [z.ZodError];
    expect(error).toBeInstanceOf(z.ZodError);
    expect(error.issues.map((issue) => issue.path)).toEqual([["id"]]);
  });

  it("without invalidInputMessage a failed first parse returns the failure message", async () => {
    const result = await runCommand(
      probeCommand({ input: STRING_ID_INPUT }),
      { id: 1 },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a hook returning input the schema rejects returns the failure message, not the custom one, run not called", async () => {
    const message = vi.fn(firstPath);
    registerHooks(hookEntry("probe", "probe.broken", () => ({ id: 42 })));

    const result = await runCommand(
      probeCommand({ input: STRING_ID_INPUT, invalidInputMessage: message }),
      { id: "kept" },
      undefined,
    );

    expect(result).toEqual(FAILURE_RESULT);
    expect(message).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("a hook returning invalid input on a command with a custom message still logs the invalid-input CommandError", async () => {
    registerHooks(hookEntry("probe", "probe.broken", () => ({ id: 42 })));

    await runCommand(
      probeCommand({ input: STRING_ID_INPUT, invalidInputMessage: firstPath }),
      { id: "kept" },
      undefined,
    );

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [, details] = mockLogger.error.mock.calls[0] as [
      string,
      { err: Error },
    ];
    expect(details.err).toBeInstanceOf(CommandError);
    expect(details.err.message).toBe(
      "before hooks returned invalid input for probe.delete",
    );
  });

  it("valid input never calls the custom message and runs", async () => {
    const message = vi.fn(firstPath);

    const result = await runCommand(
      probeCommand({ input: STRING_ID_INPUT, invalidInputMessage: message }),
      { id: "kept" },
      undefined,
    );

    expect(result).toEqual({ success: true });
    expect(message).not.toHaveBeenCalled();
    expect(runInputs()).toStrictEqual([{ id: "kept" }]);
  });

  it("service mode without a confirmation wins over invalid input: the custom message is not used", async () => {
    mockGetOrgContext.mockImplementation(async () => serviceContext());
    const message = vi.fn(firstPath);

    const result = await runCommand(
      probeCommand({ input: STRING_ID_INPUT, invalidInputMessage: message }),
      { id: 1 },
      undefined,
    );

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expect(message).not.toHaveBeenCalled();
  });

  it('"global-admin" without an admin wins over invalid input: deniedMessage, not the custom message', async () => {
    mockGetAdminUserOrNull.mockResolvedValue(null);
    const message = vi.fn(firstPath);

    const result = await runCommand(
      probeCommand({
        access: "global-admin",
        deniedMessage: DENIED,
        input: STRING_ID_INPUT,
        invalidInputMessage: message,
      }),
      { id: 1 },
      undefined,
    );

    expect(result).toEqual(DENIED_RESULT);
    expect(message).not.toHaveBeenCalled();
  });

  it("invalid input on a command with a denied permission returns the custom message", async () => {
    const result = await runCommand(
      probeCommand({
        input: STRING_ID_INPUT,
        invalidInputMessage: firstPath,
        permission: "probe.manage",
        deniedMessage: DENIED,
      }),
      { id: 1 },
      undefined,
    );

    expect(result).toEqual({ success: false, error: "first: id" });
  });
});
