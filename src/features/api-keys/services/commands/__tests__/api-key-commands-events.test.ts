// @vitest-environment node
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisteredCommandHook } from "@/shared/lib/commands/define-command";
import type { EventOrigin } from "@/shared/lib/events/define-events";

const KEY_ID = "0b7f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";
const NEW_KEY_ID = "9c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5";
const FOREIGN_KEY_ID = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";
const MISSING_KEY_ID = "00000000-0000-4000-8000-000000000000";

interface StoredKey {
  id: string;
  organizationId: string;
  name: string;
  displayPrefix: string;
  hashedKey: string;
  scopes: string[];
  revokedAt: Date | null;
}

interface EmitCall {
  origin: EventOrigin;
  name: string;
  payload: unknown;
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
  timeline,
  emitCalls,
  delivered,
  hookStore,
} = vi.hoisted(() => {
  const PEPPER = "unit-test-pepper-".padEnd(48, "x");
  process.env.API_KEY_PEPPER = PEPPER;
  const store = { rows: [] as StoredKey[], activeCount: 0 };
  const matches = (row: StoredKey, where: Record<string, unknown>) =>
    Object.entries(where).every(
      ([field, value]) =>
        (row as unknown as Record<string, unknown>)[field] === value,
    );
  const apiKeyFake = {
    count: vi.fn(async () => store.activeCount),
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
    timeline: [] as string[],
    emitCalls: [] as EmitCall[],
    delivered: [] as unknown[],
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
  trackAudit: (event: { action: string }) => {
    timeline.push(`audit:${event.action}`);
    return mockTrackAudit(event);
  },
}));
vi.mock("@/shared/lib/events/emit-event", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/shared/lib/events/emit-event")>();
  return {
    emitEvent: (origin: EventOrigin, name: string, payload: unknown) => {
      timeline.push(`event:${name}`);
      emitCalls.push({ origin, name, payload });
      return actual.emitEvent(origin, name as never, payload as never);
    },
  };
});
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
vi.mock("@/modules.generated", async () => {
  const { events } = await import("@/features/api-keys/events");
  const record = {
    run: (event: unknown) => {
      delivered.push(event);
    },
  };
  return {
    modules: [{ key: "api-keys", apiScopes: [{ key: "organization:read" }] }],
    auditSinks: [],
    moduleCommandHooks: hookStore.entries,
    moduleEvents: [{ module: "api-keys", value: events }],
    moduleSubscribers: [
      {
        module: "probe",
        value: {
          "api-keys.created": { id: "probe.created", ...record },
          "api-keys.revoked": { id: "probe.revoked", ...record },
          "api-keys.deleted": { id: "probe.deleted", ...record },
        },
      },
    ],
  };
});

import { events } from "@/features/api-keys/events";
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

function seedKeys(): void {
  store.rows = [
    {
      id: KEY_ID,
      organizationId: "org-1",
      name: "Integracja CRM",
      displayPrefix: "wa_app_live_abcdef",
      hashedKey: "stored-hash-1",
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

function createdHash(): string {
  const call = apiKeyFake.create.mock.calls[0]?.[0] as {
    data: { hashedKey: string };
  };
  return call.data.hashedKey;
}

function expectNoEvent(): void {
  expect(emitCalls).toEqual([]);
  expect(delivered).toEqual([]);
}

beforeEach(() => {
  seedKeys();
  store.activeCount = 0;
  timeline.length = 0;
  emitCalls.length = 0;
  delivered.length = 0;
  hookStore.entries.length = 0;
  mockGetOrgContext.mockResolvedValue(OWNER_CONTEXT);
  mockTrackAudit.mockResolvedValue(undefined);
});

describe("api-keys events", () => {
  it("declares exactly the created, revoked and deleted events", () => {
    expect(Object.keys(events).sort()).toEqual([
      "api-keys.created",
      "api-keys.deleted",
      "api-keys.revoked",
    ]);
  });

  it("the created event schema strips secret fields from a payload", () => {
    const parsed = events["api-keys.created"].parse({
      apiKeyId: NEW_KEY_ID,
      name: "Integracja CRM",
      scopes: ["organization:read"],
      plaintext: "wa_app_live_secret",
      hashedKey: "hash",
      displayPrefix: "wa_app_live_secret",
    });

    expect(parsed).toEqual({
      apiKeyId: NEW_KEY_ID,
      name: "Integracja CRM",
      scopes: ["organization:read"],
    });
  });
});

describe("createApiKeyCommand events", () => {
  it("emits exactly one api-keys.created with id, name and scopes", async () => {
    const result = await createApiKeyCommand(validInput);

    expect(result.success).toBe(true);
    expect(emitCalls).toHaveLength(1);
    expect(emitCalls[0]?.name).toBe("api-keys.created");
    expect(emitCalls[0]?.payload).toEqual({
      apiKeyId: NEW_KEY_ID,
      name: "Integracja CRM",
      scopes: ["organization:read"],
    });
  });

  it("emits the trimmed name the key was stored with", async () => {
    await createApiKeyCommand({ ...validInput, name: "  CRM  " });

    expect(emitCalls[0]?.payload).toEqual({
      apiKeyId: NEW_KEY_ID,
      name: "CRM",
      scopes: ["organization:read"],
    });
  });

  it("the payload handed to emitEvent carries neither the plaintext, its hash nor the display prefix", async () => {
    const result = await createApiKeyCommand(validInput);

    const plaintext = result.data?.plaintext ?? "";
    expect(plaintext.startsWith("wa_app_live_")).toBe(true);
    const hash = createHmac("sha256", PEPPER).update(plaintext).digest("hex");
    expect(createdHash()).toBe(hash);
    expect(emitCalls).toHaveLength(1);
    const payload = emitCalls[0]?.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["apiKeyId", "name", "scopes"]);
    expect(payload).not.toHaveProperty("plaintext");
    expect(payload).not.toHaveProperty("hashedKey");
    expect(payload).not.toHaveProperty("displayPrefix");
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(plaintext);
    expect(serialized).not.toContain(hash);
    expect(serialized).not.toContain(plaintext.slice(0, 18));
  });

  it("delivers the event with the organization and actor of the context", async () => {
    await createApiKeyCommand(validInput);

    expect(emitCalls[0]?.origin).toMatchObject({
      organizationId: "org-1",
      actorUserId: "user-1",
    });
    expect(delivered).toEqual([
      {
        name: "api-keys.created",
        organizationId: "org-1",
        actorUserId: "user-1",
        serviceMode: false,
        payload: {
          apiKeyId: NEW_KEY_ID,
          name: "Integracja CRM",
          scopes: ["organization:read"],
        },
      },
    ]);
  });

  it("marks the event as service mode after a confirmed change in service mode", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...OWNER_CONTEXT,
      userId: "super-1",
      userRole: "superadmin",
      serviceMode: true,
    });

    await createApiKeyCommand(validInput, {
      serviceModeConfirmed: true,
      organizationId: "org-1",
    });

    expect(delivered).toEqual([
      expect.objectContaining({
        name: "api-keys.created",
        organizationId: "org-1",
        actorUserId: "super-1",
        serviceMode: true,
      }),
    ]);
  });

  it("emits the event after the audit entry", async () => {
    await createApiKeyCommand(validInput);

    expect(timeline).toEqual([
      "audit:api_key.created",
      "event:api-keys.created",
    ]);
  });

  it("emits nothing when the active key limit is reached", async () => {
    store.activeCount = 10;

    const result = await createApiKeyCommand(validInput);

    expect(result).toEqual({
      success: false,
      error: "Osiągnięto limit 10 aktywnych kluczy",
    });
    expectNoEvent();
  });

  it("emits nothing when the transaction throws on a database failure", async () => {
    apiKeyFake.create.mockRejectedValueOnce(new Error("db down"));

    const result = await createApiKeyCommand(validInput);

    expect(result).toEqual({
      success: false,
      error: "Nie udało się utworzyć klucza",
    });
    expectNoEvent();
  });

  it("emits nothing when the audit write fails", async () => {
    mockTrackAudit.mockRejectedValueOnce(new Error("audit down"));

    const result = await createApiKeyCommand(validInput);

    expect(result).toEqual({
      success: false,
      error: "Nie udało się utworzyć klucza",
    });
    expectNoEvent();
  });

  it("emits nothing and runs no hook for invalid input", async () => {
    const before = vi.fn();
    hookStore.entries.push({
      module: "api-keys",
      command: "api-keys.create",
      hook: { id: "api-keys.test-spy", before },
    });

    const result = await createApiKeyCommand({ ...validInput, scopes: [] });

    expect(result).toEqual({
      success: false,
      error: "Nie udało się utworzyć klucza",
    });
    expect(before).not.toHaveBeenCalled();
    expect(apiKeyFake.create).not.toHaveBeenCalled();
    expectNoEvent();
  });
});

describe("revokeApiKeyCommand events", () => {
  it("emits exactly one api-keys.revoked with the key id", async () => {
    const result = await revokeApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: true });
    expect(emitCalls).toEqual([
      {
        origin: expect.objectContaining({
          organizationId: "org-1",
          actorUserId: "user-1",
        }),
        name: "api-keys.revoked",
        payload: { apiKeyId: KEY_ID },
      },
    ]);
    expect(delivered).toEqual([
      {
        name: "api-keys.revoked",
        organizationId: "org-1",
        actorUserId: "user-1",
        serviceMode: false,
        payload: { apiKeyId: KEY_ID },
      },
    ]);
  });

  it("emits the event after the audit entry", async () => {
    await revokeApiKeyCommand({ id: KEY_ID });

    expect(timeline).toEqual([
      "audit:api_key.revoked",
      "event:api-keys.revoked",
    ]);
  });

  it("emits nothing for an already revoked key", async () => {
    const first = store.rows[0];
    if (first) {
      first.revokedAt = new Date("2026-01-15T10:00:00.000Z");
    }

    const result = await revokeApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: true });
    expect(apiKeyFake.updateMany).not.toHaveBeenCalled();
    expectNoEvent();
  });

  it("emits nothing when the update matches no row", async () => {
    apiKeyFake.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await revokeApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: true });
    expect(mockTrackAudit).not.toHaveBeenCalled();
    expectNoEvent();
  });

  it("emits nothing for a key of another organization", async () => {
    const result = await revokeApiKeyCommand({ id: FOREIGN_KEY_ID });

    expect(result).toEqual({ success: false, error: "Nie znaleziono klucza" });
    expect(
      store.rows.find((row) => row.id === FOREIGN_KEY_ID)?.revokedAt,
    ).toBeNull();
    expectNoEvent();
  });

  it("emits nothing for a missing key", async () => {
    const result = await revokeApiKeyCommand({ id: MISSING_KEY_ID });

    expect(result).toEqual({ success: false, error: "Nie znaleziono klucza" });
    expectNoEvent();
  });

  it("emits nothing for an id that is not a uuid", async () => {
    const result = await revokeApiKeyCommand({ id: "nie-uuid" });

    expect(result).toEqual({
      success: false,
      error: "Nie udało się unieważnić klucza",
    });
    expectNoEvent();
  });
});

describe("deleteApiKeyCommand events", () => {
  it("emits exactly one api-keys.deleted with the key id", async () => {
    const result = await deleteApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: true });
    expect(emitCalls).toEqual([
      {
        origin: expect.objectContaining({
          organizationId: "org-1",
          actorUserId: "user-1",
        }),
        name: "api-keys.deleted",
        payload: { apiKeyId: KEY_ID },
      },
    ]);
    expect(delivered).toEqual([
      {
        name: "api-keys.deleted",
        organizationId: "org-1",
        actorUserId: "user-1",
        serviceMode: false,
        payload: { apiKeyId: KEY_ID },
      },
    ]);
  });

  it("emits the event after the audit entry", async () => {
    await deleteApiKeyCommand({ id: KEY_ID });

    expect(timeline).toEqual([
      "audit:api_key.deleted",
      "event:api-keys.deleted",
    ]);
  });

  it("emits nothing when the delete matches no row", async () => {
    apiKeyFake.deleteMany.mockResolvedValueOnce({ count: 0 });

    const result = await deleteApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: true });
    expect(mockTrackAudit).not.toHaveBeenCalled();
    expectNoEvent();
  });

  it("emits nothing for a missing key", async () => {
    const result = await deleteApiKeyCommand({ id: MISSING_KEY_ID });

    expect(result).toEqual({ success: false, error: "Nie znaleziono klucza" });
    expect(apiKeyFake.deleteMany).not.toHaveBeenCalled();
    expectNoEvent();
  });

  it("emits nothing for a key of another organization and keeps it", async () => {
    const result = await deleteApiKeyCommand({ id: FOREIGN_KEY_ID });

    expect(result).toEqual({ success: false, error: "Nie znaleziono klucza" });
    expect(store.rows.map((row) => row.id)).toEqual([KEY_ID, FOREIGN_KEY_ID]);
    expectNoEvent();
  });
});
