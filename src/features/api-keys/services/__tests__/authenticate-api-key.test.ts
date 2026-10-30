import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUnique, mockUpdate, mockEnv, mockLogger, mockKnownScopes } =
  vi.hoisted(() => ({
    mockFindUnique: vi.fn(),
    mockUpdate: vi.fn(),
    mockEnv: { API_KEY_PEPPER: "p".repeat(32) },
    mockLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    mockKnownScopes: vi.fn(),
  }));

vi.mock("@/shared/lib/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/shared/lib/prisma", () => ({
  prisma: { apiKey: { findUnique: mockFindUnique, update: mockUpdate } },
}));
vi.mock("../api-scopes", () => ({ knownApiScopes: mockKnownScopes }));

import { authenticateApiKey } from "../authenticate-api-key";

const KEY = "wa_app_live_abc123";
const KEY_HASH =
  "f35e193f3a92e62ddc767713c067f2a64766db65da1b577ecf5f07f9e9d9754a";
const NOW = new Date("2026-10-29T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const YESTERDAY = new Date(NOW.getTime() - DAY_MS);
const TOMORROW = new Date(NOW.getTime() + DAY_MS);

interface StoredKey {
  id: string;
  organizationId: string;
  scopes: string[];
  revokedAt: Date | null;
  expiresAt: Date | null;
}

function storedKey(overrides: Partial<StoredKey> = {}): StoredKey {
  return {
    id: "key-1",
    organizationId: "org-a",
    scopes: ["organization:read"],
    revokedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

function seed(record: StoredKey): void {
  mockFindUnique.mockImplementation(
    async (args: { where: { hashedKey: string } }) =>
      args.where.hashedKey === KEY_HASH ? record : null,
  );
}

function requestWith(
  authorization: string | null,
  extra: Record<string, string> = {},
  url = "http://localhost/api/v1/organization",
): Request {
  const values: Record<string, string> = { ...extra };
  if (authorization !== null) {
    values.authorization = authorization;
  }
  return {
    url,
    headers: { get: (name: string) => values[name.toLowerCase()] ?? null },
  } as unknown as Request;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue({});
  mockKnownScopes.mockReset();
  mockKnownScopes.mockReturnValue(["organization:read", "audit:read"]);
  Object.values(mockLogger).forEach((fn) => fn.mockReset());
  seed(storedKey());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("authenticateApiKey: nagłówek", () => {
  it("bez nagłówka Authorization zwraca 401 missing i nie pyta bazy", async () => {
    await expect(
      authenticateApiKey(requestWith(null), "organization:read"),
    ).resolves.toEqual({ ok: false, status: 401, error: "missing" });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("schemat Basic zwraca 401 missing", async () => {
    await expect(
      authenticateApiKey(requestWith(`Basic ${KEY}`), "organization:read"),
    ).resolves.toEqual({ ok: false, status: 401, error: "missing" });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it.each(["Bearer ", "Bearer", "Bearer    "])(
    "pusty token (%j) zwraca 401 missing",
    async (header) => {
      await expect(
        authenticateApiKey(requestWith(header), "organization:read"),
      ).resolves.toEqual({ ok: false, status: 401, error: "missing" });
      expect(mockFindUnique).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["bearer małymi literami", `bearer ${KEY}`, "missing"],
    ["sam klucz bez schematu", KEY, "missing"],
    ["wiodąca spacja przed schematem", ` Bearer ${KEY}`, "missing"],
    ["tabulator zamiast spacji", `Bearer\t${KEY}`, "missing"],
    ["dwie spacje przed kluczem", `Bearer  ${KEY}`, "invalid"],
    ["klucz z dopisaną spacją", `Bearer ${KEY} `, "invalid"],
    ["klucz w cudzysłowie", `Bearer "${KEY}"`, "invalid"],
  ])(
    "nieprawidłowa forma nagłówka (%s) daje 401 %s bez wyjątku",
    async (_label, header, error) => {
      await expect(
        authenticateApiKey(requestWith(header), "organization:read"),
      ).resolves.toEqual({ ok: false, status: 401, error });
    },
  );
});

describe("authenticateApiKey: klucz", () => {
  it("klucz z inną wielkością liter zwraca 401 invalid", async () => {
    await expect(
      authenticateApiKey(
        requestWith("Bearer WA_APP_LIVE_ABC123"),
        "organization:read",
      ),
    ).resolves.toEqual({ ok: false, status: 401, error: "invalid" });
  });

  it("klucz z dopisaną spacją w środku nagłówka zwraca 401 invalid", async () => {
    await expect(
      authenticateApiKey(requestWith(`Bearer ${KEY} x`), "organization:read"),
    ).resolves.toEqual({ ok: false, status: 401, error: "invalid" });
  });

  it("nieznany klucz zwraca 401 invalid i nie aktualizuje lastUsedAt", async () => {
    await expect(
      authenticateApiKey(
        requestWith("Bearer wa_app_live_unknown"),
        "organization:read",
      ),
    ).resolves.toEqual({ ok: false, status: 401, error: "invalid" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("szuka rekordu przez findUnique po hashedKey z HMAC-em klucza i pieprzu", async () => {
    await authenticateApiKey(requestWith(`Bearer ${KEY}`), "organization:read");
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    expect(mockFindUnique.mock.calls[0][0].where).toEqual({
      hashedKey: KEY_HASH,
    });
  });
});

describe("authenticateApiKey: stan klucza", () => {
  it("odwołany klucz zwraca 401 revoked", async () => {
    seed(storedKey({ revokedAt: YESTERDAY }));
    await expect(
      authenticateApiKey(requestWith(`Bearer ${KEY}`), "organization:read"),
    ).resolves.toEqual({ ok: false, status: 401, error: "revoked" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("klucz z expiresAt w przeszłości zwraca 401 expired", async () => {
    seed(storedKey({ expiresAt: YESTERDAY }));
    await expect(
      authenticateApiKey(requestWith(`Bearer ${KEY}`), "organization:read"),
    ).resolves.toEqual({ ok: false, status: 401, error: "expired" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("klucz z expiresAt równym bieżącej chwili zwraca 401 expired", async () => {
    seed(storedKey({ expiresAt: NOW }));
    await expect(
      authenticateApiKey(requestWith(`Bearer ${KEY}`), "organization:read"),
    ).resolves.toEqual({ ok: false, status: 401, error: "expired" });
  });

  it("klucz z expiresAt w przyszłości jest przyjęty", async () => {
    seed(storedKey({ expiresAt: TOMORROW }));
    const result = await authenticateApiKey(
      requestWith(`Bearer ${KEY}`),
      "organization:read",
    );
    expect(result.ok).toBe(true);
  });

  it("klucz bez expiresAt jest przyjęty", async () => {
    const result = await authenticateApiKey(
      requestWith(`Bearer ${KEY}`),
      "organization:read",
    );
    expect(result.ok).toBe(true);
  });
});

describe("authenticateApiKey: scope", () => {
  it("klucz bez wymaganego scope'u zwraca 403 scope", async () => {
    seed(storedKey({ scopes: ["audit:read"] }));
    await expect(
      authenticateApiKey(requestWith(`Bearer ${KEY}`), "organization:read"),
    ).resolves.toEqual({ ok: false, status: 403, error: "scope" });
  });

  it("klucz z pustą listą scope'ów zwraca 403 scope", async () => {
    seed(storedKey({ scopes: [] }));
    await expect(
      authenticateApiKey(requestWith(`Bearer ${KEY}`), "organization:read"),
    ).resolves.toEqual({ ok: false, status: 403, error: "scope" });
  });

  it("scope zapisany w bazie, ale nieznany modułom, nie daje dostępu", async () => {
    seed(storedKey({ scopes: ["organization:read"] }));
    mockKnownScopes.mockReturnValue(["audit:read"]);
    await expect(
      authenticateApiKey(requestWith(`Bearer ${KEY}`), "organization:read"),
    ).resolves.toEqual({ ok: false, status: 403, error: "scope" });
  });

  it("pomija w context.scopes scope nieobecny w knownApiScopes", async () => {
    seed(storedKey({ scopes: ["organization:read", "legacy:gone"] }));
    await expect(
      authenticateApiKey(requestWith(`Bearer ${KEY}`), "organization:read"),
    ).resolves.toEqual({
      ok: true,
      context: {
        organizationId: "org-a",
        apiKeyId: "key-1",
        scopes: ["organization:read"],
      },
    });
  });
});

describe("authenticateApiKey: kontekst i lastUsedAt", () => {
  it("organizationId pochodzi z rekordu, nie z nagłówka ani zapytania", async () => {
    const result = await authenticateApiKey(
      requestWith(
        `Bearer ${KEY}`,
        { "x-organization-id": "org-b", "organization-id": "org-b" },
        "http://localhost/api/v1/organization?organizationId=org-b",
      ),
      "organization:read",
    );
    expect(result).toEqual({
      ok: true,
      context: {
        organizationId: "org-a",
        apiKeyId: "key-1",
        scopes: ["organization:read"],
      },
    });
  });

  it("poprawny klucz aktualizuje lastUsedAt tego rekordu na bieżący czas", async () => {
    await authenticateApiKey(requestWith(`Bearer ${KEY}`), "organization:read");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0].where).toEqual({ id: "key-1" });
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ lastUsedAt: NOW });
  });

  it("nie czeka na zapis lastUsedAt przed odpowiedzią", async () => {
    mockUpdate.mockReturnValue(new Promise(() => undefined));
    const result = await Promise.race([
      authenticateApiKey(requestWith(`Bearer ${KEY}`), "organization:read"),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 50),
      ),
    ]);
    expect(result).not.toBe("timeout");
    expect(result).toMatchObject({ ok: true });
  });

  it("błąd zapisu lastUsedAt jest tylko logowany, a uwierzytelnienie się udaje", async () => {
    vi.useRealTimers();
    mockUpdate.mockRejectedValue(new Error("write failed"));
    const result = await authenticateApiKey(
      requestWith(`Bearer ${KEY}`),
      "organization:read",
    );
    expect(result).toMatchObject({ ok: true });
    await vi.waitFor(() => {
      const logged =
        mockLogger.warn.mock.calls.length + mockLogger.error.mock.calls.length;
      expect(logged).toBe(1);
    });
  });
});
