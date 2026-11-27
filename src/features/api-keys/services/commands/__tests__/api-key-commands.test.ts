import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-03-01T12:00:00.000Z");
const KEY_ID = "0b7f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";

const {
  PEPPER,
  mockPrisma,
  mockGetOrgContext,
  mockTrackAudit,
  mockNotFound,
  mockLogger,
} = vi.hoisted(() => {
  const PEPPER = "unit-test-pepper-".padEnd(48, "x");
  process.env.API_KEY_PEPPER = PEPPER;
  const mockPrisma = {
    apiKey: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return {
    PEPPER,
    mockPrisma,
    mockGetOrgContext: vi.fn(),
    mockTrackAudit: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});

vi.mock("@/env", () => ({
  env: { MULTI_ORG: false, API_KEY_PEPPER: PEPPER },
}));
vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
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
  moduleCommandHooks: [],
}));

import {
  createApiKeyCommand,
  deleteApiKeyCommand,
  revokeApiKeyCommand,
} from "../api-key-commands";
import { knownApiScopes } from "../../api-scopes";

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

const SERVICE_MODE_ERROR = {
  success: false,
  error: "Potwierdź zmianę w trybie serwisowym",
};

const validInput = {
  name: "Integracja CRM",
  scopes: ["organization:read"],
  expiresInDays: null,
};

function expectNoWrites() {
  expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  expect(mockPrisma.apiKey.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.apiKey.deleteMany).not.toHaveBeenCalled();
  expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
  expect(mockPrisma.apiKey.delete).not.toHaveBeenCalled();
  expect(mockTrackAudit).not.toHaveBeenCalled();
}

function createdData(): Record<string, unknown> {
  const call = mockPrisma.apiKey.create.mock.calls[0]?.[0] as {
    data: Record<string, unknown>;
  };
  return call.data;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockGetOrgContext.mockResolvedValue(OWNER_CONTEXT);
  mockPrisma.$transaction.mockImplementation(async (callback: unknown) =>
    typeof callback === "function" ? callback(mockPrisma) : callback,
  );
  mockPrisma.$executeRaw.mockResolvedValue(0);
  mockPrisma.apiKey.count.mockResolvedValue(0);
  mockPrisma.apiKey.create.mockResolvedValue({ id: KEY_ID });
  mockPrisma.apiKey.findFirst.mockResolvedValue({
    id: KEY_ID,
    name: "Integracja CRM",
    displayPrefix: "wa_app_live_abcdef",
    scopes: ["organization:read"],
    revokedAt: null,
  });
  mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.apiKey.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.apiKey.update.mockResolvedValue({ id: KEY_ID });
  mockPrisma.apiKey.delete.mockResolvedValue({ id: KEY_ID });
  mockTrackAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("knownApiScopes", () => {
  it("zwraca zakresy zadeklarowane przez moduły, w tym organization:read", () => {
    expect(knownApiScopes()).toContain("organization:read");
  });
});

describe("createApiKeyCommand", () => {
  it("owner tworzy klucz: zwraca plaintext z prefiksem projektu i zapisuje tylko hash HMAC-SHA256", async () => {
    const result = await createApiKeyCommand(validInput);

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe(KEY_ID);
    const plaintext = result.data?.plaintext ?? "";
    expect(plaintext.startsWith("wa_app_live_")).toBe(true);
    const data = createdData();
    expect(data.hashedKey).toBe(
      createHmac("sha256", PEPPER).update(plaintext).digest("hex"),
    );
    expect(data.displayPrefix).toBe(plaintext.slice(0, 18));
    expect(data.organizationId).toBe("org-1");
    expect(data.createdById).toBe("user-1");
    expect(data.name).toBe("Integracja CRM");
    expect(data.scopes).toEqual(["organization:read"]);
    expect(data).not.toHaveProperty("plaintext");
    expect(JSON.stringify(data)).not.toContain(plaintext);
  });

  it("zapisuje dokładnie jeden wpis audytu api_key.created bez klucza i hasha", async () => {
    const result = await createApiKeyCommand(validInput);

    const plaintext = result.data?.plaintext ?? "";
    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    const event = mockTrackAudit.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      organizationId: "org-1",
      actorUserId: "user-1",
      action: "api_key.created",
      entityType: "api_key",
      entityId: KEY_ID,
      newData: {
        name: "Integracja CRM",
        scopes: ["organization:read"],
        displayPrefix: plaintext.slice(0, 18),
      },
    });
    expect(event.newData).toEqual({
      name: "Integracja CRM",
      scopes: ["organization:read"],
      displayPrefix: plaintext.slice(0, 18),
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(plaintext);
    expect(serialized).not.toContain(String(createdData().hashedKey));
  });

  it("przycina nazwę klucza", async () => {
    await createApiKeyCommand({ ...validInput, name: "  CRM  " });

    expect(createdData().name).toBe("CRM");
  });

  it("odrzuca pustą nazwę i nazwę dłuższą niż 100 znaków", async () => {
    const empty = await createApiKeyCommand({ ...validInput, name: "   " });
    const tooLong = await createApiKeyCommand({
      ...validInput,
      name: "a".repeat(101),
    });

    expect(empty.success).toBe(false);
    expect(tooLong.success).toBe(false);
    expectNoWrites();
  });

  it("akceptuje nazwę o długości 100 znaków", async () => {
    const result = await createApiKeyCommand({
      ...validInput,
      name: "a".repeat(100),
    });

    expect(result.success).toBe(true);
  });

  it("odrzuca nieznany zakres", async () => {
    const result = await createApiKeyCommand({
      ...validInput,
      scopes: ["nieznany:scope"],
    });

    expect(result.success).toBe(false);
    expectNoWrites();
  });

  it("odrzuca znany zakres zmieszany z nieznanym", async () => {
    const result = await createApiKeyCommand({
      ...validInput,
      scopes: ["organization:read", "nieznany:scope"],
    });

    expect(result.success).toBe(false);
    expectNoWrites();
  });

  it("odrzuca pustą listę zakresów", async () => {
    const result = await createApiKeyCommand({ ...validInput, scopes: [] });

    expect(result.success).toBe(false);
    expectNoWrites();
  });

  it("odrzuca niedozwolony okres ważności", async () => {
    const result = await createApiKeyCommand({
      ...validInput,
      expiresInDays: 45,
    });

    expect(result.success).toBe(false);
    expectNoWrites();
  });

  it("odrzuca brak wejścia", async () => {
    const result = await createApiKeyCommand(undefined);

    expect(result.success).toBe(false);
    expectNoWrites();
  });

  it("expiresInDays 30 ustawia expiresAt na teraz plus 30 dni", async () => {
    await createApiKeyCommand({ ...validInput, expiresInDays: 30 });

    expect(createdData().expiresAt).toEqual(
      new Date("2026-03-31T12:00:00.000Z"),
    );
  });

  it("expiresInDays 365 ustawia expiresAt na teraz plus 365 dni", async () => {
    await createApiKeyCommand({ ...validInput, expiresInDays: 365 });

    expect(createdData().expiresAt).toEqual(
      new Date("2027-03-01T12:00:00.000Z"),
    );
  });

  it("expiresInDays null zostawia klucz bez wygaśnięcia", async () => {
    await createApiKeyCommand(validInput);

    expect(createdData().expiresAt ?? null).toBeNull();
  });

  it("przy 10 aktywnych kluczach zwraca błąd limitu i nic nie zapisuje", async () => {
    mockPrisma.apiKey.count.mockResolvedValue(10);

    const result = await createApiKeyCommand(validInput);

    expect(result).toEqual({
      success: false,
      error: "Osiągnięto limit 10 aktywnych kluczy",
    });
    expectNoWrites();
  });

  it("przy 9 aktywnych kluczach pozwala utworzyć dziesiąty", async () => {
    mockPrisma.apiKey.count.mockResolvedValue(9);

    const result = await createApiKeyCommand(validInput);

    expect(result.success).toBe(true);
  });

  it("member dostaje błąd operacji po odmowie dostępu do modułu i nic nie zapisuje", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...OWNER_CONTEXT,
      orgRole: "member",
    });

    const result = await createApiKeyCommand(validInput);

    expect(result).toEqual({
      success: false,
      error: "Nie udało się utworzyć klucza",
    });
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it("admin organizacji może tworzyć klucze", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...OWNER_CONTEXT,
      orgRole: "admin",
    });

    const result = await createApiKeyCommand(validInput);

    expect(result.success).toBe(true);
  });

  it("w trybie serwisowym bez potwierdzenia zwraca błąd i nie dotyka bazy", async () => {
    mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);

    const result = await createApiKeyCommand(validInput);

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expectNoWrites();
    expect(mockPrisma.apiKey.count).not.toHaveBeenCalled();
  });

  it("w trybie serwisowym z potwierdzeniem innej organizacji zwraca błąd", async () => {
    mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);

    const result = await createApiKeyCommand(validInput, {
      serviceModeConfirmed: true,
      organizationId: "org-2",
    });

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expectNoWrites();
  });

  it("w trybie serwisowym z potwierdzeniem aktywnej organizacji zapisuje klucz i serviceMode w audycie", async () => {
    mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);

    const result = await createApiKeyCommand(validInput, {
      serviceModeConfirmed: true,
      organizationId: "org-1",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.apiKey.create).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit.mock.calls[0]?.[0]).toMatchObject({
      action: "api_key.created",
      serviceMode: true,
    });
  });

  it("poza trybem serwisowym potwierdzenie nieaktualnej organizacji zwraca błąd", async () => {
    const result = await createApiKeyCommand(validInput, {
      serviceModeConfirmed: true,
      organizationId: "org-2",
    });

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expectNoWrites();
  });

  it("awaria bazy kończy się błędem operacji bez wycieku klucza", async () => {
    mockPrisma.apiKey.create.mockRejectedValue(new Error("db down"));

    const result = await createApiKeyCommand(validInput);

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });
});

describe("revokeApiKeyCommand", () => {
  it("odrzuca id, które nie jest uuid", async () => {
    const result = await revokeApiKeyCommand({ id: "nie-uuid" });

    expect(result.success).toBe(false);
    expectNoWrites();
  });

  it("member dostaje błąd operacji po odmowie dostępu do modułu i nic nie zapisuje", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...OWNER_CONTEXT,
      orgRole: "member",
    });

    const result = await revokeApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({
      success: false,
      error: "Nie udało się unieważnić klucza",
    });
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it("w trybie serwisowym bez potwierdzenia zwraca błąd i nic nie zapisuje", async () => {
    mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);

    const result = await revokeApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expectNoWrites();
  });
});

describe("deleteApiKeyCommand", () => {
  it("odrzuca id, które nie jest uuid", async () => {
    const result = await deleteApiKeyCommand({ id: "nie-uuid" });

    expect(result.success).toBe(false);
    expectNoWrites();
  });

  it("member dostaje błąd operacji po odmowie dostępu do modułu i nic nie zapisuje", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...OWNER_CONTEXT,
      orgRole: "member",
    });

    const result = await deleteApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({
      success: false,
      error: "Nie udało się usunąć klucza",
    });
    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it("w trybie serwisowym bez potwierdzenia zwraca błąd i nic nie zapisuje", async () => {
    mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);

    const result = await deleteApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expectNoWrites();
  });
});

interface StoredKey {
  id: string;
  organizationId: string;
  name: string;
  displayPrefix: string;
  scopes: string[];
  revokedAt: Date | null;
}

let storedKeys: StoredKey[] = [];

function rowMatches(row: StoredKey, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (condition !== null && typeof condition === "object") {
      throw new Error(`nieobsługiwany warunek w fake: ${field}`);
    }
    return row[field as keyof StoredKey] === condition;
  });
}

function installKeyTable(afterRead: () => void) {
  storedKeys = [
    {
      id: KEY_ID,
      organizationId: "org-1",
      name: "Integracja CRM",
      displayPrefix: "wa_app_live_abcdef",
      scopes: ["organization:read"],
      revokedAt: null,
    },
  ];
  mockPrisma.apiKey.findFirst.mockImplementation(async () => {
    const snapshot = { ...storedKeys[0] };
    afterRead();
    return snapshot;
  });
  mockPrisma.apiKey.updateMany.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Partial<StoredKey>;
    }) => {
      const matching = storedKeys.filter((row) => rowMatches(row, where));
      matching.forEach((row) => Object.assign(row, data));
      return { count: matching.length };
    },
  );
  mockPrisma.apiKey.deleteMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      const before = storedKeys.length;
      storedKeys = storedKeys.filter((row) => !rowMatches(row, where));
      return { count: before - storedKeys.length };
    },
  );
}

function moveKeyToOtherOrganization() {
  const row = storedKeys.find((key) => key.id === KEY_ID);
  if (row) {
    row.organizationId = "org-2";
  }
}

function removeKeyByOtherRequest() {
  storedKeys = storedKeys.filter((key) => key.id !== KEY_ID);
}

describe("revokeApiKeyCommand: zapis ograniczony do aktywnej organizacji", () => {
  it("unieważnia klucz aktywnej organizacji i zapisuje jedno zdarzenie api_key.revoked", async () => {
    installKeyTable(() => undefined);

    const result = await revokeApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: true });
    expect(storedKeys[0]?.revokedAt).toEqual(NOW);
    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit.mock.calls[0]?.[0]).toMatchObject({
      organizationId: "org-1",
      action: "api_key.revoked",
      entityId: KEY_ID,
    });
  });

  it("gdy wiersz o tym id należy w chwili zapisu do innej organizacji, nie unieważnia go i nie zapisuje audytu", async () => {
    installKeyTable(moveKeyToOtherOrganization);

    await revokeApiKeyCommand({ id: KEY_ID });

    expect(storedKeys).toEqual([
      expect.objectContaining({
        id: KEY_ID,
        organizationId: "org-2",
        revokedAt: null,
      }),
    ]);
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });
});

describe("deleteApiKeyCommand: zapis ograniczony do aktywnej organizacji", () => {
  it("usuwa klucz aktywnej organizacji i zapisuje dokładnie jedno zdarzenie api_key.deleted", async () => {
    installKeyTable(() => undefined);

    const result = await deleteApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: true });
    expect(storedKeys).toEqual([]);
    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit.mock.calls[0]?.[0]).toMatchObject({
      organizationId: "org-1",
      action: "api_key.deleted",
      entityType: "api_key",
      entityId: KEY_ID,
      oldData: { name: "Integracja CRM", displayPrefix: "wa_app_live_abcdef" },
    });
  });

  it("gdy inne żądanie usunęło klucz między odczytem a zapisem, zwraca sukces bez zdarzenia audytu", async () => {
    installKeyTable(removeKeyByOtherRequest);

    const result = await deleteApiKeyCommand({ id: KEY_ID });

    expect(result).toEqual({ success: true });
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("gdy wiersz o tym id należy w chwili zapisu do innej organizacji, nie usuwa go i nie zapisuje audytu", async () => {
    installKeyTable(moveKeyToOtherOrganization);

    await deleteApiKeyCommand({ id: KEY_ID });

    expect(storedKeys).toEqual([
      expect.objectContaining({ id: KEY_ID, organizationId: "org-2" }),
    ]);
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });
});
