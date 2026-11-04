// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = mockSend;
    },
  };
});
vi.mock("@/shared/lib/env", () => ({
  env: {
    STORAGE_PROVIDER: "s3",
    S3_ENDPOINT: "http://localhost:9100",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_BUCKET: "bucket",
    S3_FORCE_PATH_STYLE: true,
  },
}));

import { NoSuchKey } from "@aws-sdk/client-s3";
import { getObject } from "../storage";

function errorNamed(name: string): Error {
  const error = new Error("boom");
  error.name = name;
  return error;
}

beforeEach(() => {
  mockSend.mockReset();
});

describe("getObject", () => {
  it("zwraca null dla zwykłego Error o nazwie NoSuchKey, który nie jest instancją klasy SDK", async () => {
    mockSend.mockRejectedValue(errorNamed("NoSuchKey"));

    await expect(getObject("a/b.png")).resolves.toBeNull();
  });

  it("zwraca null dla instancji NoSuchKey z SDK", async () => {
    mockSend.mockRejectedValue(
      new NoSuchKey({ message: "gone", $metadata: {} }),
    );

    await expect(getObject("a/b.png")).resolves.toBeNull();
  });

  it("rzuca dalej Error o innej nazwie niż NoSuchKey", async () => {
    const other = errorNamed("AccessDenied");
    mockSend.mockRejectedValue(other);

    await expect(getObject("a/b.png")).rejects.toBe(other);
  });

  it("rzuca dalej Error o pustej nazwie", async () => {
    const other = errorNamed("");
    mockSend.mockRejectedValue(other);

    await expect(getObject("a/b.png")).rejects.toBe(other);
  });

  it("rzuca dalej wartość, która nie jest Error, nawet z polem name NoSuchKey", async () => {
    const notAnError = { name: "NoSuchKey" };
    mockSend.mockRejectedValue(notAnError);

    await expect(getObject("a/b.png")).rejects.toBe(notAnError);
  });

  it("zwraca pusty body i contentType odpowiedzi, a nie null, gdy odpowiedź S3 nie ma Body", async () => {
    mockSend.mockResolvedValue({ ContentType: "text/plain" });

    await expect(getObject("a/b.png")).resolves.toEqual({
      body: new Uint8Array(),
      contentType: "text/plain",
    });
  });
});
