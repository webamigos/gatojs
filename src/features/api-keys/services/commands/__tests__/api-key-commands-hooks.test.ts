// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CommandHook,
  RegisteredCommandHook,
} from "@/shared/lib/commands/define-command";

const KEY_ID = "0b7f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";
const OTHER_KEY_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const FOREIGN_KEY_ID = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";
const NEW_KEY_ID = "9c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5";

interface StoredKey {
  id: string;
  organizationId: string;
  name: string;
  displayPrefix: string;
  hashedKey: string;
  scopes: string[];
  revokedAt: Date | null;
}

const {
  PEPPER,
  store,
  apiKeyFake,
  prismaFake,
  mockGetOrgContext,
  mockTrackAudit,
  mockNotFound,
  mockLogger,
  emittedNames,
  hookStore,
} = vi.hoisted(() => {
  const PEPPER = "unit-test-pepper-".padEnd(48, "x");
  process.env.API_KEY_PEPPER = PEPPER;
  const store = { rows: [] as StoredKey[] };
  const matches = (row: StoredKey, where: Record<string, unknown>) =>
    Object.entries(where).every(
      ([field, value]) =>
        (row as unknown as Record<string, unknown>)[field] === value,
    );
  const apiKeyFake = {
    count: vi.fn(async () => 0),
    create: vi.fn(
      async (args: { data: Omit<StoredKey, "id" | "revokedAt"> }) => {
        store.rows.push({
          ...args.data,
          id: "9c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5",
          revokedAt: null,
        });
        return { id: "9c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5" };
      },
    ),
    findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const row = store.rows.find((candidate) =>
        matches(candidate, args.where),
      );
      return row === undefined ? null : { ...row };
    }),
    updateMany: vi.fn(
      async (args: {
        where: Record<string, unknown>;
        data: Partial<StoredKey>;
      }) => {
        const hit = store.rows.filter((row) => matches(row, args.where));
        hit.forEach((row) => Object.assign(row, args.data));
        return { count: hit.length };
      },
    ),
    deleteMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const before = store.rows.length;
      store.rows = store.rows.filter((row) => !matches(row, args.where));
      return { count: before - store.rows.length };
    }),
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
    store,
    apiKeyFake,
    prismaFake,
    mockGetOrgContext: vi.fn(),
    mockTrackAudit: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    emittedNames: [] as string[],
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
vi.mock("@/modules.generated", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules.generated")>();
  const { z } = await import("zod");
  return {
    ...actual,
    moduleCommandHooks: hookStore.entries,
    moduleEvents: [
      ...actual.moduleEvents.filter((entry) => entry.module !== "api-keys"),
      {
        module: "api-keys",
        value: {
          "api-keys.created": z.object({
            apiKeyId: z.string(),
            name: z.string(),
            scopes: z.array(z.string()),
          }),
          "api-keys.revoked": z.object({ apiKeyId: z.string() }),
          "api-keys.deleted": z.object({ apiKeyId: z.string() }),
        },
      },
    ],
    moduleSubscribers: [
      {
        module: "probe",
        value: {
          "api-keys.created": {
            id: "probe.created",
            run: (event: { name: string }) => {
              emittedNames.push(event.name);
            },
          },
          "api-keys.revoked": {
            id: "probe.revoked",
            run: (event: { name: string }) => {
              emittedNames.push(event.name);
            },
          },
          "api-keys.deleted": {
            id: "probe.deleted",
            run: (event: { name: string }) => {
              emittedNames.push(event.name);
            },
          },
        },
      },
    ],
  };
});

import { DomainError } from "@/shared/utils/error-handling";
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

const SERVICE_CONTEXT = {
  userId: "super-1",
  organizationId: "org-1",
  orgRole: "owner",
  userRole: "superadmin",
  serviceMode: true,
};

const validInput = {
  name: "Integracja CRM",
  scopes: ["organization:read"],
  expiresInDays: null,
};

type CommandCall = () => Promise<{ success: boolean; error?: string }>;

const COMMANDS: {
  key: string;
  call: CommandCall;
  failure: string;
}[] = [
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

function seedKeys(): void {
  store.rows = [
    {
      id: KEY_ID,
      organizationId: "org-1",
      name: "Integracja CRM",
      displayPrefix: "wa_app_live_aaaaaa",
      hashedKey: "stored-hash-1",
      scopes: ["organization:read"],
      revokedAt: null,
    },
    {
      id: OTHER_KEY_ID,
      organizationId: "org-1",
      name: "Drugi klucz",
      displayPrefix: "wa_app_live_cccccc",
      hashedKey: "stored-hash-3",
      scopes: ["organization:read"],
      revokedAt: null,
    },
    {
      id: FOREIGN_KEY_ID,
      organizationId: "org-2",
      name: "Klucz B",
      displayPrefix: "wa_app_live_bbbbbb",
      hashedKey: "stored-hash-2",
      scopes: ["organization:read"],
      revokedAt: null,
    },
  ];
}

function addHook(command: string, before: CommandHook["before"]): void {
  hookStore.entries.push({
    module: "api-keys",
    command,
    hook: { id: `api-keys.test-${command}`, before },
  });
}

function expectNoWrites(): void {
  expect(prismaFake.$transaction).not.toHaveBeenCalled();
  expect(apiKeyFake.create).not.toHaveBeenCalled();
  expect(apiKeyFake.updateMany).not.toHaveBeenCalled();
  expect(apiKeyFake.deleteMany).not.toHaveBeenCalled();
  expect(mockTrackAudit).not.toHaveBeenCalled();
  expect(store.rows.map((row) => [row.id, row.revokedAt])).toEqual([
    [KEY_ID, null],
    [OTHER_KEY_ID, null],
    [FOREIGN_KEY_ID, null],
  ]);
}

beforeEach(() => {
  seedKeys();
  emittedNames.length = 0;
  hookStore.entries.length = 0;
  mockGetOrgContext.mockResolvedValue(OWNER_CONTEXT);
  mockTrackAudit.mockResolvedValue(undefined);
});

describe.each(COMMANDS)(
  "$key before hooks and guards",
  ({ key, call, failure }) => {
    it("runs the hook with the parsed input and the context when the command is allowed", async () => {
      const before = vi.fn();
      addHook(key, before);

      const result = await call();

      expect(result.success).toBe(true);
      expect(before).toHaveBeenCalledTimes(1);
      expect(before.mock.calls[0]?.[1]).toMatchObject({
        organizationId: "org-1",
        userId: "user-1",
      });
    });

    it("a hook throwing DomainError returns its message, writes nothing and emits no event", async () => {
      addHook(key, () => {
        throw new DomainError("Blocked by policy");
      });

      const result = await call();

      expect(result).toEqual({ success: false, error: "Blocked by policy" });
      expectNoWrites();
      expect(emittedNames).toEqual([]);
    });

    it("a member gets the failure message, no hook runs and nothing is written", async () => {
      const before = vi.fn();
      addHook(key, before);
      mockGetOrgContext.mockResolvedValue({
        ...OWNER_CONTEXT,
        orgRole: "member",
      });

      const result = await call();

      expect(result).toEqual({ success: false, error: failure });
      expect(mockNotFound).toHaveBeenCalledTimes(1);
      expect(before).not.toHaveBeenCalled();
      expect(apiKeyFake.findFirst).not.toHaveBeenCalled();
      expectNoWrites();
      expect(emittedNames).toEqual([]);
    });

    it("service mode without confirmation is refused before any hook or Prisma call", async () => {
      const before = vi.fn();
      addHook(key, before);
      mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);

      const result = await call();

      expect(result).toEqual({
        success: false,
        error: "Potwierdź zmianę w trybie serwisowym",
      });
      expect(before).not.toHaveBeenCalled();
      expect(apiKeyFake.findFirst).not.toHaveBeenCalled();
      expect(apiKeyFake.count).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("a hook of a module that is not enabled does not run", async () => {
      const before = vi.fn(() => {
        throw new DomainError("Blocked by policy");
      });
      hookStore.entries.push({
        module: "ghost",
        command: key,
        hook: { id: "ghost.block", before },
      });

      const result = await call();

      expect(result.success).toBe(true);
      expect(before).not.toHaveBeenCalled();
    });
  },
);

describe("revokeApiKeyCommand with a hook swapping the id", () => {
  it("revokes the id returned by the hook, filtered by the active organization", async () => {
    addHook("api-keys.revoke", () => ({ id: OTHER_KEY_ID }));

    const result = await revokeApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: true });
    expect(apiKeyFake.updateMany).toHaveBeenCalledTimes(1);
    expect(apiKeyFake.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: OTHER_KEY_ID, organizationId: "org-1", revokedAt: null },
    });
    expect(store.rows.find((row) => row.id === KEY_ID)?.revokedAt).toBeNull();
    expect(
      store.rows.find((row) => row.id === OTHER_KEY_ID)?.revokedAt,
    ).toBeInstanceOf(Date);
    expect(mockTrackAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "api_key.revoked",
        entityId: OTHER_KEY_ID,
        oldData: { name: "Drugi klucz", displayPrefix: "wa_app_live_cccccc" },
      }),
    );
    expect(emittedNames).toEqual(["api-keys.revoked"]);
  });

  it("a hook returning a key of another organization finds no key and leaves it untouched", async () => {
    addHook("api-keys.revoke", () => ({ id: FOREIGN_KEY_ID }));

    const result = await revokeApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: false, error: "Nie znaleziono klucza" });
    expectNoWrites();
    expect(emittedNames).toEqual([]);
  });

  it("a hook returning something that is not a uuid fails with the generic message", async () => {
    addHook("api-keys.revoke", () => ({ id: "nie-uuid" }));

    const result = await revokeApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({
      success: false,
      error: "Nie udało się unieważnić klucza",
    });
    expectNoWrites();
  });
});

describe("deleteApiKeyCommand with a hook swapping the id", () => {
  it("deletes the id returned by the hook, filtered by the active organization", async () => {
    addHook("api-keys.delete", () => ({ id: OTHER_KEY_ID }));

    const result = await deleteApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: true });
    expect(apiKeyFake.deleteMany.mock.calls[0]?.[0]).toEqual({
      where: { id: OTHER_KEY_ID, organizationId: "org-1" },
    });
    expect(store.rows.map((row) => row.id)).toEqual([KEY_ID, FOREIGN_KEY_ID]);
  });

  it("a hook returning a key of another organization finds no key and keeps it", async () => {
    addHook("api-keys.delete", () => ({ id: FOREIGN_KEY_ID }));

    const result = await deleteApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: false, error: "Nie znaleziono klucza" });
    expectNoWrites();
  });
});

describe("createApiKeyCommand with a hook", () => {
  it("creates the key with the name the hook returns", async () => {
    addHook("api-keys.create", (input) => ({ ...input, name: "Z hooka" }));

    const result = await createApiKeyCommand(validInput);

    expect(result.success).toBe(true);
    expect(store.rows.find((row) => row.id === NEW_KEY_ID)).toMatchObject({
      organizationId: "org-1",
      name: "Z hooka",
    });
  });

  it("a hook adding another organization's id still creates the key in the active organization", async () => {
    addHook("api-keys.create", (input) => ({
      ...input,
      organizationId: "org-2",
    }));

    const result = await createApiKeyCommand(validInput);

    expect(result.success).toBe(true);
    expect(apiKeyFake.create.mock.calls[0]?.[0]).toMatchObject({
      data: { organizationId: "org-1", createdById: "user-1" },
    });
    expect(
      store.rows
        .filter((row) => row.organizationId === "org-2")
        .map((row) => row.id),
    ).toEqual([FOREIGN_KEY_ID]);
  });

  it("a hook returning an unknown scope fails with the generic message and writes nothing", async () => {
    addHook("api-keys.create", (input) => ({
      ...input,
      scopes: ["nieznany:scope"],
    }));

    const result = await createApiKeyCommand(validInput);

    expect(result).toEqual({
      success: false,
      error: "Nie udało się utworzyć klucza",
    });
    expectNoWrites();
  });
});
