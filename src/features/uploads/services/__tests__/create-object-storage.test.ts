// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend, mockS3ClientConfig } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockS3ClientConfig: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = mockSend;
      constructor(config: unknown) {
        mockS3ClientConfig(config);
      }
    },
  };
});
// WHY: createObjectStorage must build storage from its argument; a process env that differs from every config exposes reading env instead.
vi.mock("@/env", () => ({
  env: {
    STORAGE_PROVIDER: "s3",
    S3_ENDPOINT: "http://env.invalid:9000",
    S3_REGION: "env-region",
    S3_ACCESS_KEY_ID: "env-key",
    S3_SECRET_ACCESS_KEY: "env-secret",
    S3_BUCKET: "env-bucket",
    S3_FORCE_PATH_STYLE: false,
  },
}));

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { S3StorageEnv } from "../../contracts/storage.types";
import { createS3Storage } from "../s3-storage";
import { createObjectStorage } from "../storage";
import { resolveStorageEnv } from "../storage-env";

const S3_CONFIG: S3StorageEnv = {
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "eu-central-1",
  S3_ACCESS_KEY_ID: "minio-key",
  S3_SECRET_ACCESS_KEY: "minio-secret",
  S3_BUCKET: "test-bucket",
  S3_FORCE_PATH_STYLE: true,
};

const bytes = (text: string) => new TextEncoder().encode(text);

function sentCommand() {
  return mockSend.mock.calls[0]?.[0];
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "wa-uploads-"));
  mockSend.mockReset();
  mockSend.mockResolvedValue({});
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("createObjectStorage: provider local", () => {
  it("local zapisuje plik pod STORAGE_LOCAL_PATH z konfiguracji", async () => {
    await createObjectStorage({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: dir,
    }).put("orgs/o1/test/a.txt", bytes("hi"), "text/plain");

    expect(await readFile(join(dir, "orgs/o1/test/a.txt"), "utf8")).toBe("hi");
  });

  it("każde wywołanie local używa własnego STORAGE_LOCAL_PATH", async () => {
    const first = createObjectStorage({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: join(dir, "pierwszy"),
    });
    const second = createObjectStorage({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: join(dir, "drugi"),
    });

    await first.put("orgs/o1/test/a.txt", bytes("A"), "text/plain");
    await second.put("orgs/o1/test/a.txt", bytes("B"), "text/plain");

    expect(
      await readFile(join(dir, "pierwszy/orgs/o1/test/a.txt"), "utf8"),
    ).toBe("A");
    expect(await readFile(join(dir, "drugi/orgs/o1/test/a.txt"), "utf8")).toBe(
      "B",
    );
  });
});

describe("createObjectStorage: provider s3", () => {
  it("s3 wysyła PutObjectCommand do bucketu S3_BUCKET pod podany klucz z bajtami i contentType", async () => {
    await createObjectStorage(S3_CONFIG).put(
      "orgs/o1/test/a.txt",
      bytes("hi"),
      "text/plain",
    );

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = sentCommand();
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "test-bucket",
      Key: "orgs/o1/test/a.txt",
      ContentType: "text/plain",
    });
    expect(Array.from(command.input.Body)).toEqual([104, 105]);
  });

  it.each([true, false])(
    "klient S3 dostaje endpoint, region i klucze z konfiguracji, forcePathStyle %s i sumy kontrolne tylko tam, gdzie wymaga ich API",
    async (forcePathStyle) => {
      await createObjectStorage({
        ...S3_CONFIG,
        S3_FORCE_PATH_STYLE: forcePathStyle,
      }).put("orgs/o1/test/a.txt", bytes("hi"), "text/plain");

      expect(mockS3ClientConfig).toHaveBeenCalledTimes(1);
      expect(mockS3ClientConfig.mock.calls[0]?.[0]).toMatchObject({
        endpoint: "http://localhost:9000",
        region: "eu-central-1",
        credentials: {
          accessKeyId: "minio-key",
          secretAccessKey: "minio-secret",
        },
        forcePathStyle,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
    },
  );

  it("s3 get wysyła GetObjectCommand do bucketu S3_BUCKET i zwraca bajty oraz contentType odpowiedzi", async () => {
    mockSend.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([104, 105]) },
      ContentType: "text/plain",
    });

    const stored =
      await createObjectStorage(S3_CONFIG).get("orgs/o1/test/a.txt");

    const command = sentCommand();
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "test-bucket",
      Key: "orgs/o1/test/a.txt",
    });
    expect(stored).not.toBeNull();
    expect(Array.from(stored!.body)).toEqual([104, 105]);
    expect(stored!.contentType).toBe("text/plain");
  });

  it("s3 delete wysyła DeleteObjectCommand do bucketu S3_BUCKET pod podany klucz", async () => {
    await expect(
      createObjectStorage(S3_CONFIG).delete("orgs/o1/test/a.txt"),
    ).resolves.toBeUndefined();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = sentCommand();
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "test-bucket",
      Key: "orgs/o1/test/a.txt",
    });
  });

  it("s3 przekazuje dalej błąd S3 przy zapisie i przy usuwaniu", async () => {
    const failure = new Error("AccessDenied");
    mockSend.mockRejectedValue(failure);
    const storage = createObjectStorage(S3_CONFIG);

    await expect(
      storage.put("orgs/o1/test/a.txt", bytes("hi"), "text/plain"),
    ).rejects.toBe(failure);
    await expect(storage.delete("orgs/o1/test/a.txt")).rejects.toBe(failure);
  });

  it("jedna instancja s3 używa jednego klienta dla kolejnych operacji", async () => {
    const storage = createObjectStorage(S3_CONFIG);

    await storage.put("orgs/o1/test/a.txt", bytes("hi"), "text/plain");
    await storage.delete("orgs/o1/test/a.txt");
    await storage.put("orgs/o1/test/b.txt", bytes("hi"), "text/plain");

    expect(mockS3ClientConfig).toHaveBeenCalledTimes(1);
  });

  it("dwie konfiguracje s3 dają dwa klienty i każda trafia do swojego bucketu", async () => {
    const first = createObjectStorage(S3_CONFIG);
    const second = createObjectStorage({
      ...S3_CONFIG,
      S3_ENDPOINT: "http://localhost:9100",
      S3_BUCKET: "inny-bucket",
    });

    await first.put("orgs/o1/test/a.txt", bytes("A"), "text/plain");
    await second.put("orgs/o1/test/a.txt", bytes("B"), "text/plain");

    expect(
      mockS3ClientConfig.mock.calls.map(([config]) => config.endpoint),
    ).toEqual(["http://localhost:9000", "http://localhost:9100"]);
    expect(
      mockSend.mock.calls.map(([command]) => command.input.Bucket),
    ).toEqual(["test-bucket", "inny-bucket"]);
  });
});

describe("createObjectStorage: wybór providera z konfiguracji", () => {
  it("magazyny s3 i local tworzone po sobie zachowują każdy swoją konfigurację", async () => {
    const s3 = createObjectStorage(S3_CONFIG);
    const local = createObjectStorage({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: dir,
    });

    await local.put("orgs/o1/test/a.txt", bytes("hi"), "text/plain");
    await s3.put("orgs/o1/test/b.txt", bytes("s3"), "text/plain");

    expect(await readFile(join(dir, "orgs/o1/test/a.txt"), "utf8")).toBe("hi");
    await expect(stat(join(dir, "orgs/o1/test/b.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(sentCommand().input).toMatchObject({
      Bucket: "test-bucket",
      Key: "orgs/o1/test/b.txt",
    });
  });
});

describe("S3 client credentials and S3_SESSION_TOKEN", () => {
  const S3_KEYS: S3StorageEnv = {
    STORAGE_PROVIDER: "s3",
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "k",
    S3_SECRET_ACCESS_KEY: "s",
    S3_BUCKET: "b",
    S3_FORCE_PATH_STYLE: false,
  };

  function clientCredentials() {
    expect(mockS3ClientConfig).toHaveBeenCalledTimes(1);
    return mockS3ClientConfig.mock.calls[0]?.[0].credentials;
  }

  it("createS3Storage with a session token gives the client the keys and the token", async () => {
    await createS3Storage({ ...S3_KEYS, S3_SESSION_TOKEN: "tok" }).put(
      "orgs/o1/test/a.txt",
      bytes("hi"),
      "text/plain",
    );

    expect(clientCredentials()).toStrictEqual({
      accessKeyId: "k",
      secretAccessKey: "s",
      sessionToken: "tok",
    });
  });

  it("createS3Storage without a session token gives the client exactly the two keys", async () => {
    await createS3Storage(S3_KEYS).put(
      "orgs/o1/test/a.txt",
      bytes("hi"),
      "text/plain",
    );

    const credentials = clientCredentials();
    expect(credentials).toStrictEqual({
      accessKeyId: "k",
      secretAccessKey: "s",
    });
    expect(Object.keys(credentials).sort()).toEqual([
      "accessKeyId",
      "secretAccessKey",
    ]);
  });

  it("createS3Storage with an empty session token does not pass it to the client", async () => {
    await createS3Storage({ ...S3_KEYS, S3_SESSION_TOKEN: "" }).put(
      "orgs/o1/test/a.txt",
      bytes("hi"),
      "text/plain",
    );

    expect(clientCredentials()).toStrictEqual({
      accessKeyId: "k",
      secretAccessKey: "s",
    });
  });

  it("createObjectStorage passes the session token from its config to the client", async () => {
    await createObjectStorage({
      ...S3_CONFIG,
      S3_SESSION_TOKEN: "config-token",
    }).put("orgs/o1/test/a.txt", bytes("hi"), "text/plain");

    expect(clientCredentials()).toStrictEqual({
      accessKeyId: "minio-key",
      secretAccessKey: "minio-secret",
      sessionToken: "config-token",
    });
  });

  it.each([
    ["a token of spaces", "   "],
    ["an empty token", ""],
  ])(
    "storage built from a resolved env with %s gives the client no session token",
    async (_case, token) => {
      const resolved = resolveStorageEnv(
        {
          STORAGE_PROVIDER: "s3",
          S3_ENDPOINT: "http://127.0.0.1:9000",
          S3_ACCESS_KEY_ID: "k",
          S3_SECRET_ACCESS_KEY: "s",
          S3_BUCKET: "b",
          S3_SESSION_TOKEN: token,
        },
        "/app",
      );
      if (!resolved.ok) {
        throw new Error(JSON.stringify(resolved.issues));
      }

      await createObjectStorage(resolved.env).put(
        "orgs/o1/test/a.txt",
        bytes("hi"),
        "text/plain",
      );

      expect(clientCredentials()).toStrictEqual({
        accessKeyId: "k",
        secretAccessKey: "s",
      });
    },
  );

  it("storage built from a resolved env with a session token gives the client that token", async () => {
    const resolved = resolveStorageEnv(
      {
        STORAGE_PROVIDER: "s3",
        S3_ENDPOINT: "http://127.0.0.1:9000",
        S3_ACCESS_KEY_ID: "k",
        S3_SECRET_ACCESS_KEY: "s",
        S3_BUCKET: "b",
        S3_SESSION_TOKEN: "tok",
      },
      "/app",
    );
    if (!resolved.ok) {
      throw new Error(JSON.stringify(resolved.issues));
    }

    await createObjectStorage(resolved.env).put(
      "orgs/o1/test/a.txt",
      bytes("hi"),
      "text/plain",
    );

    expect(clientCredentials()).toStrictEqual({
      accessKeyId: "k",
      secretAccessKey: "s",
      sessionToken: "tok",
    });
  });
});
