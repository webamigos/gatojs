// @vitest-environment node
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import type { ObjectStorage } from "../../contracts/storage.types";
import {
  createLocalStorage,
  InvalidStorageKeyError,
  resolveObjectPath,
} from "../local-storage";

const bytes = (text: string) => new TextEncoder().encode(text);
const runsAsRoot = process.getuid?.() === 0;

const plainSegment = fc
  .oneof(
    fc.string({ minLength: 1, maxLength: 12 }),
    fc.string({ unit: "grapheme", minLength: 1, maxLength: 6 }),
    fc.string({
      unit: fc.constantFrom(".", "a", "ł", " ", "-"),
      minLength: 1,
      maxLength: 5,
    }),
  )
  .filter(
    (segment) =>
      segment !== "." &&
      segment !== ".." &&
      !["/", "\\", "\0"].some((forbidden) => segment.includes(forbidden)),
  );

const anyKey = fc.oneof(
  fc.string(),
  fc.string({ unit: "binary" }),
  fc.string({
    unit: fc.constantFrom(".", "..", "/", "\\", "\0", "a", "~", " "),
    maxLength: 12,
  }),
);

function resolveOutcome(
  directory: string,
  key: string,
): { path: string } | { error: unknown } {
  try {
    return { path: resolveObjectPath(directory, key) };
  } catch (error) {
    return { error };
  }
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "wa-uploads-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resolveObjectPath", () => {
  it("zamienia klucz na ścieżkę pliku pod katalogiem magazynu", () => {
    expect(resolveObjectPath(root, "orgs/o1/editor-image/u.jpg")).toBe(
      path.join(root, "orgs/o1/editor-image/u.jpg"),
    );
  });

  it("pomija segment . w kluczu", () => {
    expect(resolveObjectPath(root, "./a.txt")).toBe(path.join(root, "a.txt"));
  });

  it("przyjmuje segment, który zaczyna się od dwóch kropek, ale nie jest ..", () => {
    expect(resolveObjectPath(root, "..foo/a..b.txt")).toBe(
      path.join(root, "..foo/a..b.txt"),
    );
  });

  it("przyjmuje pusty segment z podwójnego ukośnika, bo nie wychodzi on z katalogu", () => {
    expect(resolveObjectPath(root, "orgs//a.txt")).toBe(
      path.join(root, "orgs/a.txt"),
    );
  });

  it("ukośnik na końcu katalogu magazynu nie zmienia wyniku", () => {
    expect(resolveObjectPath(`${root}/`, "a.txt")).toBe(
      path.join(root, "a.txt"),
    );
    expect(() => resolveObjectPath(`${root}/`, ".")).toThrow(
      InvalidStorageKeyError,
    );
  });

  it("przy katalogu względnym zwraca ścieżkę bezwzględną od katalogu roboczego procesu", () => {
    expect(resolveObjectPath("volumes/uploads", "a.txt")).toBe(
      path.join(process.cwd(), "volumes/uploads/a.txt"),
    );
  });

  it.each([
    ["pusty klucz", ""],
    ["klucz . wskazujący sam katalog magazynu", "."],
    ["klucz absolutny", "/etc/passwd"],
    ["klucz wychodzący z katalogu przez ..", "../x"],
    [
      "klucz wychodzący z katalogu przez .. po zwykłym segmencie",
      "orgs/../../x",
    ],
    ["klucz z segmentem .., nawet gdy wraca do katalogu magazynu", "a/../b"],
    ["klucz z segmentem .. między ukośnikami odwrotnymi", "orgs\\..\\x"],
    ["klucz ze znakiem NUL", "a\u0000b"],
  ])(
    "odrzuca %s błędem InvalidStorageKeyError o stałym komunikacie bez klucza",
    (_description, key) => {
      expect(() => resolveObjectPath(root, key)).toThrow(
        InvalidStorageKeyError,
      );
      expect(() => resolveObjectPath(root, key)).toThrow(
        /^Nieprawidłowy klucz obiektu$/,
      );
    },
  );

  it("odrzuca klucz absolutny, nawet gdy wskazuje plik w katalogu magazynu", () => {
    expect(() => resolveObjectPath(root, path.join(root, "x"))).toThrow(
      InvalidStorageKeyError,
    );
  });

  test.prop([
    fc.array(plainSegment, { maxLength: 3 }),
    fc.array(plainSegment, { maxLength: 3 }),
    fc.constantFrom("/", "\\"),
  ])(
    "klucz z segmentem .. w dowolnym miejscu jest odrzucany przy obu rodzajach ukośnika",
    (before, after, separator) => {
      const key = [...before, "..", ...after].join(separator);

      expect(() => resolveObjectPath(root, key)).toThrow(
        InvalidStorageKeyError,
      );
    },
  );

  test.prop([fc.array(plainSegment, { minLength: 1, maxLength: 5 })])(
    "klucz ze zwykłych segmentów wskazuje plik katalog/klucz",
    (segments) => {
      const key = segments.join("/");

      expect(resolveObjectPath(root, key)).toBe(`${root}/${key}`);
    },
  );

  test.prop([anyKey])(
    "dowolny klucz daje InvalidStorageKeyError albo ścieżkę wewnątrz katalogu magazynu różną od niego",
    (key) => {
      const outcome = resolveOutcome(root, key);

      if ("error" in outcome) {
        expect(outcome.error).toBeInstanceOf(InvalidStorageKeyError);
        return;
      }
      expect(outcome.path.startsWith(`${root}${path.sep}`)).toBe(true);
      expect(path.normalize(outcome.path)).toBe(outcome.path);
    },
  );
});

describe("createLocalStorage", () => {
  let storage: ObjectStorage;

  beforeEach(() => {
    storage = createLocalStorage(root);
  });

  it("put zapisuje bajty w pliku katalog/klucz i tworzy brakujące katalogi", async () => {
    await storage.put("orgs/o1/test/a.txt", bytes("hello"), "text/plain");

    expect(await readFile(path.join(root, "orgs/o1/test/a.txt"), "utf8")).toBe(
      "hello",
    );
  });

  it("put tworzy także brakujący katalog magazynu", async () => {
    const missingRoot = path.join(root, "nowy", "magazyn");

    await createLocalStorage(missingRoot).put(
      "a.txt",
      bytes("hello"),
      "text/plain",
    );

    expect(await readFile(path.join(missingRoot, "a.txt"), "utf8")).toBe(
      "hello",
    );
  });

  it("get zwraca zapisane bajty, a contentType nie pochodzi z zapisu", async () => {
    await storage.put("orgs/o1/test/a.txt", bytes("hello"), "text/plain");

    const stored = await storage.get("orgs/o1/test/a.txt");

    expect(stored).not.toBeNull();
    expect(stored!.body).toBeInstanceOf(Uint8Array);
    expect(Array.from(stored!.body)).toEqual([104, 101, 108, 108, 111]);
    expect(stored!.contentType).toBeUndefined();
  });

  it("zachowuje bajty binarne bez zmian", async () => {
    await storage.put(
      "orgs/o1/test/binary",
      new Uint8Array([0, 255, 1, 254, 128]),
      "application/octet-stream",
    );

    const stored = await storage.get("orgs/o1/test/binary");

    expect(Array.from(stored!.body)).toEqual([0, 255, 1, 254, 128]);
  });

  it("pusty obiekt wraca jako obiekt z pustym body, a nie null", async () => {
    await storage.put("orgs/o1/test/empty.txt", new Uint8Array(), "text/plain");

    const stored = await storage.get("orgs/o1/test/empty.txt");

    expect(stored).not.toBeNull();
    expect(stored!.body.length).toBe(0);
  });

  it("nadpisuje obiekt pod tym samym kluczem", async () => {
    await storage.put("orgs/o1/test/a.txt", bytes("one"), "text/plain");
    await storage.put("orgs/o1/test/a.txt", bytes("two!"), "text/csv");

    const stored = await storage.get("orgs/o1/test/a.txt");

    expect(Array.from(stored!.body)).toEqual([116, 119, 111, 33]);
  });

  it("krótszy zapis po dłuższym nie zostawia końcówki poprzedniej treści", async () => {
    await storage.put("orgs/o1/test/a.txt", bytes("hello"), "text/plain");
    await storage.put("orgs/o1/test/a.txt", bytes("hi"), "text/plain");

    const stored = await storage.get("orgs/o1/test/a.txt");

    expect(Array.from(stored!.body)).toEqual([104, 105]);
  });

  it("get zwraca null dla nieistniejącego klucza", async () => {
    expect(await storage.get("brak.txt")).toBeNull();
  });

  it("get zwraca null dla nieistniejącego klucza zagnieżdżonego", async () => {
    expect(
      await storage.get(`orgs/o1/test/${crypto.randomUUID()}/brak.txt`),
    ).toBeNull();
  });

  it("get zwraca null dla klucza wskazującego katalog z zapisanym obiektem", async () => {
    await storage.put("orgs/a.txt", bytes("a"), "text/plain");

    expect(await storage.get("orgs")).toBeNull();
  });

  it("get zwraca null dla klucza, który przechodzi przez zapisany plik", async () => {
    await storage.put("a.txt", bytes("a"), "text/plain");

    expect(await storage.get("a.txt/b")).toBeNull();
  });

  it.skipIf(runsAsRoot)(
    "get pliku bez prawa odczytu odrzuca błąd systemu plików zamiast zwrócić null",
    async () => {
      await storage.put("orgs/o1/test/locked.txt", bytes("x"), "text/plain");
      const lockedPath = path.join(root, "orgs/o1/test/locked.txt");
      await chmod(lockedPath, 0o000);

      try {
        await expect(
          storage.get("orgs/o1/test/locked.txt"),
        ).rejects.toMatchObject({ code: "EACCES" });
      } finally {
        await chmod(lockedPath, 0o600);
      }
    },
  );

  it("get odrzuca błąd systemu plików inny niż brak obiektu także bez zmiany praw (pętla dowiązań)", async () => {
    await symlink("loop.txt", path.join(root, "loop.txt"));

    await expect(storage.get("loop.txt")).rejects.toMatchObject({
      code: "ELOOP",
    });
  });

  it("delete usuwa zapisany obiekt", async () => {
    await storage.put("orgs/o1/test/a.txt", bytes("hello"), "text/plain");

    await storage.delete("orgs/o1/test/a.txt");

    expect(await storage.get("orgs/o1/test/a.txt")).toBeNull();
    await expect(
      stat(path.join(root, "orgs/o1/test/a.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("delete nieistniejącego klucza kończy się bez błędu", async () => {
    await expect(storage.delete("brak.txt")).resolves.toBeUndefined();
  });

  it("podwójne delete tego samego klucza kończy się bez błędu", async () => {
    await storage.put("orgs/o1/test/a.txt", bytes("x"), "text/plain");
    await storage.delete("orgs/o1/test/a.txt");

    await expect(storage.delete("orgs/o1/test/a.txt")).resolves.toBeUndefined();
  });

  it("delete usuwa tylko wskazany klucz", async () => {
    await storage.put("orgs/o1/test/keep.txt", bytes("keep"), "text/plain");
    await storage.put("orgs/o1/test/drop.txt", bytes("drop"), "text/plain");

    await storage.delete("orgs/o1/test/drop.txt");

    expect(
      Array.from((await storage.get("orgs/o1/test/keep.txt"))!.body),
    ).toEqual([107, 101, 101, 112]);
    expect(await storage.get("orgs/o1/test/drop.txt")).toBeNull();
  });

  it("delete klucza wskazującego katalog nie usuwa obiektów w tym katalogu", async () => {
    await storage.put("orgs/o1/a.txt", bytes("a"), "text/plain");

    await Promise.allSettled([storage.delete("orgs")]);

    expect(await readFile(path.join(root, "orgs/o1/a.txt"), "utf8")).toBe("a");
  });

  it.skipIf(runsAsRoot)(
    "delete w katalogu bez prawa zapisu odrzuca błąd systemu plików",
    async () => {
      await storage.put("orgs/o1/test/a.txt", bytes("x"), "text/plain");
      const directory = path.join(root, "orgs/o1/test");
      await chmod(directory, 0o500);

      try {
        await expect(
          storage.delete("orgs/o1/test/a.txt"),
        ).rejects.toMatchObject({ code: "EACCES" });
      } finally {
        await chmod(directory, 0o700);
      }
    },
  );

  it("klucze różnych organizacji nie nakładają się", async () => {
    const suffix = `${crypto.randomUUID()}.txt`;
    await storage.put(`orgs/o1/test/${suffix}`, bytes("A"), "text/plain");
    await storage.put(`orgs/o2/test/${suffix}`, bytes("B"), "text/plain");

    expect(
      Array.from((await storage.get(`orgs/o1/test/${suffix}`))!.body),
    ).toEqual([65]);
    expect(
      Array.from((await storage.get(`orgs/o2/test/${suffix}`))!.body),
    ).toEqual([66]);
  });

  it("put pod ścieżką przechodzącą przez zapisany plik odrzuca błąd systemu plików i zostawia ten plik", async () => {
    await storage.put("a.txt", bytes("a"), "text/plain");

    const attempt = storage.put("a.txt/b", bytes("b"), "text/plain");

    await expect(attempt).rejects.toMatchObject({
      code: expect.stringMatching(/^(EEXIST|ENOTDIR)$/),
    });
    await expect(attempt).rejects.not.toBeInstanceOf(InvalidStorageKeyError);
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("a");
  });

  it("put pod kluczem wskazującym katalog odrzuca błąd systemu plików i zostawia obiekty w tym katalogu", async () => {
    await storage.put("orgs/a.txt", bytes("a"), "text/plain");

    await expect(
      storage.put("orgs", bytes("b"), "text/plain"),
    ).rejects.toMatchObject({ code: "EISDIR" });
    expect(await readFile(path.join(root, "orgs/a.txt"), "utf8")).toBe("a");
  });

  it("put z segmentem .. w kluczu odrzuca InvalidStorageKeyError i nic nie zapisuje", async () => {
    await expect(
      storage.put("a/../b.txt", bytes("x"), "text/plain"),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(stat(path.join(root, "b.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("get z segmentem .. w kluczu odrzuca InvalidStorageKeyError zamiast czytać plik, na który klucz wskazuje", async () => {
    await writeFile(path.join(root, "b.txt"), "b");

    await expect(storage.get("a/../b.txt")).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
  });

  it("delete z segmentem .. w kluczu odrzuca InvalidStorageKeyError i nie usuwa pliku, na który klucz wskazuje", async () => {
    await writeFile(path.join(root, "b.txt"), "b");

    await expect(storage.delete("a/../b.txt")).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
    expect(await readFile(path.join(root, "b.txt"), "utf8")).toBe("b");
  });
});

describe("createLocalStorage: klucz wychodzący poza katalog magazynu", () => {
  let storageRoot: string;
  let storage: ObjectStorage;

  beforeEach(async () => {
    storageRoot = path.join(root, "magazyn");
    storage = createLocalStorage(storageRoot);
    await writeFile(path.join(path.dirname(storageRoot), "x"), "obok");
  });

  it("put odrzuca InvalidStorageKeyError o stałym komunikacie i nie tworzy pliku obok katalogu magazynu", async () => {
    const attempt = storage.put("../escape.txt", bytes("x"), "text/plain");

    await expect(attempt).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(attempt).rejects.toThrow(/^Nieprawidłowy klucz obiektu$/);
    await expect(
      stat(path.join(path.dirname(storageRoot), "escape.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("get odrzuca InvalidStorageKeyError zamiast czytać plik obok katalogu magazynu", async () => {
    await expect(storage.get("../x")).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
  });

  it("delete odrzuca InvalidStorageKeyError i nie usuwa pliku obok katalogu magazynu", async () => {
    await expect(storage.delete("../x")).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
    expect(
      await readFile(path.join(path.dirname(storageRoot), "x"), "utf8"),
    ).toBe("obok");
  });
});
