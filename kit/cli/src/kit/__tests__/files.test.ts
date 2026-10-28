import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import {
  makeKitRepo,
  makeTempDir,
  removeTempDirs,
} from "../../__tests__/helpers.js";
import {
  assemblableFiles,
  globToRegExp,
  listKitFiles,
  matchFiles,
} from "../files.js";
import { readKitConfig } from "../kit-config.js";

afterEach(removeTempDirs);

describe("globToRegExp", () => {
  it("[locale] i (app) są literałami, a ** wymaga ukośnika po katalogu", () => {
    const re = globToRegExp("src/app/[locale]/(app)/users/**");
    expect(re.test("src/app/[locale]/(app)/users/page.tsx")).toBe(true);
    expect(re.test("src/app/[locale]/(app)/users/a/b.tsx")).toBe(true);
    expect(re.test("src/app/l/(app)/users/page.tsx")).toBe(false);
    expect(re.test("src/app/[locale]/(app)/users")).toBe(false);
    expect(re.test("xsrc/app/[locale]/(app)/users/page.tsx")).toBe(false);
  });

  it("** obejmuje zero segmentów i wiele segmentów, ale nie sklejone nazwy", () => {
    const re = globToRegExp("src/**/x.ts");
    expect(re.test("src/x.ts")).toBe(true);
    expect(re.test("src/a/b/x.ts")).toBe(true);
    expect(re.test("src/ax.ts")).toBe(false);
  });

  it("* obejmuje znaki poza ukośnikiem", () => {
    const re = globToRegExp("src/*");
    expect(re.test("src/a.ts")).toBe(true);
    expect(re.test("src/a/b.ts")).toBe(false);
  });

  it("* w środku nazwy nie przechodzi przez ukośnik", () => {
    const re = globToRegExp("src/*.ts");
    expect(re.test("src/a.ts")).toBe(true);
    expect(re.test("src/a/b.ts")).toBe(false);
  });

  it("kropka jest literałem", () => {
    expect(globToRegExp("a.b").test("aXb")).toBe(false);
    expect(globToRegExp("a.b").test("a.b")).toBe(true);
  });

  it("plus jest literałem i glob pasuje tylko do siebie", () => {
    const re = globToRegExp("src/a+b.ts");
    expect(re.test("src/a+b.ts")).toBe(true);
    expect(re.test("src/aab.ts")).toBe(false);
    expect(re.test("src/ab.ts")).toBe(false);
  });

  it("nawiasy okrągłe i kwadratowe są literałami", () => {
    expect(globToRegExp("(app)").test("app")).toBe(false);
    expect(globToRegExp("(app)").test("(app)")).toBe(true);
    expect(globToRegExp("[ab]").test("a")).toBe(false);
    expect(globToRegExp("[ab]").test("[ab]")).toBe(true);
  });

  it("jest zakotwiczony na początku i na końcu", () => {
    const re = globToRegExp("src/a.ts");
    expect(re.test("xsrc/a.ts")).toBe(false);
    expect(re.test("src/a.tsx")).toBe(false);
    expect(re.test("src/a.ts")).toBe(true);
  });

  test.prop([
    fc.string({ minLength: 1 }).filter((text) => !text.includes("*")),
    fc.string({ minLength: 1, maxLength: 1 }),
  ])(
    "glob bez * pasuje dokładnie do samego siebie i do niczego z dodanym znakiem",
    (glob, extra) => {
      const re = globToRegExp(glob);
      expect(re.test(glob)).toBe(true);
      expect(re.test(glob + extra)).toBe(false);
      expect(re.test(extra + glob)).toBe(false);
    },
  );

  test.prop([
    fc.stringMatching(/^[a-z0-9.]{1,10}$/),
    fc.stringMatching(/^[a-z0-9.]{1,10}$/),
  ])(
    "dir/* pasuje do jednego segmentu i nie do zagnieżdżonej ścieżki",
    (segment, nested) => {
      const re = globToRegExp("dir/*");
      expect(re.test(`dir/${segment}`)).toBe(true);
      expect(re.test(`dir/${segment}/${nested}`)).toBe(false);
    },
  );

  test.prop([fc.array(fc.stringMatching(/^[a-z0-9]{1,6}$/), { maxLength: 4 })])(
    "dir/**/x.ts pasuje przy dowolnej liczbie segmentów pośrednich",
    (segments) => {
      const path = ["dir", ...segments, "x.ts"].join("/");
      expect(globToRegExp("dir/**/x.ts").test(path)).toBe(true);
    },
  );
});

describe("matchFiles", () => {
  it("zwraca pliki pasujące do któregokolwiek globu, bez duplikatów, posortowane", () => {
    expect(
      matchFiles(["src/**", "src/a.ts"], ["b.ts", "src/b.ts", "src/a.ts"]),
    ).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("brak pasujących plików daje pustą listę", () => {
    expect(matchFiles(["x/**"], ["a.ts"])).toEqual([]);
  });

  it("sortuje po kodach znaków, wielkie litery przed małymi", () => {
    expect(matchFiles(["*"], ["b.ts", "B.ts", "a.ts"])).toEqual([
      "B.ts",
      "a.ts",
      "b.ts",
    ]);
  });
});

describe("listKitFiles", () => {
  it("zwraca śledzone pliki posortowane", async () => {
    const dir = await makeKitRepo("ownership-broken");
    expect(await listKitFiles(dir)).toEqual([
      "docs/readme.md",
      "kit/kit.json",
      "kit/modules/core.json",
      "kit/modules/demo.json",
      "orphan.ts",
      "other/compose.yml",
      "package.json",
      "src/modules.generated.ts",
      "src/shared/x.ts",
    ]);
  });

  it("plik nieśledzony nie trafia na listę", async () => {
    const dir = await makeKitRepo("ownership-broken");
    await writeFile(join(dir, "untracked.ts"), "export {};\n");
    expect(await listKitFiles(dir)).not.toContain("untracked.ts");
  });

  it("katalog bez .git zgłasza, że nie jest repozytorium git", async () => {
    const dir = await makeTempDir();
    await expect(listKitFiles(dir)).rejects.toThrow(
      new Error(`${dir} nie jest repozytorium git`),
    );
  });
});

describe("assemblableFiles", () => {
  it("pomija pliki kitOnly i generatedFiles", async () => {
    const dir = await makeKitRepo("ownership-broken");
    const config = await readKitConfig(dir);
    expect(await assemblableFiles(dir, config)).toEqual([
      "orphan.ts",
      "other/compose.yml",
      "package.json",
      "src/shared/x.ts",
    ]);
  });

  it("pomija docs/readme.md z kitOnly", async () => {
    const dir = await makeKitRepo("ownership-broken");
    const config = await readKitConfig(dir);
    expect(await assemblableFiles(dir, config)).not.toContain("docs/readme.md");
  });

  it("pomija src/modules.generated.ts z generatedFiles", async () => {
    const dir = await makeKitRepo("ownership-broken");
    const config = await readKitConfig(dir);
    expect(await assemblableFiles(dir, config)).not.toContain(
      "src/modules.generated.ts",
    );
  });
});
