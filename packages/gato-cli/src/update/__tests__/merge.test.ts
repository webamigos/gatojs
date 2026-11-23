import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fc, test } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REGION_FILES } from "../../generate/targets.js";
import { mergeFile } from "../merge.js";

const labels = { ours: "project", base: "v0.1.0", theirs: "v0.2.0" };
const originalPath = process.env.PATH;

afterEach(() => {
  process.env.PATH = originalPath;
});

function merge(path: string, base: string, ours: string, theirs: string) {
  return mergeFile({
    path,
    base: Buffer.from(base),
    ours: Buffer.from(ours),
    theirs: Buffer.from(theirs),
    labels,
  });
}

function textOf(result: Awaited<ReturnType<typeof mergeFile>>) {
  if ("binary" in result) {
    throw new Error("oczekiwano wyniku tekstowego");
  }
  return {
    content: result.content.toString("utf8"),
    conflicts: result.conflicts,
  };
}

async function mergeDirs() {
  return (await readdir(tmpdir())).filter((name) =>
    name.startsWith("wa-merge-"),
  );
}

const base10 = "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10\n";

describe("mergeFile", () => {
  it("łączy zmianę projektu w linii 2 ze zmianą kitu w linii 10 bez konfliktów", async () => {
    const result = textOf(
      await merge(
        "src/a.ts",
        base10,
        "l1\nPROJEKT\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10\n",
        "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nKIT\n",
      ),
    );
    expect(result).toEqual({
      content: "l1\nPROJEKT\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nKIT\n",
      conflicts: 0,
    });
  });

  it("zgłasza jeden konflikt w formacie diff3 z etykietami projektu, bazy i kitu", async () => {
    const result = textOf(
      await merge("src/a.ts", "a\nb\nc\n", "a\nprojekt\nc\n", "a\nkit\nc\n"),
    );
    expect(result).toEqual({
      content:
        "a\n<<<<<<< project\nprojekt\n||||||| v0.1.0\nb\n=======\nkit\n>>>>>>> v0.2.0\nc\n",
      conflicts: 1,
    });
  });

  it("liczy dwie niezależne kolizje jako dwa konflikty", async () => {
    const result = textOf(
      await merge(
        "src/a.ts",
        base10,
        "l1\nP2\nl3\nl4\nl5\nl6\nl7\nl8\nP9\nl10\n",
        "l1\nK2\nl3\nl4\nl5\nl6\nl7\nl8\nK9\nl10\n",
      ),
    );
    expect(result).toEqual({
      content:
        "l1\n<<<<<<< project\nP2\n||||||| v0.1.0\nl2\n=======\nK2\n>>>>>>> v0.2.0\nl3\nl4\nl5\nl6\nl7\nl8\n" +
        "<<<<<<< project\nP9\n||||||| v0.1.0\nl9\n=======\nK9\n>>>>>>> v0.2.0\nl10\n",
      conflicts: 2,
    });
  });

  it("w pliku z regionami pomija treść regionu i scala zmianę kitu poza nim", async () => {
    expect(REGION_FILES).toContain(".env.example");
    const result = textOf(
      await merge(
        ".env.example",
        "A=1\n# wa:modules:start\nBASE=0\n# wa:modules:end\n",
        "A=1\n# wa:modules:start\nPROJEKT=1\n# wa:modules:end\n",
        "A=1\n# wa:modules:start\nKIT=2\n# wa:modules:end\nB=2\n",
      ),
    );
    expect(result).toEqual({
      content: "A=1\n# wa:modules:start\n# wa:modules:end\nB=2\n",
      conflicts: 0,
    });
  });

  it("nie usuwa regionów z pliku spoza listy plików z regionami", async () => {
    const result = textOf(
      await merge(
        "notes.txt",
        "A=1\n# wa:modules:start\nX=0\n# wa:modules:end\n",
        "A=1\n# wa:modules:start\nX=0\n# wa:modules:end\n",
        "A=1\n# wa:modules:start\nX=0\n# wa:modules:end\nB=2\n",
      ),
    );
    expect(result).toEqual({
      content: "A=1\n# wa:modules:start\nX=0\n# wa:modules:end\nB=2\n",
      conflicts: 0,
    });
  });

  it.each([
    ["theirs", { theirs: Buffer.from([0, 1, 2]) }],
    ["ours", { ours: Buffer.from("a\0b\n") }],
    ["base", { base: Buffer.from("a\0b\n") }],
  ])(
    "zwraca binary, gdy strona %s zawiera bajt 0, bez uruchamiania gita",
    async (_side, override) => {
      process.env.PATH = "";
      const result = await mergeFile({
        path: "public/logo.png",
        base: Buffer.from("a\n"),
        ours: Buffer.from("a\n"),
        theirs: Buffer.from("a\n"),
        labels,
        ...override,
      });
      expect(result).toEqual({ binary: true });
    },
  );

  it("nie zostawia katalogu wa-merge-* po udanym scaleniu i po konflikcie", async () => {
    const before = await mergeDirs();
    await merge("src/a.ts", "a\n", "b\n", "a\n");
    await merge("src/a.ts", "a\nb\nc\n", "a\nprojekt\nc\n", "a\nkit\nc\n");
    expect(await mergeDirs()).toEqual(before);
  });

  it("rzuca błąd i sprząta katalog tymczasowy, gdy git nie działa", async () => {
    const before = await mergeDirs();
    process.env.PATH = "";
    await expect(merge("src/a.ts", "a\n", "b\n", "c\n")).rejects.toThrow();
    process.env.PATH = originalPath;
    expect(await mergeDirs()).toEqual(before);
  });

  const lines = fc
    .array(fc.stringMatching(/^[a-z ]{0,6}$/), { maxLength: 8 })
    .map((items) => items.map((item) => `${item}\n`).join(""));

  test.prop([lines, lines], { numRuns: 15 })(
    "gdy projekt nie zmienił pliku, wynikiem jest wersja kitu bez konfliktów",
    async (base, theirs) => {
      const result = textOf(await merge("src/a.ts", base, base, theirs));
      expect(result).toEqual({ content: theirs, conflicts: 0 });
    },
  );

  test.prop([lines, lines], { numRuns: 15 })(
    "gdy kit nie zmienił pliku, wynikiem jest wersja projektu bez konfliktów",
    async (base, ours) => {
      const result = textOf(await merge("src/a.ts", base, ours, base));
      expect(result).toEqual({ content: ours, conflicts: 0 });
    },
  );
});

describe("mergeFile z fałszywym gitem", () => {
  let fakeDir: string;
  let argsFile: string;

  beforeEach(async () => {
    fakeDir = await mkdtemp(join(tmpdir(), "wa-fake-git-"));
    argsFile = join(fakeDir, "args.txt");
    await writeFile(
      join(fakeDir, "git"),
      [
        "#!/bin/sh",
        'for a in "$@"; do',
        `  printf '%s\\n' "$a" >> "${argsFile}"`,
        `  if [ -f "$a" ]; then printf 'TRESC:' >> "${argsFile}"; /bin/cat "$a" >> "${argsFile}"; fi`,
        "done",
        'if [ "$WA_FAKE_CODE" = "signal" ]; then kill -9 $$; fi',
        "printf 'X'",
        "printf 'fatal: boom\\n' >&2",
        'exit "$WA_FAKE_CODE"',
        "",
      ].join("\n"),
    );
    await chmod(join(fakeDir, "git"), 0o755);
    process.env.PATH = fakeDir;
  });

  afterEach(async () => {
    delete process.env.WA_FAKE_CODE;
    process.env.PATH = originalPath;
    await rm(fakeDir, { recursive: true, force: true });
  });

  it("traktuje kod 127 jako 127 konfliktów i zwraca stdout", async () => {
    process.env.WA_FAKE_CODE = "127";
    const result = await merge("src/a.ts", "a\n", "b\n", "c\n");
    expect(result).toEqual({ content: Buffer.from("X"), conflicts: 127 });
  });

  it("odrzuca kod 128 z komunikatem ze stderr i przyczyną z kodem", async () => {
    process.env.WA_FAKE_CODE = "128";
    await expect(merge("src/a.ts", "a\n", "b\n", "c\n")).rejects.toMatchObject({
      message: "git merge-file: fatal: boom",
      cause: { code: 128 },
    });
  });

  it("odrzuca zakończenie gita sygnałem", async () => {
    process.env.WA_FAKE_CODE = "signal";
    await expect(merge("src/a.ts", "a\n", "b\n", "c\n")).rejects.toThrow(
      /^git merge-file: /,
    );
  });

  it("przekazuje gitowi flagi, etykiety i pliki ours, base, theirs w tej kolejności", async () => {
    process.env.WA_FAKE_CODE = "0";
    await merge("src/a.ts", "BAZA\n", "PROJEKT\n", "KIT\n");
    const lines = (await readFile(argsFile, "utf8")).split("\n");
    expect(lines.slice(0, 9)).toEqual([
      "merge-file",
      "-p",
      "--diff3",
      "-L",
      "project",
      "-L",
      "v0.1.0",
      "-L",
      "v0.2.0",
    ]);
    const paths = [lines[9], lines[11], lines[13]] as string[];
    for (const path of paths) {
      expect(basename(dirname(path)).startsWith("wa-merge-")).toBe(true);
    }
    expect([lines[10], lines[12], lines[14]]).toEqual([
      "TRESC:PROJEKT",
      "TRESC:BAZA",
      "TRESC:KIT",
    ]);
  });
});
