// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted((): Record<string, unknown> => ({}));

vi.mock("@/env", () => ({ env: mockEnv }));

import { InvalidStorageKeyError } from "../local-storage";
import { deleteObject, getObject, putObject } from "../storage";

const bytes = (text: string) => new TextEncoder().encode(text);

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "wa-uploads-"));
  Object.assign(mockEnv, {
    STORAGE_PROVIDER: "local",
    STORAGE_LOCAL_PATH: dir,
  });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("storage przy STORAGE_PROVIDER=local z env", () => {
  it("putObject zapisuje plik w katalogu STORAGE_LOCAL_PATH z env", async () => {
    await putObject("orgs/o1/test/a.txt", bytes("hi"), "text/plain");

    expect(await readFile(join(dir, "orgs/o1/test/a.txt"), "utf8")).toBe("hi");
  });

  it("getObject zwraca bajty zapisane przez putObject", async () => {
    await putObject("orgs/o1/test/a.txt", bytes("hi"), "text/plain");

    const stored = await getObject("orgs/o1/test/a.txt");

    expect(stored).not.toBeNull();
    expect(Array.from(stored!.body)).toEqual([104, 105]);
  });

  it("po deleteObject plik znika z katalogu, a getObject zwraca null", async () => {
    await putObject("orgs/o1/test/a.txt", bytes("hi"), "text/plain");

    await deleteObject("orgs/o1/test/a.txt");

    expect(await getObject("orgs/o1/test/a.txt")).toBeNull();
    await expect(stat(join(dir, "orgs/o1/test/a.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("magazyn powstaje raz na proces: zmiana env po pierwszym użyciu nie przenosi plików do innego katalogu", async () => {
    await putObject("orgs/o1/test/first.txt", bytes("1"), "text/plain");
    const moved = await mkdtemp(join(tmpdir(), "wa-uploads-"));
    mockEnv.STORAGE_LOCAL_PATH = moved;
    try {
      await putObject("orgs/o1/test/second.txt", bytes("2"), "text/plain");

      expect(await readFile(join(dir, "orgs/o1/test/second.txt"), "utf8")).toBe(
        "2",
      );
      expect(await readdir(moved)).toEqual([]);
      expect(
        Array.from((await getObject("orgs/o1/test/first.txt"))!.body),
      ).toEqual([49]);
    } finally {
      mockEnv.STORAGE_LOCAL_PATH = dir;
      await rm(moved, { recursive: true, force: true });
    }
  });

  it.each<[string, () => Promise<unknown>]>([
    ["putObject", () => putObject("../poza.txt", bytes("x"), "text/plain")],
    ["getObject", () => getObject("../poza.txt")],
    ["deleteObject", () => deleteObject("../poza.txt")],
  ])(
    "%s odrzuca obietnicę błędem magazynu local dla klucza spoza katalogu, zamiast go połknąć",
    async (_operation, call) => {
      await expect(call()).rejects.toBeInstanceOf(InvalidStorageKeyError);
    },
  );
});
