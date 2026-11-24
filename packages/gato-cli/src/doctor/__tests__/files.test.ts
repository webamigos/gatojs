import { createHash } from "node:crypto";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";
import type { KitState, ModuleManifest } from "../../manifest/schema.js";
import { checkGatoFiles } from "../files.js";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const HASH_X = sha256("x");

function manifest(name: string, files: string[] = []): ModuleManifest {
  return {
    name,
    version: "1.0.0",
    description: name,
    requires: [],
    files,
    dependencies: {},
    devDependencies: {},
    env: [],
    schemaRelations: [],
    compose: null,
    ciSteps: null,
    workspaces: [],
  };
}

function stateWith(options: {
  modules: Record<string, Record<string, string>>;
  ejected?: KitState["ejected"];
  projectModules?: string[];
}): KitState {
  return {
    kitVersion: "0.1.0",
    kitRepo: "https://github.com/webamigos/wa-kit.git",
    kitFormat: 2,
    project: { name: "App", slug: "app" },
    locales: ["pl", "en"],
    modules: Object.fromEntries(
      Object.entries(options.modules).map(([name, files]) => [
        name,
        { version: "1.0.0", manifest: manifest(name), files },
      ]),
    ),
    projectModules: Object.fromEntries(
      (options.projectModules ?? []).map((name) => [
        name,
        { manifest: manifest(name, [`src/features/${name}/**`]) },
      ]),
    ),
    ejected: options.ejected ?? {},
  };
}

function projectOf(files: Record<string, string>) {
  return vi.fn(async (path: string): Promise<Buffer | null> => {
    const content = files[path];
    return content === undefined ? null : Buffer.from(content);
  });
}

const EMPTY = { modified: [], deleted: [], ejected: [], staleEjected: [] };

describe("checkGatoFiles", () => {
  it("reports nothing when every Gato file matches its recorded hash", async () => {
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { "src/a.ts": HASH_X } } }),
      readProject: projectOf({ "src/a.ts": "x" }),
    });
    expect(report).toEqual(EMPTY);
  });

  it("reports a Gato file whose content differs as modified", async () => {
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { "src/a.ts": HASH_X } } }),
      readProject: projectOf({ "src/a.ts": "y" }),
    });
    expect(report).toEqual({ ...EMPTY, modified: ["src/a.ts"] });
  });

  it("reports a missing Gato file as deleted, not modified", async () => {
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { "src/a.ts": HASH_X } } }),
      readProject: projectOf({}),
    });
    expect(report).toEqual({ ...EMPTY, deleted: ["src/a.ts"] });
  });

  it("treats an empty Gato file as present and modified", async () => {
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { "src/a.ts": HASH_X } } }),
      readProject: projectOf({ "src/a.ts": "" }),
    });
    expect(report).toEqual({ ...EMPTY, modified: ["src/a.ts"] });
  });

  it("ignores a change inside a wa:modules region of .env.example", async () => {
    const recorded = sha256("A=1\n# wa:modules:start\n# wa:modules:end\n");
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { ".env.example": recorded } } }),
      readProject: projectOf({
        ".env.example": "A=1\n# wa:modules:start\nB=2\n# wa:modules:end\n",
      }),
    });
    expect(report).toEqual(EMPTY);
  });

  it("reports a change outside the wa:modules region of .env.example", async () => {
    const recorded = sha256("A=1\n# wa:modules:start\n# wa:modules:end\n");
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { ".env.example": recorded } } }),
      readProject: projectOf({
        ".env.example": "A=2\n# wa:modules:start\nB=2\n# wa:modules:end\n",
      }),
    });
    expect(report).toEqual({ ...EMPTY, modified: [".env.example"] });
  });

  it("does not strip region markers in a file that is not a region file", async () => {
    const recorded = sha256("A=1\n# wa:modules:start\n# wa:modules:end\n");
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { "src/env.txt": recorded } } }),
      readProject: projectOf({
        "src/env.txt": "A=1\n# wa:modules:start\nB=2\n# wa:modules:end\n",
      }),
    });
    expect(report).toEqual({ ...EMPTY, modified: ["src/env.txt"] });
  });

  it("skips a seed file whatever its content", async () => {
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { "README.md": "seed" } } }),
      readProject: projectOf({ "README.md": "anything the project wrote" }),
    });
    expect(report).toEqual(EMPTY);
  });

  it("skips a missing seed file", async () => {
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { "README.md": "seed" } } }),
      readProject: projectOf({}),
    });
    expect(report).toEqual(EMPTY);
  });

  it("skips a managed file whatever its content", async () => {
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { "package.json": "managed" } } }),
      readProject: projectOf({ "package.json": "{}" }),
    });
    expect(report).toEqual(EMPTY);
  });

  it("skips a missing managed file", async () => {
    const report = await checkGatoFiles({
      state: stateWith({ modules: { core: { "package.json": "managed" } } }),
      readProject: projectOf({}),
    });
    expect(report).toEqual(EMPTY);
  });

  it("lists a modified ejected file under ejected with unchanged false, not under modified", async () => {
    const report = await checkGatoFiles({
      state: stateWith({
        modules: { core: { "src/a.ts": HASH_X } },
        ejected: {
          "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
        },
      }),
      readProject: projectOf({ "src/a.ts": "y" }),
    });
    expect(report).toEqual({
      ...EMPTY,
      ejected: [{ path: "src/a.ts", reason: "custom login", unchanged: false }],
    });
  });

  it("marks an ejected file equal to its recorded hash as unchanged", async () => {
    const report = await checkGatoFiles({
      state: stateWith({
        modules: { core: { "src/a.ts": HASH_X } },
        ejected: {
          "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
        },
      }),
      readProject: projectOf({ "src/a.ts": "x" }),
    });
    expect(report).toEqual({
      ...EMPTY,
      ejected: [{ path: "src/a.ts", reason: "custom login", unchanged: true }],
    });
  });

  it("marks a missing ejected file as changed and keeps it out of deleted", async () => {
    const report = await checkGatoFiles({
      state: stateWith({
        modules: { core: { "src/a.ts": HASH_X } },
        ejected: {
          "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
        },
      }),
      readProject: projectOf({}),
    });
    expect(report).toEqual({
      ...EMPTY,
      ejected: [{ path: "src/a.ts", reason: "custom login", unchanged: false }],
    });
  });

  it("uses region-stripped hashes for an ejected region file", async () => {
    const recorded = sha256("A=1\n# wa:modules:start\n# wa:modules:end\n");
    const report = await checkGatoFiles({
      state: stateWith({
        modules: { core: { ".env.example": recorded } },
        ejected: {
          ".env.example": { reason: "extra vars", ejectedAt: "2026-11-23" },
        },
      }),
      readProject: projectOf({
        ".env.example": "A=1\n# wa:modules:start\nB=2\n# wa:modules:end\n",
      }),
    });
    expect(report.ejected).toEqual([
      { path: ".env.example", reason: "extra vars", unchanged: true },
    ]);
  });

  it("reports an ejected entry without a recorded hash as stale", async () => {
    const report = await checkGatoFiles({
      state: stateWith({
        modules: { core: { "src/a.ts": HASH_X } },
        ejected: { "src/gone.ts": { reason: "old", ejectedAt: "2026-11-23" } },
      }),
      readProject: projectOf({ "src/a.ts": "x", "src/gone.ts": "z" }),
    });
    expect(report).toEqual({ ...EMPTY, staleEjected: ["src/gone.ts"] });
  });

  it.each(["managed", "seed"])(
    "reports an ejected entry whose hash is %s as stale",
    async (hash) => {
      const report = await checkGatoFiles({
        state: stateWith({
          modules: { core: { "package.json": hash } },
          ejected: {
            "package.json": { reason: "old", ejectedAt: "2026-11-23" },
          },
        }),
        readProject: projectOf({ "package.json": "{}" }),
      });
      expect(report).toEqual({ ...EMPTY, staleEjected: ["package.json"] });
    },
  );

  it("reports an ejected entry for a project module file as stale", async () => {
    const report = await checkGatoFiles({
      state: stateWith({
        modules: { core: {} },
        projectModules: ["notes"],
        ejected: {
          "src/features/notes/module.ts": {
            reason: "mine",
            ejectedAt: "2026-11-23",
          },
        },
      }),
      readProject: projectOf({ "src/features/notes/module.ts": "x" }),
    });
    expect(report).toEqual({
      ...EMPTY,
      staleEjected: ["src/features/notes/module.ts"],
    });
  });

  it("never reads project module files and reads only Gato files with a content hash", async () => {
    const readProject = projectOf({
      "src/a.ts": "x",
      "src/features/notes/module.ts": "y",
      "package.json": "{}",
      "README.md": "r",
    });
    await checkGatoFiles({
      state: stateWith({
        modules: {
          core: {
            "src/a.ts": HASH_X,
            "package.json": "managed",
            "README.md": "seed",
          },
        },
        projectModules: ["notes"],
      }),
      readProject,
    });
    expect(readProject.mock.calls.map(([path]) => path)).toEqual(["src/a.ts"]);
  });

  it("checks files of every installed module", async () => {
    const report = await checkGatoFiles({
      state: stateWith({
        modules: {
          core: { "src/core.ts": HASH_X },
          demo: { "src/features/demo/module.ts": HASH_X },
          "audit-logs": { "src/features/audit-logs/module.ts": HASH_X },
        },
      }),
      readProject: projectOf({
        "src/core.ts": "y",
        "src/features/demo/module.ts": "x",
      }),
    });
    expect(report).toEqual({
      ...EMPTY,
      modified: ["src/core.ts"],
      deleted: ["src/features/audit-logs/module.ts"],
    });
  });

  it("sorts modified files by code point across modules", async () => {
    const report = await checkGatoFiles({
      state: stateWith({
        modules: {
          core: { "src/b.ts": HASH_X, "a.ts": HASH_X },
          demo: { "src/a.ts": HASH_X, "Z.ts": HASH_X },
        },
      }),
      readProject: projectOf({
        "src/b.ts": "y",
        "a.ts": "y",
        "src/a.ts": "y",
        "Z.ts": "y",
      }),
    });
    expect(report.modified).toEqual(["Z.ts", "a.ts", "src/a.ts", "src/b.ts"]);
  });

  it("sorts deleted files by code point across modules", async () => {
    const report = await checkGatoFiles({
      state: stateWith({
        modules: {
          core: { "src/b.ts": HASH_X, "a.ts": HASH_X },
          demo: { "src/a.ts": HASH_X, "Z.ts": HASH_X },
        },
      }),
      readProject: projectOf({}),
    });
    expect(report.deleted).toEqual(["Z.ts", "a.ts", "src/a.ts", "src/b.ts"]);
  });

  it("sorts ejected and stale entries by code point", async () => {
    const report = await checkGatoFiles({
      state: stateWith({
        modules: {
          core: { "src/b.ts": HASH_X },
          demo: { "src/a.ts": HASH_X, "Z.ts": HASH_X },
        },
        ejected: {
          "src/b.ts": { reason: "b", ejectedAt: "2026-11-23" },
          "src/y.ts": { reason: "y", ejectedAt: "2026-11-23" },
          "src/a.ts": { reason: "a", ejectedAt: "2026-11-23" },
          "src/X.ts": { reason: "x", ejectedAt: "2026-11-23" },
          "Z.ts": { reason: "z", ejectedAt: "2026-11-23" },
        },
      }),
      readProject: projectOf({ "src/b.ts": "x", "src/a.ts": "y", "Z.ts": "x" }),
    });
    expect(report).toEqual({
      ...EMPTY,
      ejected: [
        { path: "Z.ts", reason: "z", unchanged: true },
        { path: "src/a.ts", reason: "a", unchanged: false },
        { path: "src/b.ts", reason: "b", unchanged: true },
      ],
      staleEjected: ["src/X.ts", "src/y.ts"],
    });
  });

  const kinds = ["clean", "modified", "deleted", "managed", "seed"] as const;
  type Kind = (typeof kinds)[number];
  const pathArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_/-]{0,6}\.ts$/);
  const entryArb = fc.record({
    kind: fc.constantFrom<Kind>(...kinds),
    ejected: fc.boolean(),
    module: fc.constantFrom("core", "demo", "z-mod"),
  });

  function isSorted(paths: string[]): boolean {
    return paths
      .slice(1)
      .every((path, index) => (paths[index] as string) < path);
  }

  test.prop([
    fc.dictionary(pathArb, entryArb, { maxKeys: 12 }),
    fc.array(pathArb, { maxLength: 3 }),
  ])(
    "output lists are sorted, disjoint and hold exactly the classified paths",
    async (entries, strayEjected) => {
      const modules: Record<string, Record<string, string>> = {
        core: {},
        demo: {},
        "z-mod": {},
      };
      const files: Record<string, string> = {};
      const ejected: KitState["ejected"] = {};
      for (const [path, entry] of Object.entries(entries)) {
        const moduleFiles = modules[entry.module] ?? {};
        moduleFiles[path] =
          entry.kind === "managed" || entry.kind === "seed"
            ? entry.kind
            : HASH_X;
        modules[entry.module] = moduleFiles;
        if (entry.kind === "clean") files[path] = "x";
        if (entry.kind === "modified") files[path] = "y";
        if (entry.ejected) ejected[path] = { reason: "r", ejectedAt: "d" };
      }
      for (const path of strayEjected) {
        if (!(path in entries)) ejected[path] = { reason: "r", ejectedAt: "d" };
      }
      const report = await checkGatoFiles({
        state: stateWith({ modules, ejected }),
        readProject: projectOf(files),
      });
      const ejectedPaths = report.ejected.map(
        (entry: { path: string }) => entry.path,
      );
      for (const list of [
        report.modified,
        report.deleted,
        ejectedPaths,
        report.staleEjected,
      ]) {
        expect(isSorted(list)).toBe(true);
      }
      const all = [
        ...report.modified,
        ...report.deleted,
        ...ejectedPaths,
        ...report.staleEjected,
      ];
      expect(new Set(all).size).toBe(all.length);
      for (const [path, entry] of Object.entries(entries)) {
        const gato = entry.kind !== "managed" && entry.kind !== "seed";
        expect(report.modified.includes(path)).toBe(
          gato && !entry.ejected && entry.kind === "modified",
        );
        expect(report.deleted.includes(path)).toBe(
          gato && !entry.ejected && entry.kind === "deleted",
        );
        expect(ejectedPaths.includes(path)).toBe(gato && entry.ejected);
        expect(report.staleEjected.includes(path)).toBe(!gato && entry.ejected);
      }
      for (const path of strayEjected) {
        if (!(path in entries)) {
          expect(report.staleEjected).toContain(path);
        }
      }
    },
  );
});
