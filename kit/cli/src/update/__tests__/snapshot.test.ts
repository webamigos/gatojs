import { execFile } from "node:child_process";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  makeKitRepo,
  removeTempDirs,
} from "../../__tests__/helpers.js";
import { readKitSnapshot } from "../snapshot.js";

const run = promisify(execFile);
const names = { name: "My App", slug: "my-app", snake: "my_app" };

let kit: string;

beforeEach(async () => {
  kit = await makeKitRepo("kit");
});

afterEach(async () => {
  await removeTempDirs();
});

function text(
  snapshot: Awaited<ReturnType<typeof readKitSnapshot>>,
  path: string,
) {
  return snapshot.files.get(path)?.content.toString("utf8");
}

describe("readKitSnapshot", () => {
  it("zwraca wersję kitu i manifesty wybranych modułów w kolejności nazw", async () => {
    const snapshot = await readKitSnapshot(kit, ["demo", "core"], names);

    expect(snapshot.version).toBe("0.1.0");
    expect(snapshot.config.version).toBe("0.1.0");
    expect(snapshot.manifests.map((manifest) => manifest.name)).toEqual([
      "core",
      "demo",
    ]);
  });

  it("zawiera tylko pliki wybranych modułów bez plików kitu, generowanych i package-lock.json", async () => {
    const snapshot = await readKitSnapshot(kit, ["core", "demo"], names);

    expect([...snapshot.files.keys()].sort()).toEqual([
      ".env.example",
      ".wa/bin/wa.mjs",
      "docker-compose.yml",
      "package.json",
      "prisma/schema/auth.prisma",
      "prisma/schema/organizations.prisma",
      "src/features/auth/module.ts",
      "src/features/demo/compose.yml",
      "src/features/demo/env.ts",
      "src/features/demo/i18n/pl.json",
      "src/features/demo/module.ts",
      "src/i18n/config.ts",
      "src/shared/config/project.ts",
    ]);
  });

  it("pomija src/modules.generated.ts, docs/**, kit/** i package-lock.json", async () => {
    const snapshot = await readKitSnapshot(kit, ["core", "demo"], names);

    expect(snapshot.files.has("src/modules.generated.ts")).toBe(false);
    expect(snapshot.files.has("docs/readme.md")).toBe(false);
    expect(snapshot.files.has("kit/kit.json")).toBe(false);
    expect(snapshot.files.has("package-lock.json")).toBe(false);
  });

  it("nie zawiera plików modułu spoza listy", async () => {
    const snapshot = await readKitSnapshot(kit, ["core"], names);

    expect(snapshot.files.has("src/features/demo/module.ts")).toBe(false);
    expect(snapshot.manifests.map((manifest) => manifest.name)).toEqual([
      "core",
    ]);
  });

  it("podmienia placeholdery w project.ts na nazwy projektu", async () => {
    const snapshot = await readKitSnapshot(kit, ["core", "demo"], names);

    expect(text(snapshot, "src/shared/config/project.ts")).toBe(
      'export const project = {\n  name: "My App",\n  slug: "my-app",\n} as const;\n',
    );
  });

  it("zostawia bajt w bajt plik spoza placeholderFiles, nawet z tekstem placeholdera", async () => {
    await writeFile(
      join(kit, "src/features/auth/module.ts"),
      'export default { key: "auth", title: "WA App", slug: "wa-app", db: "wa_app" };\n',
    );
    await run("git", ["-C", kit, "add", "-A"]);

    const snapshot = await readKitSnapshot(kit, ["core", "demo"], names);

    expect(text(snapshot, "src/features/auth/module.ts")).toBe(
      'export default { key: "auth", title: "WA App", slug: "wa-app", db: "wa_app" };\n',
    );
    expect(text(snapshot, "src/features/demo/env.ts")).toBe(
      "export const envSchema = {};\n",
    );
  });

  it("package.json jest równy package.json projektu po create --modules demo z tej samej wersji", async () => {
    const snapshot = await readKitSnapshot(kit, ["core", "demo"], names);
    const project = await createProject("my-app", ["demo"]);

    expect(snapshot.files.get("package.json")?.content).toEqual(
      await readFile(join(project, "package.json")),
    );
  });

  it("package.json ma nazwę projektu i zależności wszystkich wybranych modułów", async () => {
    const snapshot = await readKitSnapshot(kit, ["core", "demo"], names);
    const packageJson = JSON.parse(text(snapshot, "package.json") ?? "");

    expect(packageJson.name).toBe("my-app");
    expect(packageJson.dependencies).toEqual({
      "left-pad": "^1.3.0",
      zod: "^4.3.6",
    });
  });

  it("package.json bez modułu demo nie ma jego zależności", async () => {
    const snapshot = await readKitSnapshot(kit, ["core"], names);
    const packageJson = JSON.parse(text(snapshot, "package.json") ?? "");

    expect(packageJson.dependencies).toEqual({ zod: "^4.3.6" });
  });

  it("mode pliku wykonywalnego to 0o755, a zwykłego 0o644", async () => {
    await chmod(join(kit, ".wa/bin/wa.mjs"), 0o755);
    await chmod(join(kit, "src/i18n/config.ts"), 0o644);
    await run("git", ["-C", kit, "add", "-A"]);

    const snapshot = await readKitSnapshot(kit, ["core", "demo"], names);

    expect(snapshot.files.get(".wa/bin/wa.mjs")?.mode).toBe(0o755);
    expect(snapshot.files.get("src/i18n/config.ts")?.mode).toBe(0o644);
  });

  it("moduł spoza kitu kończy się błędem z wersją kitu", async () => {
    await expect(
      readKitSnapshot(kit, ["core", "ghost"], names),
    ).rejects.toThrow("Moduł ghost nie istnieje w wa-kit 0.1.0");
  });
});
