// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fc, test } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { locales } from "@/i18n/locales.generated";
import {
  checkI18nKeys,
  findMissingKeys,
} from "../../../scripts/lib/architecture/i18n-keys";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("findMissingKeys", () => {
  it("zgłasza klucz brakujący w drugim locale", () => {
    expect(
      findMissingKeys({ pl: { a: { b: "x" }, c: "y" }, en: { a: { b: "x" } } }),
    ).toEqual([{ locale: "en", key: "c" }]);
  });

  it("zgłasza klucz brakujący w pierwszym locale (porównanie w obie strony)", () => {
    expect(
      findMissingKeys({ pl: { a: { b: "x" } }, en: { a: { b: "x" }, c: "y" } }),
    ).toEqual([{ locale: "pl", key: "c" }]);
  });

  it("różny kształt to naruszenie w obie strony", () => {
    expect(findMissingKeys({ pl: { a: "x" }, en: { a: { b: "y" } } })).toEqual([
      { locale: "pl", key: "a.b" },
      { locale: "en", key: "a" },
    ]);
  });

  it("porównuje pełne ścieżki liści, nie tylko klucze najwyższego poziomu", () => {
    expect(
      findMissingKeys({
        pl: { form: { title: "x", submit: "y" } },
        en: { form: { title: "x" } },
      }),
    ).toEqual([{ locale: "en", key: "form.submit" }]);
  });

  it("schodzi wiele poziomów w głąb", () => {
    expect(
      findMissingKeys({ pl: { a: { b: { c: "x" } } }, en: { a: { b: {} } } }),
    ).toEqual([{ locale: "en", key: "a.b.c" }]);
  });

  it("ten sam zbiór kluczy nie ma naruszeń", () => {
    expect(
      findMissingKeys({
        pl: { a: { b: "x" }, c: "y" },
        en: { c: "z", a: { b: "w" } },
      }),
    ).toEqual([]);
  });

  it("tablica i null to liście", () => {
    expect(
      findMissingKeys({ pl: { a: ["x"], b: null }, en: { a: "x", b: "y" } }),
    ).toEqual([]);
  });

  it("sortuje wynik: locale w kolejności wejścia, klucze rosnąco", () => {
    expect(findMissingKeys({ en: { b: "1", a: "1" }, pl: { c: "1" } })).toEqual(
      [
        { locale: "en", key: "c" },
        { locale: "pl", key: "a" },
        { locale: "pl", key: "b" },
      ],
    );
  });

  test.prop([fc.object()])(
    "ten sam obiekt w każdym locale nie ma naruszeń",
    (messages) => {
      expect(findMissingKeys({ pl: messages, en: messages })).toEqual([]);
    },
  );

  it("zbiór odniesienia to suma kluczy wszystkich locale", () => {
    expect(
      findMissingKeys({ pl: { a: "1" }, en: { b: "1" }, de: { c: "1" } }),
    ).toEqual([
      { locale: "pl", key: "b" },
      { locale: "pl", key: "c" },
      { locale: "en", key: "a" },
      { locale: "en", key: "c" },
      { locale: "de", key: "a" },
      { locale: "de", key: "b" },
    ]);
  });
});

describe("checkI18nKeys", () => {
  let root: string;

  const writeJson = (relative: string, value: unknown) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
    writeJson("src/app/messages/pl.json", { common: { save: "Zapisz" } });
    writeJson("src/app/messages/en.json", { common: { save: "Save" } });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("zgodne pliki wspólne i modułów przechodzą, moduł bez i18n jest pomijany", () => {
    writeJson("src/features/x/i18n/pl.json", { a: { b: "x" } });
    writeJson("src/features/x/i18n/en.json", { a: { b: "y" } });
    fs.mkdirSync(path.join(root, "src/features/no-i18n"), { recursive: true });
    expect(checkI18nKeys(root, ["pl", "en"])).toEqual([]);
  });

  it("zgłasza brakujący klucz w pliku modułu", () => {
    writeJson("src/features/x/i18n/pl.json", { a: "x", c: "y" });
    writeJson("src/features/x/i18n/en.json", { a: "x" });
    expect(checkI18nKeys(root, ["pl", "en"])).toEqual([
      "src/features/x/i18n/en.json: c",
    ]);
  });

  it("zgłasza brakujący zagnieżdżony klucz w plikach wspólnych", () => {
    writeJson("src/app/messages/pl.json", { common: { save: "Zapisz" } });
    writeJson("src/app/messages/en.json", { common: {} });
    expect(checkI18nKeys(root, ["pl", "en"])).toEqual([
      "src/app/messages/en.json: common.save",
    ]);
  });

  it("zgłasza brak pliku dla locale", () => {
    writeJson("src/features/x/i18n/pl.json", { a: "x" });
    expect(checkI18nKeys(root, ["pl", "en"])).toEqual([
      "src/features/x/i18n/en.json: file missing",
    ]);
  });

  it("sortuje wynik z wielu modułów po ścieżce pliku", () => {
    writeJson("src/features/b/i18n/pl.json", { x: "1" });
    writeJson("src/features/b/i18n/en.json", {});
    writeJson("src/features/a/i18n/pl.json", { x: "1" });
    writeJson("src/features/a/i18n/en.json", {});
    expect(checkI18nKeys(root, ["pl", "en"])).toEqual([
      "src/features/a/i18n/en.json: x",
      "src/features/b/i18n/en.json: x",
    ]);
  });

  it("sprawdza każde locale z listy", () => {
    writeJson("src/features/x/i18n/pl.json", { a: "x" });
    writeJson("src/features/x/i18n/en.json", { a: "x" });
    expect([...checkI18nKeys(root, ["pl", "en", "de"])].sort()).toEqual([
      "src/app/messages/de.json: file missing",
      "src/features/x/i18n/de.json: file missing",
    ]);
  });
});

describe("tłumaczenia w repo", () => {
  it("mają ten sam zbiór kluczy w każdym locale", () => {
    expect(checkI18nKeys(repoRoot, locales)).toEqual([]);
  });
});
