import { describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  S3_ENDPOINT: process.env.INTEGRATION_S3_ENDPOINT ?? "http://localhost:9000",
  S3_REGION: "auto",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_BUCKET: "",
  S3_FORCE_PATH_STYLE: true,
}));

vi.mock("@/shared/lib/env", async () => {
  const { project } = await import("@/shared/config/project");
  mockEnv.S3_BUCKET =
    process.env.INTEGRATION_S3_BUCKET ?? `${project.slug}-uploads`;
  return { env: mockEnv };
});

import { deleteObject, getObject, putObject } from "../storage";

const bytes = (text: string) => new TextEncoder().encode(text);
const unique = () => `orgs/o1/test/${crypto.randomUUID()}.txt`;

describe("storage S3 (MinIO)", () => {
  it("zwraca zapisane bajty i contentType po putObject", async () => {
    const key = unique();
    await putObject(key, bytes("hello"), "text/plain");

    const stored = await getObject(key);

    expect(stored).not.toBeNull();
    expect(Array.from(stored!.body)).toEqual([104, 101, 108, 108, 111]);
    expect(stored!.contentType).toBe("text/plain");
  });

  it("zachowuje bajty binarne bez zmian", async () => {
    const key = unique();
    await putObject(
      key,
      new Uint8Array([0, 255, 1, 254, 128]),
      "application/octet-stream",
    );

    const stored = await getObject(key);

    expect(Array.from(stored!.body)).toEqual([0, 255, 1, 254, 128]);
    expect(stored!.contentType).toBe("application/octet-stream");
  });

  it("zapisuje pusty obiekt", async () => {
    const key = unique();
    await putObject(key, new Uint8Array(), "text/plain");

    const stored = await getObject(key);

    expect(stored).not.toBeNull();
    expect(stored!.body.length).toBe(0);
  });

  it("nadpisuje obiekt pod tym samym kluczem", async () => {
    const key = unique();
    await putObject(key, bytes("one"), "text/plain");
    await putObject(key, bytes("two!"), "text/csv");

    const stored = await getObject(key);

    expect(Array.from(stored!.body)).toEqual([116, 119, 111, 33]);
    expect(stored!.contentType).toBe("text/csv");
  });

  it("zwraca null dla nieistniejącego klucza", async () => {
    expect(await getObject(`brak-${crypto.randomUUID()}`)).toBeNull();
  });

  it("zwraca null dla nieistniejącego klucza zagnieżdżonego", async () => {
    expect(
      await getObject(`orgs/o1/test/${crypto.randomUUID()}/brak.txt`),
    ).toBeNull();
  });

  it("po deleteObject getObject zwraca null", async () => {
    const key = unique();
    await putObject(key, bytes("hello"), "text/plain");

    await deleteObject(key);

    expect(await getObject(key)).toBeNull();
  });

  it("deleteObject nieistniejącego klucza nie rzuca", async () => {
    await expect(
      deleteObject(`brak-${crypto.randomUUID()}`),
    ).resolves.toBeUndefined();
  });

  it("podwójne deleteObject nie rzuca", async () => {
    const key = unique();
    await putObject(key, bytes("x"), "text/plain");
    await deleteObject(key);

    await expect(deleteObject(key)).resolves.toBeUndefined();
  });

  it("deleteObject usuwa tylko wskazany klucz", async () => {
    const keep = unique();
    const drop = unique();
    await putObject(keep, bytes("keep"), "text/plain");
    await putObject(drop, bytes("drop"), "text/plain");

    await deleteObject(drop);

    expect(Array.from((await getObject(keep))!.body)).toEqual([
      107, 101, 101, 112,
    ]);
    expect(await getObject(drop)).toBeNull();
  });

  it("klucze różnych organizacji nie nakładają się", async () => {
    const suffix = `${crypto.randomUUID()}.txt`;
    await putObject(`orgs/o1/test/${suffix}`, bytes("A"), "text/plain");
    await putObject(`orgs/o2/test/${suffix}`, bytes("B"), "text/plain");

    expect(
      Array.from((await getObject(`orgs/o1/test/${suffix}`))!.body),
    ).toEqual([65]);
    expect(
      Array.from((await getObject(`orgs/o2/test/${suffix}`))!.body),
    ).toEqual([66]);
  });

  it("odrzuca obietnicę przy błędzie innym niż NoSuchKey", async () => {
    const original = mockEnv.S3_BUCKET;
    mockEnv.S3_BUCKET = "no-such-bucket-wa-kit";
    try {
      await expect(getObject("orgs/o1/test/a.txt")).rejects.toThrow();
    } finally {
      mockEnv.S3_BUCKET = original;
    }
  });
});
