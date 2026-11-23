import { describe, expect, it } from "vitest";
import { fileHash } from "../../assemble/hash.js";
import { REGION_FILES } from "../../generate/targets.js";
import { planUpdate } from "../plan.js";
import type { KitFile, KitSnapshot } from "../snapshot.js";

type FileSpec = string | Buffer | { content: string | Buffer; mode: number };

function kitFile(spec: FileSpec): KitFile {
  if (typeof spec === "string" || Buffer.isBuffer(spec)) {
    return { content: Buffer.from(spec), mode: 0o644 };
  }
  return { content: Buffer.from(spec.content), mode: spec.mode };
}

function snapshot(
  version: string,
  files: Record<string, FileSpec>,
): KitSnapshot {
  return {
    version,
    config: {
      version,
      repo: "webamigos/wa-kit",
      kitOnly: [],
      placeholders: { projectName: "", projectSlug: "", projectSnake: "" },
      placeholderFiles: [],
      generatedFiles: [],
      managedFiles: ["package.json", "package-lock.json"],
    },
    manifests: [],
    files: new Map(
      Object.entries(files).map(([path, spec]) => [path, kitFile(spec)]),
    ),
  };
}

function recorded(path: string, content: string | Buffer): string {
  return fileHash(path, Buffer.from(content), { managedFiles: [] });
}

function plan(input: {
  base: Record<string, FileSpec>;
  target: Record<string, FileSpec>;
  project: Record<string, string | Buffer>;
  recordedHashes?: Record<string, string>;
}) {
  return planUpdate({
    base: snapshot("0.1.0", input.base),
    target: snapshot("0.2.0", input.target),
    recordedHashes: input.recordedHashes ?? {},
    readProject: async (path) =>
      path in input.project ? Buffer.from(input.project[path] as string) : null,
  });
}

const BASE = "a\nb\nc\nd\ne\nf\n";
const KIT = "a\nb\nc\nd\ne\nKIT\n";
const PROJECT = "a\nPROJEKT\nc\nd\ne\nf\n";

describe("planUpdate", () => {
  it("nie planuje niczego, gdy kit nie zmienił pliku, nawet jeśli projekt go zmienił", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: { "src/a.ts": BASE },
        project: { "src/a.ts": PROJECT },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", BASE) },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  it("nie przywraca pliku usuniętego w projekcie, gdy kit go nie zmienił", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: { "src/a.ts": BASE },
        project: {},
        recordedHashes: { "src/a.ts": recorded("src/a.ts", BASE) },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  it("aktualizuje plik równy bazie do treści kitu z bitami uprawnień z kitu", async () => {
    expect(
      await plan({
        base: { "bin/run.sh": { content: BASE, mode: 0o644 } },
        target: { "bin/run.sh": { content: KIT, mode: 0o755 } },
        project: { "bin/run.sh": BASE },
        recordedHashes: { "bin/run.sh": recorded("bin/run.sh", BASE) },
      }),
    ).toEqual({
      files: [
        {
          path: "bin/run.sh",
          action: "updated",
          reason: null,
          content: Buffer.from("a\nb\nc\nd\ne\nKIT\n"),
          mode: 0o755,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("aktualizuje plik równy bazie, gdy kit zmienił tylko bity uprawnień", async () => {
    expect(
      await plan({
        base: { "bin/run.sh": { content: BASE, mode: 0o644 } },
        target: { "bin/run.sh": { content: BASE, mode: 0o755 } },
        project: { "bin/run.sh": BASE },
        recordedHashes: { "bin/run.sh": recorded("bin/run.sh", BASE) },
      }),
    ).toEqual({
      files: [
        {
          path: "bin/run.sh",
          action: "updated",
          reason: null,
          content: Buffer.from("a\nb\nc\nd\ne\nf\n"),
          mode: 0o755,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("nie nadpisuje pliku zmienionego w projekcie, gdy kit zmienił tylko bity uprawnień", async () => {
    expect(
      await plan({
        base: { "bin/run.sh": { content: BASE, mode: 0o644 } },
        target: { "bin/run.sh": { content: BASE, mode: 0o755 } },
        project: { "bin/run.sh": PROJECT },
        recordedHashes: { "bin/run.sh": recorded("bin/run.sh", BASE) },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  it("aktualizuje plik równy bazie, gdy brak zapisanego hasha", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: { "src/a.ts": { content: KIT, mode: 0o600 } },
        project: { "src/a.ts": BASE },
      }),
    ).toEqual({
      files: [
        {
          path: "src/a.ts",
          action: "updated",
          reason: null,
          content: Buffer.from("a\nb\nc\nd\ne\nKIT\n"),
          mode: 0o600,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("nie planuje niczego, gdy projekt ma już treść nowego kitu", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: { "src/a.ts": KIT },
        project: { "src/a.ts": KIT },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", BASE) },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  it("scala zmianę projektu i kitu w różnych liniach bez konfliktu, z bitami z kitu", async () => {
    expect(
      await plan({
        base: { "src/a.ts": { content: BASE, mode: 0o644 } },
        target: { "src/a.ts": { content: KIT, mode: 0o755 } },
        project: { "src/a.ts": PROJECT },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", BASE) },
      }),
    ).toEqual({
      files: [
        {
          path: "src/a.ts",
          action: "merged",
          reason: null,
          content: Buffer.from("a\nPROJEKT\nc\nd\ne\nKIT\n"),
          mode: 0o755,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("zgłasza konflikt z markerami diff3 i etykietami wersji, gdy obie strony zmieniły tę samą linię", async () => {
    expect(
      await plan({
        base: { "src/a.ts": { content: "a\nb\nc\n", mode: 0o644 } },
        target: { "src/a.ts": { content: "a\nkit\nc\n", mode: 0o755 } },
        project: { "src/a.ts": "a\nprojekt\nc\n" },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", "a\nb\nc\n") },
      }),
    ).toEqual({
      files: [
        {
          path: "src/a.ts",
          action: "conflict",
          reason: null,
          content: Buffer.from(
            "a\n<<<<<<< project\nprojekt\n||||||| v0.1.0\nb\n=======\nkit\n>>>>>>> v0.2.0\nc\n",
          ),
          mode: 0o755,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("nie przywraca pliku usuniętego w projekcie, gdy kit go zmienił", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: { "src/a.ts": { content: KIT, mode: 0o755 } },
        project: {},
        recordedHashes: { "src/a.ts": recorded("src/a.ts", BASE) },
      }),
    ).toEqual({
      files: [
        {
          path: "src/a.ts",
          action: "needs decision",
          reason: "deleted in the project, changed in the kit",
          content: null,
          mode: null,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("usuwa plik równy bazie, którego nie ma w nowym kicie", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: {},
        project: { "src/a.ts": BASE },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", BASE) },
      }),
    ).toEqual({
      files: [
        {
          path: "src/a.ts",
          action: "removed",
          reason: null,
          content: null,
          mode: null,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("nie usuwa pliku zmienionego w projekcie, którego nie ma w nowym kicie", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: {},
        project: { "src/a.ts": PROJECT },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", BASE) },
      }),
    ).toEqual({
      files: [
        {
          path: "src/a.ts",
          action: "needs decision",
          reason: "changed in the project, deleted in the kit",
          content: null,
          mode: null,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("nie planuje niczego dla pliku usuniętego i w projekcie, i w kicie", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: {},
        project: {},
        recordedHashes: { "src/a.ts": recorded("src/a.ts", BASE) },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  it("dodaje nowy plik kitu z bitami uprawnień z kitu", async () => {
    expect(
      await plan({
        base: {},
        target: { "bin/new.sh": { content: "echo nowy\n", mode: 0o755 } },
        project: {},
      }),
    ).toEqual({
      files: [
        {
          path: "bin/new.sh",
          action: "added",
          reason: null,
          content: Buffer.from("echo nowy\n"),
          mode: 0o755,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("nie planuje niczego, gdy projekt ma już nowy plik kitu w tej samej treści", async () => {
    expect(
      await plan({
        base: {},
        target: { "src/new.ts": "nowy\n" },
        project: { "src/new.ts": "nowy\n" },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  it("nie nadpisuje pliku projektu na ścieżce nowego pliku kitu", async () => {
    expect(
      await plan({
        base: {},
        target: { "src/new.ts": { content: "kit\n", mode: 0o755 } },
        project: { "src/new.ts": "projekt\n" },
      }),
    ).toEqual({
      files: [
        {
          path: "src/new.ts",
          action: "conflict",
          reason: "project file at the path of a new kit file",
          content: null,
          mode: null,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("zgłasza konflikt bez treści dla pliku binarnego zmienionego w projekcie i w kicie", async () => {
    expect(
      await plan({
        base: { "public/logo.png": Buffer.from([0, 1, 2]) },
        target: {
          "public/logo.png": { content: Buffer.from([0, 1, 4]), mode: 0o755 },
        },
        project: { "public/logo.png": Buffer.from([0, 1, 3]) },
        recordedHashes: {
          "public/logo.png": recorded(
            "public/logo.png",
            Buffer.from([0, 1, 2]),
          ),
        },
      }),
    ).toEqual({
      files: [
        {
          path: "public/logo.png",
          action: "conflict",
          reason: "binary file changed in both the project and the kit",
          content: null,
          mode: null,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("aktualizuje plik binarny niezmieniony w projekcie", async () => {
    expect(
      await plan({
        base: { "public/logo.png": Buffer.from([0, 1, 2]) },
        target: {
          "public/logo.png": { content: Buffer.from([0, 1, 4]), mode: 0o600 },
        },
        project: { "public/logo.png": Buffer.from([0, 1, 2]) },
        recordedHashes: {
          "public/logo.png": recorded(
            "public/logo.png",
            Buffer.from([0, 1, 2]),
          ),
        },
      }),
    ).toEqual({
      files: [
        {
          path: "public/logo.png",
          action: "updated",
          reason: null,
          content: Buffer.from([0, 1, 4]),
          mode: 0o600,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("aktualizuje plik z regionami, gdy projekt różni się od bazy tylko treścią regionu", async () => {
    expect(REGION_FILES).toContain(".env.example");
    const base = "A=1\n# wa:modules:start\nBASE=0\n# wa:modules:end\n";
    expect(
      await plan({
        base: { ".env.example": base },
        target: {
          ".env.example": {
            content: "A=2\n# wa:modules:start\nBASE=0\n# wa:modules:end\n",
            mode: 0o600,
          },
        },
        project: {
          ".env.example":
            "A=1\n# wa:modules:start\nPROJEKT=1\n# wa:modules:end\n",
        },
        recordedHashes: { ".env.example": recorded(".env.example", base) },
      }),
    ).toEqual({
      files: [
        {
          path: ".env.example",
          action: "updated",
          reason: null,
          content: Buffer.from(
            "A=2\n# wa:modules:start\nBASE=0\n# wa:modules:end\n",
          ),
          mode: 0o600,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("nie planuje niczego dla pliku z regionami, gdy projekt różni się od kitu tylko treścią regionu", async () => {
    const base = "A=1\n# wa:modules:start\nBASE=0\n# wa:modules:end\n";
    expect(
      await plan({
        base: { ".env.example": base },
        target: {
          ".env.example": "A=2\n# wa:modules:start\nKIT=0\n# wa:modules:end\n",
        },
        project: {
          ".env.example":
            "A=2\n# wa:modules:start\nPROJEKT=1\n# wa:modules:end\n",
        },
        recordedHashes: { ".env.example": recorded(".env.example", base) },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  it("scala zamiast aktualizować, gdy projekt odpowiada zapisanemu hashowi, a baza z tagu jest inna", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: { "src/a.ts": { content: KIT, mode: 0o755 } },
        project: { "src/a.ts": PROJECT },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", PROJECT) },
      }),
    ).toEqual({
      files: [
        {
          path: "src/a.ts",
          action: "merged",
          reason: null,
          content: Buffer.from("a\nPROJEKT\nc\nd\ne\nKIT\n"),
          mode: 0o755,
        },
      ],
      mismatchedBase: ["src/a.ts"],
    });
  });

  it("nie usuwa pliku, gdy projekt odpowiada zapisanemu hashowi, a baza z tagu jest inna i kit go usunął", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: {},
        project: { "src/a.ts": PROJECT },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", PROJECT) },
      }),
    ).toEqual({
      files: [
        {
          path: "src/a.ts",
          action: "needs decision",
          reason: "changed in the project, deleted in the kit",
          content: null,
          mode: null,
        },
      ],
      mismatchedBase: ["src/a.ts"],
    });
  });

  it("nie traktuje pliku równego bazie jako niezmienionego, gdy zapisany hash różni się od bazy", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: { "src/a.ts": { content: KIT, mode: 0o755 } },
        project: { "src/a.ts": BASE },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", PROJECT) },
      }),
    ).toEqual({
      files: [
        {
          path: "src/a.ts",
          action: "merged",
          reason: null,
          content: Buffer.from("a\nb\nc\nd\ne\nKIT\n"),
          mode: 0o755,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("nie usuwa pliku równego bazie, gdy zapisany hash różni się od bazy", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: {},
        project: { "src/a.ts": BASE },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", PROJECT) },
      }),
    ).toEqual({
      files: [
        {
          path: "src/a.ts",
          action: "needs decision",
          reason: "changed in the project, deleted in the kit",
          content: null,
          mode: null,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("nie planuje niczego, gdy czyste scalenie daje treść identyczną z projektem", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: { "src/a.ts": { content: KIT, mode: 0o755 } },
        project: { "src/a.ts": "a\nPROJEKT\nc\nd\ne\nKIT\n" },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", BASE) },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  it("nie planuje niczego ani nie ostrzega, gdy projekt równy zapisanemu hashowi innemu niż baza jest już równy kitowi", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: { "src/a.ts": KIT },
        project: { "src/a.ts": KIT },
        recordedHashes: { "src/a.ts": recorded("src/a.ts", KIT) },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  it("nie planuje niczego dla pliku binarnego, który projekt ma już w wersji kitu", async () => {
    expect(
      await plan({
        base: { "public/logo.png": Buffer.from([0, 1]) },
        target: { "public/logo.png": Buffer.from([0, 2]) },
        project: { "public/logo.png": Buffer.from([0, 2]) },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  it("nie planuje niczego ani nie ostrzega, gdy czyste scalenie daje treść projektu równego zapisanemu hashowi innemu niż baza", async () => {
    expect(
      await plan({
        base: { "src/a.ts": BASE },
        target: { "src/a.ts": { content: KIT, mode: 0o755 } },
        project: { "src/a.ts": "a\nPROJEKT\nc\nd\ne\nKIT\n" },
        recordedHashes: {
          "src/a.ts": recorded("src/a.ts", "a\nPROJEKT\nc\nd\ne\nKIT\n"),
        },
      }),
    ).toEqual({ files: [], mismatchedBase: [] });
  });

  const packageBase =
    '{\n  "name": "app",\n  "scripts": {\n    "dev": "next dev"\n  },\n  "dependencies": {\n    "next": "15.0.0"\n  }\n}\n';
  const packageKit =
    '{\n  "name": "app",\n  "scripts": {\n    "dev": "next dev"\n  },\n  "dependencies": {\n    "next": "15.1.0"\n  }\n}\n';

  it("aktualizuje package.json z wpisem managed, gdy projekt jest równy bazie", async () => {
    expect(
      await plan({
        base: { "package.json": packageBase },
        target: { "package.json": { content: packageKit, mode: 0o600 } },
        project: { "package.json": packageBase },
        recordedHashes: { "package.json": "managed" },
      }),
    ).toEqual({
      files: [
        {
          path: "package.json",
          action: "updated",
          reason: null,
          content: Buffer.from(
            '{\n  "name": "app",\n  "scripts": {\n    "dev": "next dev"\n  },\n  "dependencies": {\n    "next": "15.1.0"\n  }\n}\n',
          ),
          mode: 0o600,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("scala własny skrypt projektu w package.json z podbitą zależnością kitu", async () => {
    expect(
      await plan({
        base: { "package.json": packageBase },
        target: { "package.json": { content: packageKit, mode: 0o600 } },
        project: {
          "package.json":
            '{\n  "name": "app",\n  "scripts": {\n    "dev": "next dev",\n    "lint": "eslint"\n  },\n  "dependencies": {\n    "next": "15.0.0"\n  }\n}\n',
        },
        recordedHashes: { "package.json": "managed" },
      }),
    ).toEqual({
      files: [
        {
          path: "package.json",
          action: "merged",
          reason: null,
          content: Buffer.from(
            '{\n  "name": "app",\n  "scripts": {\n    "dev": "next dev",\n    "lint": "eslint"\n  },\n  "dependencies": {\n    "next": "15.1.0"\n  }\n}\n',
          ),
          mode: 0o600,
        },
      ],
      mismatchedBase: [],
    });
  });

  it("zwraca pozycje w kolejności punktów kodowych ścieżek niezależnie od kolejności map", async () => {
    const result = await plan({
      base: { "src/z.ts": BASE, "src/m.ts": BASE, "src/same.ts": BASE },
      target: {
        "src/b.ts": "b\n",
        "src/same.ts": BASE,
        "src/a.ts": "a\n",
        "src/B.ts": "B\n",
        "src/m.ts": KIT,
      },
      project: { "src/z.ts": BASE, "src/m.ts": BASE, "src/same.ts": PROJECT },
      recordedHashes: {
        "src/z.ts": recorded("src/z.ts", BASE),
        "src/m.ts": recorded("src/m.ts", BASE),
      },
    });
    expect(result.files.map((file) => [file.path, file.action])).toEqual([
      ["src/B.ts", "added"],
      ["src/a.ts", "added"],
      ["src/b.ts", "added"],
      ["src/m.ts", "updated"],
      ["src/z.ts", "removed"],
    ]);
  });
});
