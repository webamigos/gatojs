// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const MASTER_KEY_HEX =
  "c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedf";
const DATA_KEY_HEX =
  "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f";
const WRAPPED_DATA_KEY =
  "sLGys7S1tre4ubq7jbEZyUzC1aC7j7GWwj7nUTTATzkNCQx58/IRB60ynITWDWDeBJI4o7i1vzRrPUFa";
const ORG_A = "org-a";
const ORG_B = "org-b";

interface StoredDataKey {
  id: string;
  organizationId: string;
  wrappedKey: string;
  createdAt: Date;
}

interface UpsertArgs {
  where: Record<string, unknown>;
  create: { organizationId: string; wrappedKey: string };
  update: Record<string, unknown>;
}

const { mockEnv, store } = vi.hoisted(() => ({
  mockEnv: {
    ENCRYPTION_PROVIDER: "local",
    ENCRYPTION_MASTER_KEY: "",
  },
  store: {
    rows: new Map<string, StoredDataKey>(),
    findUniqueCalls: [] as Array<Record<string, unknown>>,
    upsertCalls: [] as UpsertArgs[],
    hiddenFromNextFindUnique: new Set<string>(),
    failFindUnique: null as Error | null,
    failUpsert: null as {
      error: Error;
      rowStoredByAnotherWriter: StoredDataKey | null;
    } | null,
    findUniqueCallsBeforeUpsert: null as number | null,
  },
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/prisma", () => ({
  prisma: {
    organizationDataKey: {
      findUnique: async (args: { where: Record<string, unknown> }) => {
        store.findUniqueCalls.push(args.where);
        if (store.failFindUnique) {
          throw store.failFindUnique;
        }
        const organizationId = args.where.organizationId;
        if (typeof organizationId !== "string") {
          return null;
        }
        if (store.hiddenFromNextFindUnique.delete(organizationId)) {
          return null;
        }
        return store.rows.get(organizationId) ?? null;
      },
      upsert: async (args: UpsertArgs) => {
        store.upsertCalls.push(args);
        store.findUniqueCallsBeforeUpsert = store.findUniqueCalls.length;
        if (store.failUpsert) {
          const { error, rowStoredByAnotherWriter } = store.failUpsert;
          if (rowStoredByAnotherWriter) {
            store.rows.set(
              rowStoredByAnotherWriter.organizationId,
              rowStoredByAnotherWriter,
            );
          }
          throw error;
        }
        const organizationId = args.where.organizationId;
        if (typeof organizationId !== "string") {
          throw new Error("upsert without an organizationId filter");
        }
        const existing = store.rows.get(organizationId);
        if (existing) {
          return existing;
        }
        const row: StoredDataKey = {
          id: `row-${store.rows.size + 1}`,
          organizationId: args.create.organizationId,
          wrappedKey: args.create.wrappedKey,
          createdAt: new Date("2026-11-23T10:00:00.000Z"),
        };
        store.rows.set(organizationId, row);
        return row;
      },
    },
  },
}));

async function loadFresh() {
  vi.resetModules();
  const service = await import("../organization-encryption");
  const keyProvider = await import("../encryption-key-provider");
  const cryptoPackage = await import("@gatojs/crypto");
  return { ...service, ...keyProvider, ...cryptoPackage };
}

function seedFixedKey(organizationId: string): void {
  store.rows.set(organizationId, {
    id: `seeded-${organizationId}`,
    organizationId,
    wrappedKey: WRAPPED_DATA_KEY,
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
  });
}

function rowWithFixedKey(organizationId: string): StoredDataKey {
  return {
    id: `other-writer-${organizationId}`,
    organizationId,
    wrappedKey: WRAPPED_DATA_KEY,
    createdAt: new Date("2026-11-25T09:00:00.000Z"),
  };
}

function knownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`organization_id`)",
    { code, clientVersion: "7.4.2" },
  );
}

function findUniqueCallsAfterUpsert(): Array<Record<string, unknown>> {
  if (store.findUniqueCallsBeforeUpsert === null) {
    throw new Error("upsert was not called");
  }
  return store.findUniqueCalls.slice(store.findUniqueCallsBeforeUpsert);
}

function fixedDataKey(): Buffer {
  return Buffer.from(DATA_KEY_HEX, "hex");
}

beforeEach(() => {
  mockEnv.ENCRYPTION_MASTER_KEY = MASTER_KEY_HEX;
  store.rows.clear();
  store.findUniqueCalls.length = 0;
  store.upsertCalls.length = 0;
  store.hiddenFromNextFindUnique.clear();
  store.failFindUnique = null;
  store.failUpsert = null;
  store.findUniqueCallsBeforeUpsert = null;
});

describe("encryptForOrganization", () => {
  it("round-trips through decryptForOrganization for the same organization", async () => {
    const { encryptForOrganization, decryptForOrganization } =
      await loadFresh();

    const ciphertext = await encryptForOrganization(ORG_A, "x");

    expect(Buffer.from(ciphertext, "base64").length).toBe(12 + 1 + 16);
    await expect(decryptForOrganization(ORG_A, ciphertext)).resolves.toBe("x");
  });

  it("does not leak the plaintext bytes into the payload", async () => {
    const { encryptForOrganization } = await loadFresh();
    const plaintext = "plaintext-marker-0123456789";

    const ciphertext = await encryptForOrganization(ORG_A, plaintext);

    const payload = Buffer.from(ciphertext, "base64");
    expect(payload.length).toBe(12 + 27 + 16);
    expect(payload.includes(Buffer.from(plaintext, "utf8"))).toBe(false);
  });

  it("encrypts with the data key stored for the organization", async () => {
    seedFixedKey(ORG_A);
    const { encryptForOrganization, decryptContent } = await loadFresh();

    const ciphertext = await encryptForOrganization(ORG_A, "stored key");

    expect(decryptContent(ciphertext, fixedDataKey())).toBe("stored key");
    expect(store.upsertCalls).toEqual([]);
  });

  it("decrypts content written with the stored data key", async () => {
    seedFixedKey(ORG_A);
    const { decryptForOrganization, encryptContent } = await loadFresh();

    const ciphertext = encryptContent("written elsewhere", fixedDataKey());

    await expect(decryptForOrganization(ORG_A, ciphertext)).resolves.toBe(
      "written elsewhere",
    );
  });

  it("produces different ciphertexts for the same plaintext", async () => {
    const { encryptForOrganization } = await loadFresh();

    const first = await encryptForOrganization(ORG_A, "same");
    const second = await encryptForOrganization(ORG_A, "same");

    expect(first).not.toBe(second);
  });

  it("creates the organization's data key on first use, wrapped under the master key", async () => {
    const { encryptForOrganization, decryptContent, LocalKeyProvider } =
      await loadFresh();

    const ciphertext = await encryptForOrganization(ORG_A, "first");

    expect(store.upsertCalls).toHaveLength(1);
    const row = store.rows.get(ORG_A);
    expect(row?.organizationId).toBe(ORG_A);
    expect(Buffer.from(row?.wrappedKey ?? "", "base64").length).toBe(60);
    const dataKey = await new LocalKeyProvider(MASTER_KEY_HEX).unwrapDataKey(
      row?.wrappedKey ?? "",
    );
    expect(decryptContent(ciphertext, dataKey)).toBe("first");
  });

  it("reuses the stored data key on the second encryption", async () => {
    const { encryptForOrganization, decryptForOrganization } =
      await loadFresh();

    const first = await encryptForOrganization(ORG_A, "one");
    const wrappedAfterFirst = store.rows.get(ORG_A)?.wrappedKey;
    const second = await encryptForOrganization(ORG_A, "two");

    expect(store.rows.size).toBe(1);
    expect(store.upsertCalls).toHaveLength(1);
    expect(store.rows.get(ORG_A)?.wrappedKey).toBe(wrappedAfterFirst);
    await expect(decryptForOrganization(ORG_A, first)).resolves.toBe("one");
    await expect(decryptForOrganization(ORG_A, second)).resolves.toBe("two");
  });

  it("uses the row a concurrent writer stored first, not the key it generated itself", async () => {
    seedFixedKey(ORG_A);
    store.hiddenFromNextFindUnique.add(ORG_A);
    const { encryptForOrganization, decryptContent } = await loadFresh();

    const ciphertext = await encryptForOrganization(ORG_A, "race");

    expect(store.upsertCalls).toHaveLength(1);
    expect(store.rows.get(ORG_A)?.wrappedKey).toBe(WRAPPED_DATA_KEY);
    expect(decryptContent(ciphertext, fixedDataKey())).toBe("race");
  });

  it("upserts without overwriting an existing row", async () => {
    const { encryptForOrganization } = await loadFresh();

    await encryptForOrganization(ORG_A, "x");

    expect(store.upsertCalls[0]?.update).toEqual({});
    expect(store.upsertCalls[0]?.where).toEqual({ organizationId: ORG_A });
    expect(store.upsertCalls[0]?.create.organizationId).toBe(ORG_A);
  });

  it("gives every organization its own data key", async () => {
    const { encryptForOrganization, LocalKeyProvider } = await loadFresh();

    await encryptForOrganization(ORG_A, "a");
    await encryptForOrganization(ORG_B, "b");

    const provider = new LocalKeyProvider(MASTER_KEY_HEX);
    const keyA = await provider.unwrapDataKey(
      store.rows.get(ORG_A)?.wrappedKey ?? "",
    );
    const keyB = await provider.unwrapDataKey(
      store.rows.get(ORG_B)?.wrappedKey ?? "",
    );
    expect(store.rows.size).toBe(2);
    expect(store.rows.get(ORG_B)?.organizationId).toBe(ORG_B);
    expect(keyA.equals(keyB)).toBe(false);
  });

  it("does not encrypt another organization's content with an earlier organization's key", async () => {
    seedFixedKey(ORG_A);
    const { encryptForOrganization, decryptContent } = await loadFresh();

    await encryptForOrganization(ORG_A, "a");
    const ciphertextB = await encryptForOrganization(ORG_B, "b");

    expect(() => decryptContent(ciphertextB, fixedDataKey())).toThrow();
  });

  it("filters every data key query by exactly the given organization", async () => {
    const { encryptForOrganization, decryptForOrganization } =
      await loadFresh();

    const ciphertext = await encryptForOrganization(ORG_A, "x");
    await decryptForOrganization(ORG_A, ciphertext);

    expect(store.findUniqueCalls.length).toBeGreaterThan(0);
    for (const where of store.findUniqueCalls) {
      expect(where).toEqual({ organizationId: ORG_A });
    }
    for (const call of store.upsertCalls) {
      expect(call.where).toEqual({ organizationId: ORG_A });
    }
  });

  it("propagates a database failure", async () => {
    store.failFindUnique = new Error("database is down");
    const { encryptForOrganization } = await loadFresh();

    await expect(encryptForOrganization(ORG_A, "x")).rejects.toThrow(
      "database is down",
    );
    expect(store.rows.size).toBe(0);
  });

  it("refuses to encrypt when the key provider is misconfigured, before touching the database", async () => {
    const {
      encryptForOrganization,
      encryptionKeyProvider,
      EncryptionUnavailableError,
    } = await loadFresh();
    vi.spyOn(encryptionKeyProvider(), "unwrapDataKey").mockResolvedValue(
      Buffer.alloc(32, 0xee),
    );

    await expect(encryptForOrganization(ORG_A, "x")).rejects.toBeInstanceOf(
      EncryptionUnavailableError,
    );
    expect(store.findUniqueCalls).toEqual([]);
    expect(store.upsertCalls).toEqual([]);
  });
});

describe("encryptForOrganization when the first write races another writer", () => {
  it("uses the row another writer stored when the upsert hits the unique constraint", async () => {
    store.failUpsert = {
      error: knownRequestError("P2002"),
      rowStoredByAnotherWriter: rowWithFixedKey(ORG_A),
    };
    const { encryptForOrganization, decryptContent } = await loadFresh();

    const ciphertext = await encryptForOrganization(ORG_A, "lost the race");

    expect(decryptContent(ciphertext, fixedDataKey())).toBe("lost the race");
    expect(store.upsertCalls).toHaveLength(1);
    expect(store.rows.size).toBe(1);
    expect(store.rows.get(ORG_A)?.wrappedKey).toBe(WRAPPED_DATA_KEY);
    expect(findUniqueCallsAfterUpsert()).toEqual([{ organizationId: ORG_A }]);
  });

  it("re-reads only the given organization's row after the unique constraint error", async () => {
    store.rows.set(ORG_B, {
      id: "row-of-b",
      organizationId: ORG_B,
      wrappedKey: Buffer.alloc(60, 7).toString("base64"),
      createdAt: new Date("2026-11-20T00:00:00.000Z"),
    });
    store.failUpsert = {
      error: knownRequestError("P2002"),
      rowStoredByAnotherWriter: rowWithFixedKey(ORG_A),
    };
    const { encryptForOrganization, decryptContent } = await loadFresh();

    const ciphertext = await encryptForOrganization(ORG_A, "own row");

    expect(decryptContent(ciphertext, fixedDataKey())).toBe("own row");
    expect(store.rows.size).toBe(2);
    expect(findUniqueCallsAfterUpsert()).toEqual([{ organizationId: ORG_A }]);
  });

  it("rethrows the same unique constraint error when the re-read finds no row", async () => {
    const error = knownRequestError("P2002");
    store.failUpsert = { error, rowStoredByAnotherWriter: null };
    const { encryptForOrganization } = await loadFresh();

    await expect(encryptForOrganization(ORG_A, "x")).rejects.toBe(error);
    expect(store.rows.size).toBe(0);
    expect(findUniqueCallsAfterUpsert()).toEqual([{ organizationId: ORG_A }]);
  });

  it("propagates a known database error with another code without re-reading", async () => {
    const error = knownRequestError("P2003");
    store.failUpsert = {
      error,
      rowStoredByAnotherWriter: rowWithFixedKey(ORG_A),
    };
    const { encryptForOrganization } = await loadFresh();

    await expect(encryptForOrganization(ORG_A, "x")).rejects.toBe(error);
    expect(findUniqueCallsAfterUpsert()).toEqual([]);
  });

  it("propagates a plain error from the upsert without re-reading", async () => {
    const error = new Error("connection reset");
    store.failUpsert = {
      error,
      rowStoredByAnotherWriter: rowWithFixedKey(ORG_A),
    };
    const { encryptForOrganization } = await loadFresh();

    await expect(encryptForOrganization(ORG_A, "x")).rejects.toBe(error);
    expect(findUniqueCallsAfterUpsert()).toEqual([]);
  });
});

describe("decryptForOrganization", () => {
  it("fails for another organization's ciphertext", async () => {
    const { encryptForOrganization, decryptForOrganization } =
      await loadFresh();

    const ciphertextA = await encryptForOrganization(ORG_A, "secret of A");
    await encryptForOrganization(ORG_B, "anything");

    await expect(decryptForOrganization(ORG_B, ciphertextA)).rejects.toThrow();
  });

  it("throws OrganizationDataKeyMissingError naming the organization and creates nothing", async () => {
    seedFixedKey(ORG_A);
    const {
      decryptForOrganization,
      encryptContent,
      OrganizationDataKeyMissingError,
    } = await loadFresh();
    const ciphertext = encryptContent("x", fixedDataKey());

    const attempt = decryptForOrganization(ORG_B, ciphertext);

    await expect(attempt).rejects.toBeInstanceOf(
      OrganizationDataKeyMissingError,
    );
    await expect(attempt).rejects.toThrow(ORG_B);
    expect(store.upsertCalls).toEqual([]);
    expect(store.rows.has(ORG_B)).toBe(false);
    expect(store.findUniqueCalls).toEqual([{ organizationId: ORG_B }]);
  });

  it("names the error class as a string", async () => {
    const { decryptForOrganization } = await loadFresh();

    await expect(decryptForOrganization(ORG_A, "AAAA")).rejects.toMatchObject({
      name: "OrganizationDataKeyMissingError",
    });
  });

  it("rejects tampered content", async () => {
    seedFixedKey(ORG_A);
    const { decryptForOrganization, encryptContent } = await loadFresh();
    const packed = Buffer.from(
      encryptContent("hello", fixedDataKey()),
      "base64",
    );
    packed[14] ^= 0xff;

    await expect(
      decryptForOrganization(ORG_A, packed.toString("base64")),
    ).rejects.toThrow();
  });

  it("refuses to decrypt when the key provider is misconfigured, before touching the database", async () => {
    seedFixedKey(ORG_A);
    const {
      decryptForOrganization,
      encryptContent,
      encryptionKeyProvider,
      EncryptionUnavailableError,
    } = await loadFresh();
    vi.spyOn(encryptionKeyProvider(), "generateDataKey").mockRejectedValue(
      new Error("access denied to generate"),
    );

    await expect(
      decryptForOrganization(ORG_A, encryptContent("x", fixedDataKey())),
    ).rejects.toBeInstanceOf(EncryptionUnavailableError);
    expect(store.findUniqueCalls).toEqual([]);
  });
});
