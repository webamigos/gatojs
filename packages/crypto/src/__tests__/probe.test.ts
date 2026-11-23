import { describe, expect, it } from "vitest";
import type { GeneratedDataKey, KeyProvider } from "../key-provider";
import { LocalKeyProvider } from "../local-key-provider";
import { probeEncryptionProvider } from "../probe";

const MASTER_KEY_HEX =
  "c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedf";
const DATA_KEY_HEX =
  "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f";
const OTHER_KEY_HEX = "ff".repeat(32);

interface ScriptedProvider extends KeyProvider {
  calls: { generate: number; unwrap: string[] };
}

function scriptedProvider(script: {
  generate: () => Promise<GeneratedDataKey>;
  unwrap: (wrappedKey: string) => Promise<Buffer>;
}): ScriptedProvider {
  const calls = { generate: 0, unwrap: [] as string[] };
  return {
    calls,
    generateDataKey() {
      calls.generate += 1;
      return script.generate();
    },
    unwrapDataKey(wrappedKey) {
      calls.unwrap.push(wrappedKey);
      return script.unwrap(wrappedKey);
    },
  };
}

function generating(hex: string): () => Promise<GeneratedDataKey> {
  return async () => ({
    wrappedKey: "wrapped-1",
    plaintextKey: Buffer.from(hex, "hex"),
  });
}

describe("probeEncryptionProvider", () => {
  it("passes a local provider with a valid master key", async () => {
    await expect(
      probeEncryptionProvider(new LocalKeyProvider(MASTER_KEY_HEX)),
    ).resolves.toEqual({ status: "ok" });
  });

  it("passes a provider that unwraps to equal bytes in a different buffer", async () => {
    const provider = scriptedProvider({
      generate: generating(DATA_KEY_HEX),
      unwrap: async () => Buffer.from(DATA_KEY_HEX, "hex"),
    });

    await expect(probeEncryptionProvider(provider)).resolves.toEqual({
      status: "ok",
    });
  });

  it("generates once and unwraps the wrapped key it got, once", async () => {
    const provider = scriptedProvider({
      generate: generating(DATA_KEY_HEX),
      unwrap: async () => Buffer.from(DATA_KEY_HEX, "hex"),
    });

    await probeEncryptionProvider(provider);

    expect(provider.calls).toEqual({ generate: 1, unwrap: ["wrapped-1"] });
  });

  it("reports a provider that unwraps to different bytes", async () => {
    const provider = scriptedProvider({
      generate: generating(DATA_KEY_HEX),
      unwrap: async () => Buffer.from(OTHER_KEY_HEX, "hex"),
    });

    await expect(probeEncryptionProvider(provider)).resolves.toEqual({
      status: "misconfigured",
      detail:
        "the provider unwrapped a data key to different bytes than it wrapped",
    });
  });

  it("reports a provider that unwraps to a prefix of the key", async () => {
    const provider = scriptedProvider({
      generate: generating(DATA_KEY_HEX),
      unwrap: async () => Buffer.from(DATA_KEY_HEX.slice(0, 62), "hex"),
    });

    await expect(probeEncryptionProvider(provider)).resolves.toEqual({
      status: "misconfigured",
      detail:
        "the provider unwrapped a data key to different bytes than it wrapped",
    });
  });

  it("reports a provider that generates a 16-byte data key, even when it unwraps it back", async () => {
    const sixteen = "ab".repeat(16);
    const provider = scriptedProvider({
      generate: generating(sixteen),
      unwrap: async () => Buffer.from(sixteen, "hex"),
    });

    await expect(probeEncryptionProvider(provider)).resolves.toEqual({
      status: "misconfigured",
      detail: "the provider generated a 16-byte data key, expected 32 bytes",
    });
  });

  it("names the actual length of a 33-byte data key", async () => {
    const thirtyThree = "ab".repeat(33);
    const provider = scriptedProvider({
      generate: generating(thirtyThree),
      unwrap: async () => Buffer.from(thirtyThree, "hex"),
    });

    await expect(probeEncryptionProvider(provider)).resolves.toEqual({
      status: "misconfigured",
      detail: "the provider generated a 33-byte data key, expected 32 bytes",
    });
  });

  it("reports a failing generate with the error message and does not unwrap", async () => {
    const provider = scriptedProvider({
      generate: async () => {
        throw new Error("access denied to generate");
      },
      unwrap: async () => Buffer.from(DATA_KEY_HEX, "hex"),
    });

    await expect(probeEncryptionProvider(provider)).resolves.toEqual({
      status: "misconfigured",
      detail: "access denied to generate",
    });
    expect(provider.calls.unwrap).toEqual([]);
  });

  it("reports a failing unwrap with the error message", async () => {
    const provider = scriptedProvider({
      generate: generating(DATA_KEY_HEX),
      unwrap: async () => {
        throw new Error("access denied to decrypt");
      },
    });

    await expect(probeEncryptionProvider(provider)).resolves.toEqual({
      status: "misconfigured",
      detail: "access denied to decrypt",
    });
  });

  it("reports a non-Error throw as its string form", async () => {
    const provider = scriptedProvider({
      generate: generating(DATA_KEY_HEX),
      unwrap: () => Promise.reject(42),
    });

    await expect(probeEncryptionProvider(provider)).resolves.toEqual({
      status: "misconfigured",
      detail: "42",
    });
  });

  it("does not reject when generate throws synchronously", async () => {
    const provider: KeyProvider = {
      generateDataKey() {
        throw new Error("thrown before any promise");
      },
      async unwrapDataKey() {
        return Buffer.from(DATA_KEY_HEX, "hex");
      },
    };

    await expect(probeEncryptionProvider(provider)).resolves.toEqual({
      status: "misconfigured",
      detail: "thrown before any promise",
    });
  });

  it("reports a local provider whose wrapped keys another master key cannot unwrap", async () => {
    const writer = new LocalKeyProvider(MASTER_KEY_HEX);
    const reader = new LocalKeyProvider(OTHER_KEY_HEX);
    const provider: KeyProvider = {
      generateDataKey: () => writer.generateDataKey(),
      unwrapDataKey: (wrappedKey) => reader.unwrapDataKey(wrappedKey),
    };

    const result = await probeEncryptionProvider(provider);

    expect(result.status).toBe("misconfigured");
  });
});
