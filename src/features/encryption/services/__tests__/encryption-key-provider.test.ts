// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const MASTER_KEY_HEX =
  "c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedf";
const DATA_KEY_HEX =
  "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f";
const WRAPPED_DATA_KEY =
  "sLGys7S1tre4ubq7jbEZyUzC1aC7j7GWwj7nUTTATzkNCQx58/IRB60ynITWDWDeBJI4o7i1vzRrPUFa";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    ENCRYPTION_PROVIDER: "local",
    ENCRYPTION_MASTER_KEY: "",
  },
}));

vi.mock("@/env", () => ({ env: mockEnv }));

async function loadFresh() {
  vi.resetModules();
  const service = await import("../encryption-key-provider");
  const cryptoPackage = await import("@gatojs/crypto");
  return { ...service, ...cryptoPackage };
}

beforeEach(() => {
  mockEnv.ENCRYPTION_MASTER_KEY = MASTER_KEY_HEX;
});

describe("encryptionKeyProvider", () => {
  it("is a LocalKeyProvider built from ENCRYPTION_MASTER_KEY", async () => {
    const { encryptionKeyProvider, LocalKeyProvider } = await loadFresh();

    const provider = encryptionKeyProvider();

    expect(provider).toBeInstanceOf(LocalKeyProvider);
    expect(
      (await provider.unwrapDataKey(WRAPPED_DATA_KEY)).toString("hex"),
    ).toBe(DATA_KEY_HEX);
  });

  it("reads the master key from the environment, not a fixed key", async () => {
    mockEnv.ENCRYPTION_MASTER_KEY = "11".repeat(32);
    const { encryptionKeyProvider } = await loadFresh();

    await expect(
      encryptionKeyProvider().unwrapDataKey(WRAPPED_DATA_KEY),
    ).rejects.toThrow();
  });

  it("returns the same instance on every call within a process", async () => {
    const { encryptionKeyProvider } = await loadFresh();

    expect(encryptionKeyProvider()).toBe(encryptionKeyProvider());
  });
});

describe("ensureEncryptionAvailable", () => {
  it("resolves for a working master key", async () => {
    const { ensureEncryptionAvailable } = await loadFresh();

    await expect(ensureEncryptionAvailable()).resolves.toBeUndefined();
  });

  it("probes the provider once per process", async () => {
    const { encryptionKeyProvider, ensureEncryptionAvailable } =
      await loadFresh();
    const provider = encryptionKeyProvider();
    const generate = vi.spyOn(provider, "generateDataKey");
    const unwrap = vi.spyOn(provider, "unwrapDataKey");

    await ensureEncryptionAvailable();
    await ensureEncryptionAvailable();
    await ensureEncryptionAvailable();

    expect(generate).toHaveBeenCalledTimes(1);
    expect(unwrap).toHaveBeenCalledTimes(1);
  });

  it("probes once even when called concurrently", async () => {
    const { encryptionKeyProvider, ensureEncryptionAvailable } =
      await loadFresh();
    const generate = vi.spyOn(encryptionKeyProvider(), "generateDataKey");

    await Promise.all([
      ensureEncryptionAvailable(),
      ensureEncryptionAvailable(),
    ]);

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("rejects with EncryptionUnavailableError when the key cannot be unwrapped to the same bytes", async () => {
    const {
      encryptionKeyProvider,
      ensureEncryptionAvailable,
      EncryptionUnavailableError,
    } = await loadFresh();
    vi.spyOn(encryptionKeyProvider(), "unwrapDataKey").mockResolvedValue(
      Buffer.alloc(32, 0xee),
    );

    const attempt = ensureEncryptionAvailable();

    await expect(attempt).rejects.toBeInstanceOf(EncryptionUnavailableError);
    await expect(attempt).rejects.toThrow(
      "Encryption is unavailable: the provider unwrapped a data key to different bytes than it wrapped",
    );
  });

  it("rejects on every call after a failed probe, without probing again", async () => {
    const {
      encryptionKeyProvider,
      ensureEncryptionAvailable,
      EncryptionUnavailableError,
    } = await loadFresh();
    const unwrap = vi
      .spyOn(encryptionKeyProvider(), "unwrapDataKey")
      .mockRejectedValue(new Error("access denied to decrypt"));

    await expect(ensureEncryptionAvailable()).rejects.toBeInstanceOf(
      EncryptionUnavailableError,
    );
    await expect(ensureEncryptionAvailable()).rejects.toThrow(
      "Encryption is unavailable: access denied to decrypt",
    );
    await expect(ensureEncryptionAvailable()).rejects.toBeInstanceOf(
      EncryptionUnavailableError,
    );
    expect(unwrap).toHaveBeenCalledTimes(1);
  });
});
