import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTempDir, removeTempDirs } from "../../__tests__/helpers.js";
import type { GatoFilesReport } from "../../doctor/files.js";
import { writeKitState } from "../../manifest/kit-state.js";
import type { KitState, ModuleManifest } from "../../manifest/schema.js";
import { doctorFiles, doctorFilesReport } from "../doctor.js";

const CLEAN: GatoFilesReport = {
  modified: [],
  deleted: [],
  ejected: [],
  staleEjected: [],
};

function report(overrides: Partial<GatoFilesReport>): GatoFilesReport {
  return { ...CLEAN, ...overrides };
}

function text(lines: string[]): string {
  return lines.join("\n");
}

function firstLineWith(lines: string[], fragment: string): number {
  return lines.findIndex((line) => line.includes(fragment));
}

const GATO = { mode: "warn", cli: "gato" } as const;
const GATO_BLOCK = { mode: "block", cli: "gato" } as const;

describe("doctorFilesReport", () => {
  it("prints GatoJS files: no changes and exits 0 for a clean report in warn mode", () => {
    const result = doctorFilesReport(CLEAN, GATO);
    expect(result.exitCode).toBe(0);
    expect(result.lines).toContain("GatoJS files: no changes");
    expect(text(result.lines)).not.toContain("warning");
    expect(text(result.lines)).not.toContain("EXTENSION_POINTS.md");
  });

  it("exits 0 for a clean report in block mode", () => {
    const result = doctorFilesReport(CLEAN, GATO_BLOCK);
    expect(result.exitCode).toBe(0);
    expect(result.lines).toContain("GatoJS files: no changes");
  });

  it("exits 0 in warn mode with modified, deleted and stale entries", () => {
    const result = doctorFilesReport(
      report({
        modified: ["src/a.ts"],
        deleted: ["src/b.ts"],
        staleEjected: ["src/gone.ts"],
      }),
      GATO,
    );
    expect(result.exitCode).toBe(0);
  });

  it.each([
    ["modified", report({ modified: ["src/a.ts"] })],
    ["deleted", report({ deleted: ["src/a.ts"] })],
    ["stale", report({ staleEjected: ["src/a.ts"] })],
  ])("exits 1 in block mode with one %s entry", (_kind, input) => {
    expect(doctorFilesReport(input, GATO_BLOCK).exitCode).toBe(1);
  });

  it("exits 0 in block mode when the only findings are ejected files", () => {
    const result = doctorFilesReport(
      report({
        ejected: [
          { path: "src/a.ts", reason: "custom login", unchanged: false },
        ],
      }),
      GATO_BLOCK,
    );
    expect(result.exitCode).toBe(0);
  });

  it("names a modified file with both next steps and the extension points pointer", () => {
    const result = doctorFilesReport(report({ modified: ["src/a.ts"] }), GATO);
    const output = text(result.lines);
    expect(output).toContain("src/a.ts");
    expect(output).toContain("gato eject --undo src/a.ts");
    expect(output).toContain("git checkout HEAD -- src/a.ts");
    expect(output).toContain('gato eject src/a.ts --reason "<why>"');
    expect(output).toContain("EXTENSION_POINTS.md (when present)");
    expect(output).not.toContain("GatoJS files: no changes");
  });

  it("names a deleted file with both next steps", () => {
    const output = text(
      doctorFilesReport(report({ deleted: ["src/d.ts"] }), GATO).lines,
    );
    expect(output).toContain("src/d.ts");
    expect(output).toContain("gato eject --undo src/d.ts");
    expect(output).toContain("git checkout HEAD -- src/d.ts");
    expect(output).toContain('gato eject src/d.ts --reason "<why>"');
    expect(output).toContain("EXTENSION_POINTS.md (when present)");
  });

  it("names a stale entry and tells how to remove it", () => {
    const result = doctorFilesReport(
      report({ staleEjected: ["src/gone.ts"] }),
      GATO,
    );
    expect(firstLineWith(result.lines, "src/gone.ts")).toBeGreaterThanOrEqual(
      0,
    );
    expect(text(result.lines)).toContain(
      "remove it from ejected in .wa/kit.json",
    );
    expect(text(result.lines)).toContain("EXTENSION_POINTS.md (when present)");
  });

  it("names an ejected file with its reason", () => {
    const result = doctorFilesReport(
      report({
        ejected: [
          { path: "src/a.ts", reason: "custom login", unchanged: false },
        ],
      }),
      GATO,
    );
    const line = result.lines[firstLineWith(result.lines, "src/a.ts")];
    expect(line).toContain("custom login");
  });

  it.each([
    ["modified", report({ modified: ["src/a.ts"] })],
    ["deleted", report({ deleted: ["src/a.ts"] })],
    ["stale", report({ staleEjected: ["src/a.ts"] })],
  ])("adds a warning line in warn mode for a %s entry", (_kind, input) => {
    const result = doctorFilesReport(input, GATO);
    expect(result.lines.some((line: string) => line.includes("warning"))).toBe(
      true,
    );
  });

  it("uses the npm run wa -- prefix in next steps for the wa command", () => {
    const output = text(
      doctorFilesReport(report({ modified: ["src/a.ts"] }), {
        mode: "warn",
        cli: "npm run wa --",
      }).lines,
    );
    expect(output).toContain("npm run wa -- eject --undo src/a.ts");
    expect(output).toContain('npm run wa -- eject src/a.ts --reason "<why>"');
    expect(output).not.toContain("gato eject");
  });

  it("prints the revert hint with git checkout HEAD for the wa command", () => {
    const lines = doctorFilesReport(report({ modified: ["src/x.ts"] }), {
      mode: "warn",
      cli: "npm run wa --",
    }).lines;
    expect(lines).toContain(
      "    revert: npm run wa -- eject --undo src/x.ts (or git checkout HEAD -- src/x.ts)",
    );
    expect(text(lines)).not.toContain("git checkout -- src/x.ts");
  });

  it("marks an ejected file whose content differs as (changed)", () => {
    const result = doctorFilesReport(
      report({
        ejected: [
          { path: "src/a.ts", reason: "custom login", unchanged: false },
        ],
      }),
      GATO,
    );
    const line = result.lines[firstLineWith(result.lines, "src/a.ts")];
    expect(line).toContain("(changed)");
    expect(line).not.toContain("(unchanged)");
  });

  it("marks an ejected file equal to the recorded hash as (unchanged)", () => {
    const result = doctorFilesReport(
      report({
        ejected: [
          { path: "src/a.ts", reason: "custom login", unchanged: true },
        ],
      }),
      GATO,
    );
    const line = result.lines[firstLineWith(result.lines, "src/a.ts")];
    expect(line).toContain("(unchanged)");
    expect(line).not.toContain("(changed)");
  });

  it("marks each ejected file by its own content state", () => {
    const result = doctorFilesReport(
      report({
        ejected: [
          { path: "src/a.ts", reason: "custom a", unchanged: true },
          { path: "src/b.ts", reason: "custom b", unchanged: false },
        ],
      }),
      GATO,
    );
    expect(result.lines[firstLineWith(result.lines, "src/a.ts")]).toContain(
      "(unchanged)",
    );
    expect(result.lines[firstLineWith(result.lines, "src/b.ts")]).toContain(
      "(changed)",
    );
  });

  it.each([
    ["warn", GATO],
    ["block", GATO_BLOCK],
  ] as const)(
    "prints no warning and no extension points line in %s mode when only ejected files are reported",
    (_mode, options) => {
      const result = doctorFilesReport(
        report({
          ejected: [
            { path: "src/a.ts", reason: "custom login", unchanged: false },
          ],
        }),
        options,
      );
      expect(
        result.lines.some((line: string) => line.includes("warning")),
      ).toBe(false);
      expect(
        result.lines.some((line: string) =>
          line.includes("EXTENSION_POINTS.md"),
        ),
      ).toBe(false);
    },
  );

  it.each([
    ["modified", report({ modified: ["src/a.ts"] })],
    ["deleted", report({ deleted: ["src/a.ts"] })],
    ["stale", report({ staleEjected: ["src/a.ts"] })],
  ])(
    "prints the extension points line but no warning in block mode for a %s entry",
    (_kind, input) => {
      const result = doctorFilesReport(input, GATO_BLOCK);
      expect(
        result.lines.some((line: string) => line.includes("warning")),
      ).toBe(false);
      expect(
        result.lines.some((line: string) =>
          line.includes("EXTENSION_POINTS.md (when present)"),
        ),
      ).toBe(true);
    },
  );

  it("puts git checkout HEAD -- <path> in the output for a modified file", () => {
    const result = doctorFilesReport(report({ modified: ["src/a.ts"] }), GATO);
    expect(
      result.lines.some((line: string) =>
        line.includes("git checkout HEAD -- src/a.ts"),
      ),
    ).toBe(true);
  });

  it("prints modified files in the order of the report", () => {
    const result = doctorFilesReport(
      report({ modified: ["src/a.ts", "src/b.ts"] }),
      GATO,
    );
    expect(firstLineWith(result.lines, "src/a.ts")).toBeGreaterThanOrEqual(0);
    expect(firstLineWith(result.lines, "src/a.ts")).toBeLessThan(
      firstLineWith(result.lines, "src/b.ts"),
    );
  });

  it("prints exactly the header, next steps and both footers for one modified file in warn mode", () => {
    expect(
      doctorFilesReport(report({ modified: ["src/a.ts"] }), GATO).lines,
    ).toEqual([
      "GatoJS files:",
      "  modified  src/a.ts",
      "    revert: gato eject --undo src/a.ts (or git checkout HEAD -- src/a.ts)",
      '    keep the change: gato eject src/a.ts --reason "<why>"',
      "Before changing a GatoJS file, look for an extension point in EXTENSION_POINTS.md (when present).",
      "This is a warning for now; a later GatoJS release makes verify fail on these files.",
    ]);
  });

  it("prints exactly the header, next steps and only the extension points footer for one deleted file in block mode", () => {
    expect(
      doctorFilesReport(report({ deleted: ["src/d.ts"] }), GATO_BLOCK).lines,
    ).toEqual([
      "GatoJS files:",
      "  deleted   src/d.ts",
      "    revert: gato eject --undo src/d.ts (or git checkout HEAD -- src/d.ts)",
      '    keep the change: gato eject src/d.ts --reason "<why>"',
      "Before changing a GatoJS file, look for an extension point in EXTENSION_POINTS.md (when present).",
    ]);
  });

  it.each([
    ["warn", GATO],
    ["block", GATO_BLOCK],
  ] as const)(
    "prints exactly the header and the ejected line without footers in %s mode",
    (_mode, options) => {
      expect(
        doctorFilesReport(
          report({
            ejected: [
              { path: "src/a.ts", reason: "custom login", unchanged: false },
            ],
          }),
          options,
        ).lines,
      ).toEqual([
        "GatoJS files:",
        "  ejected   src/a.ts (changed): custom login",
      ]);
    },
  );

  it("prints exactly every kind of entry in order with both footers in warn mode", () => {
    expect(
      doctorFilesReport(
        report({
          modified: ["src/m.ts"],
          deleted: ["src/d.ts"],
          ejected: [
            { path: "src/e.ts", reason: "custom login", unchanged: true },
          ],
          staleEjected: ["src/s.ts"],
        }),
        GATO,
      ).lines,
    ).toEqual([
      "GatoJS files:",
      "  modified  src/m.ts",
      "    revert: gato eject --undo src/m.ts (or git checkout HEAD -- src/m.ts)",
      '    keep the change: gato eject src/m.ts --reason "<why>"',
      "  deleted   src/d.ts",
      "    revert: gato eject --undo src/d.ts (or git checkout HEAD -- src/d.ts)",
      '    keep the change: gato eject src/d.ts --reason "<why>"',
      "  ejected   src/e.ts (unchanged): custom login",
      "  stale     src/s.ts: no longer a GatoJS file; remove it from ejected in .wa/kit.json",
      "Before changing a GatoJS file, look for an extension point in EXTENSION_POINTS.md (when present).",
      "This is a warning for now; a later GatoJS release makes verify fail on these files.",
    ]);
  });

  it("prints deleted files in the order of the report", () => {
    const result = doctorFilesReport(
      report({ deleted: ["src/a.ts", "src/b.ts"] }),
      GATO,
    );
    expect(firstLineWith(result.lines, "src/a.ts")).toBeGreaterThanOrEqual(0);
    expect(firstLineWith(result.lines, "src/a.ts")).toBeLessThan(
      firstLineWith(result.lines, "src/b.ts"),
    );
  });
});

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function coreManifest(): ModuleManifest {
  return {
    name: "core",
    version: "0.1.0",
    description: "Core",
    requires: [],
    files: ["src/**"],
    dependencies: {},
    devDependencies: {},
    env: [],
    schemaRelations: [],
    compose: null,
    selfhostCompose: null,
    ciSteps: null,
    workspaces: [],
  };
}

function stateWith(ejected: KitState["ejected"] = {}): KitState {
  return {
    kitVersion: "0.1.0",
    kitRepo: "https://github.com/webamigos/wa-kit.git",
    kitFormat: 2,
    project: { name: "App", slug: "app" },
    locales: ["pl", "en"],
    modules: {
      core: {
        version: "0.1.0",
        manifest: coreManifest(),
        files: { "src/a.ts": sha256("x") },
      },
    },
    projectModules: {},
    ejected,
  };
}

async function writeProjectFile(
  dir: string,
  relative: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(join(dir, relative)), { recursive: true });
  await writeFile(join(dir, relative), content);
}

describe("doctorFiles", () => {
  let log: ReturnType<typeof vi.fn<(line: string) => void>>;

  beforeEach(() => {
    log = vi.fn<(line: string) => void>();
  });

  afterEach(async () => {
    await removeTempDirs();
  });

  function logged(): string {
    return log.mock.calls.map(([line]) => line).join("\n");
  }

  it("exits 0 by default with a modified Gato file and names it", async () => {
    const dir = await makeTempDir();
    await writeKitState(dir, stateWith());
    await writeProjectFile(dir, "src/a.ts", "y");
    const result = await doctorFiles({ projectDir: dir, cli: "gato", log });
    expect(result).toEqual({ exitCode: 0 });
    expect(logged()).toContain("src/a.ts");
    expect(logged()).toContain("gato eject");
  });

  it("exits 1 in block mode with a modified Gato file", async () => {
    const dir = await makeTempDir();
    await writeKitState(dir, stateWith());
    await writeProjectFile(dir, "src/a.ts", "y");
    const result = await doctorFiles({
      projectDir: dir,
      mode: "block",
      cli: "gato",
      log,
    });
    expect(result).toEqual({ exitCode: 1 });
  });

  it("exits 1 in block mode with a deleted Gato file", async () => {
    const dir = await makeTempDir();
    await writeKitState(dir, stateWith());
    const result = await doctorFiles({
      projectDir: dir,
      mode: "block",
      cli: "gato",
      log,
    });
    expect(result).toEqual({ exitCode: 1 });
    expect(logged()).toContain("src/a.ts");
  });

  it("exits 0 in block mode for an unchanged project and logs no changes", async () => {
    const dir = await makeTempDir();
    await writeKitState(dir, stateWith());
    await writeProjectFile(dir, "src/a.ts", "x");
    const result = await doctorFiles({
      projectDir: dir,
      mode: "block",
      cli: "gato",
      log,
    });
    expect(result).toEqual({ exitCode: 0 });
    expect(logged()).toContain("GatoJS files: no changes");
  });

  it("exits 0 in block mode when the modified file is ejected", async () => {
    const dir = await makeTempDir();
    await writeKitState(
      dir,
      stateWith({
        "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
      }),
    );
    await writeProjectFile(dir, "src/a.ts", "y");
    const result = await doctorFiles({
      projectDir: dir,
      mode: "block",
      cli: "gato",
      log,
    });
    expect(result).toEqual({ exitCode: 0 });
    expect(logged()).toContain("custom login");
  });

  it("uses the cli prefix it is given in logged next steps", async () => {
    const dir = await makeTempDir();
    await writeKitState(dir, stateWith());
    await writeProjectFile(dir, "src/a.ts", "y");
    await doctorFiles({ projectDir: dir, cli: "npm run wa --", log });
    expect(logged()).toContain("npm run wa -- eject --undo src/a.ts");
  });

  it("rejects instead of reporting deleted when a Gato path cannot be read", async () => {
    const dir = await makeTempDir();
    await writeKitState(dir, stateWith());
    await mkdir(join(dir, "src/a.ts"), { recursive: true });
    await expect(
      doctorFiles({ projectDir: dir, cli: "gato", log }),
    ).rejects.toMatchObject({ code: "EISDIR" });
    expect(logged()).not.toContain("src/a.ts");
  });

  it("logs (changed) for an ejected file whose content differs", async () => {
    const dir = await makeTempDir();
    await writeKitState(
      dir,
      stateWith({
        "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
      }),
    );
    await writeProjectFile(dir, "src/a.ts", "y");
    await doctorFiles({ projectDir: dir, cli: "gato", log });
    const line = log.mock.calls
      .map(([entry]) => entry)
      .find((entry) => entry.includes("src/a.ts"));
    expect(line).toContain("(changed)");
    expect(line).not.toContain("(unchanged)");
  });

  it("logs (unchanged) for an ejected file equal to the recorded hash", async () => {
    const dir = await makeTempDir();
    await writeKitState(
      dir,
      stateWith({
        "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
      }),
    );
    await writeProjectFile(dir, "src/a.ts", "x");
    await doctorFiles({ projectDir: dir, cli: "gato", log });
    const line = log.mock.calls
      .map(([entry]) => entry)
      .find((entry) => entry.includes("src/a.ts"));
    expect(line).toContain("(unchanged)");
  });

  it("rejects a directory without .wa/kit.json", async () => {
    const dir = await makeTempDir();
    await expect(
      doctorFiles({ projectDir: dir, cli: "gato", log }),
    ).rejects.toThrow("this is not a GatoJS project");
  });
});
