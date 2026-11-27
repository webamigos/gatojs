// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisteredCommandHook } from "@/shared/lib/commands/define-command";

const KEY_ID = "0b7f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";

const {
  PEPPER,
  apiKeyFake,
  prismaFake,
  mockGetOrgContext,
  mockTrackAudit,
  mockNotFound,
  mockLogger,
  hookStore,
} = vi.hoisted(() => {
  const PEPPER = "unit-test-pepper-".padEnd(48, "x");
  process.env.API_KEY_PEPPER = PEPPER;
  const apiKeyFake = {
    count: vi.fn(async () => 0),
    create: vi.fn(async () => ({ id: "9c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5" })),
    findFirst: vi.fn(async () => ({
      id: "0b7f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4",
      name: "Integracja CRM",
      displayPrefix: "wa_app_live_abcdef",
      revokedAt: null,
    })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  };
  const prismaFake: Record<string, unknown> = {
    apiKey: apiKeyFake,
    $executeRaw: vi.fn(async () => 0),
  };
  prismaFake.$transaction = vi.fn(
    async (work: (tx: unknown) => Promise<unknown>) => work(prismaFake),
  );
  return {
    PEPPER,
    apiKeyFake,
    prismaFake,
    mockGetOrgContext: vi.fn(),
    mockTrackAudit: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    hookStore: { entries: [] as RegisteredCommandHook[] },
  };
});

vi.mock("@/env", () => ({
  env: { MULTI_ORG: false, API_KEY_PEPPER: PEPPER },
}));
vi.mock("@/shared/lib/prisma", () => ({ prisma: prismaFake }));
vi.mock("@/shared/lib/auth/org-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/auth/org-context")>()),
  getOrgContext: () => mockGetOrgContext(),
}));
vi.mock("@/shared/lib/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/audit")>()),
  trackAudit: (event: unknown) => mockTrackAudit(event),
}));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("next/navigation", () => ({ notFound: mockNotFound }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/config/project", () => ({
  project: { name: "WA App", slug: "wa-app" },
}));
vi.mock("@/modules.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.generated")>()),
  moduleCommandHooks: hookStore.entries,
}));
vi.mock("@/modules.client.generated", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules.client.generated")>();
  const { applyGatoConfig } = await import("@/shared/lib/modules/gato-config");
  const { default: dashboardModule } =
    await import("@/features/dashboard/module");
  const { default: apiKeysModule } = await import("@/features/api-keys/module");
  return {
    ...actual,
    clientModules: applyGatoConfig([dashboardModule, apiKeysModule], {
      modules: { "api-keys": { enabled: false } },
    }),
  };
});

import {
  createApiKeyCommand,
  deleteApiKeyCommand,
  revokeApiKeyCommand,
} from "../api-key-commands";

const OWNER_CONTEXT = {
  userId: "user-1",
  organizationId: "org-1",
  orgRole: "owner",
  userRole: "user",
  serviceMode: false,
};

const validInput = {
  name: "Integracja CRM",
  scopes: ["organization:read"],
  expiresInDays: null,
};

type CommandCall = () => Promise<{ success: boolean; error?: string }>;

const COMMANDS: { key: string; call: CommandCall; failure: string }[] = [
  {
    key: "api-keys.create",
    call: () => createApiKeyCommand(validInput),
    failure: "Nie udało się utworzyć klucza",
  },
  {
    key: "api-keys.revoke",
    call: () => revokeApiKeyCommand({ id: KEY_ID }),
    failure: "Nie udało się unieważnić klucza",
  },
  {
    key: "api-keys.delete",
    call: () => deleteApiKeyCommand({ id: KEY_ID }),
    failure: "Nie udało się usunąć klucza",
  },
];

const hookSpy = vi.fn();

beforeEach(() => {
  hookStore.entries.length = 0;
  for (const { key } of COMMANDS) {
    hookStore.entries.push({
      module: "dashboard",
      command: key,
      hook: { id: `dashboard.spy-${key}`, before: hookSpy },
    });
  }
  mockGetOrgContext.mockResolvedValue(OWNER_CONTEXT);
  mockTrackAudit.mockResolvedValue(undefined);
});

describe.each(COMMANDS)("$key with api-keys disabled", ({ call, failure }) => {
  it("returns the command's failure message instead of throwing", async () => {
    const result = await call();

    expect(result).toEqual({ success: false, error: failure });
  });

  it("stops before the session read, any hook and any Prisma call", async () => {
    await call();

    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(hookSpy).not.toHaveBeenCalled();
    expect(prismaFake.$transaction).not.toHaveBeenCalled();
    expect(prismaFake.$executeRaw).not.toHaveBeenCalled();
    expect(apiKeyFake.count).not.toHaveBeenCalled();
    expect(apiKeyFake.create).not.toHaveBeenCalled();
    expect(apiKeyFake.findFirst).not.toHaveBeenCalled();
    expect(apiKeyFake.updateMany).not.toHaveBeenCalled();
    expect(apiKeyFake.deleteMany).not.toHaveBeenCalled();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });
});

describe("api key commands with api-keys disabled in service mode", () => {
  it("return each command's failure message even with a valid confirmation", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...OWNER_CONTEXT,
      userRole: "superadmin",
      serviceMode: true,
    });
    const confirmation = {
      serviceModeConfirmed: true,
      organizationId: "org-1",
    };

    const results = [
      await createApiKeyCommand(validInput, confirmation),
      await revokeApiKeyCommand({ id: KEY_ID }, confirmation),
      await deleteApiKeyCommand({ id: KEY_ID }, confirmation),
    ];

    expect(results).toEqual([
      { success: false, error: "Nie udało się utworzyć klucza" },
      { success: false, error: "Nie udało się unieważnić klucza" },
      { success: false, error: "Nie udało się usunąć klucza" },
    ]);
    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(hookSpy).not.toHaveBeenCalled();
  });
});
