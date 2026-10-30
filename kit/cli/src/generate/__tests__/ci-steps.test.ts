import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generate } from "../index.js";

const tmpDirs: string[] = [];

const CI_YML = [
  "jobs:",
  "  integration:",
  "    steps:",
  "      - name: Install dependencies",
  "        run: npm ci",
  "",
  "      # wa:ci-integration:start",
  "      # wa:ci-integration:end",
  "",
  "      - name: Integration tests",
  "        run: npm run test:integration",
  "",
].join("\n");

async function put(dir: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), content);
}

async function makeProject(
  modules: Record<
    string,
    { ciSteps?: string; env?: { name: string; example: string }[] }
  >,
  ciYml: string = CI_YML,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wa-ci-steps-"));
  tmpDirs.push(dir);
  const entries = Object.fromEntries(
    Object.entries(modules).map(([name, spec]) => [
      name,
      {
        version: "1.0.0",
        manifest: {
          name,
          version: "1.0.0",
          description: name,
          ciSteps: spec.ciSteps ?? null,
          env: spec.env ?? [],
        },
        files: {},
      },
    ]),
  );
  await put(
    dir,
    ".wa/kit.json",
    JSON.stringify({ kitVersion: "0.0.0", locales: ["pl"], modules: entries }),
  );
  await put(dir, ".github/workflows/ci.yml", ciYml);
  return dir;
}

async function readCi(dir: string): Promise<string> {
  return readFile(join(dir, ".github/workflows/ci.yml"), "utf8");
}

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("generate: region ci-integration", () => {
  it("moduł bez ciSteps zostawia ci.yml bez zmian", async () => {
    const dir = await makeProject({ alpha: {} });
    await generate(dir);
    expect(await readCi(dir)).toBe(CI_YML);
  });

  it("dwa kroki z pliku ciSteps trafiają do regionu z wcięciem 6 spacji", async () => {
    const dir = await makeProject({
      uploads: { ciSteps: "ci/uploads.integration-steps.yml" },
    });
    await put(
      dir,
      "ci/uploads.integration-steps.yml",
      [
        "- name: Start storage",
        "  run: docker compose up -d minio",
        "- name: Wait for storage",
        "  run: ./wait.sh",
        "",
      ].join("\n"),
    );
    await generate(dir);
    expect(await readCi(dir)).toBe(
      [
        "jobs:",
        "  integration:",
        "    steps:",
        "      - name: Install dependencies",
        "        run: npm ci",
        "",
        "      # wa:ci-integration:start",
        "      - name: Start storage",
        "        run: docker compose up -d minio",
        "      - name: Wait for storage",
        "        run: ./wait.sh",
        "      # wa:ci-integration:end",
        "",
        "      - name: Integration tests",
        "        run: npm run test:integration",
        "",
      ].join("\n"),
    );
  });

  it("fragment czytany z katalogu projektu, nie z kitu", async () => {
    const dir = await makeProject({ uploads: { ciSteps: "ci/steps.yml" } });
    await put(dir, "ci/steps.yml", "- run: from-project\n");
    await put(dir, "kit/ci/steps.yml", "- run: from-kit\n");
    await generate(dir);
    const ci = await readCi(dir);
    expect(ci).toContain("      - run: from-project\n");
    expect(ci).not.toContain("from-kit");
  });

  it("dwa moduły: fragmenty w kolejności modułów oddzielone pustą linią", async () => {
    const dir = await makeProject({
      alpha: { ciSteps: "ci/alpha.yml" },
      beta: { ciSteps: "ci/beta.yml" },
    });
    await put(dir, "ci/alpha.yml", "- run: alpha\n\n");
    await put(dir, "ci/beta.yml", "- run: beta\n");
    await generate(dir);
    expect(await readCi(dir)).toContain(
      "      # wa:ci-integration:start\n      - run: alpha\n\n      - run: beta\n      # wa:ci-integration:end\n",
    );
  });

  it("pusta linia wewnątrz fragmentu nie dostaje wcięcia", async () => {
    const dir = await makeProject({ alpha: { ciSteps: "ci/alpha.yml" } });
    await put(dir, "ci/alpha.yml", "- run: a\n\n- run: b\n");
    await generate(dir);
    expect(await readCi(dir)).toContain(
      "      - run: a\n\n      - run: b\n      # wa:ci-integration:end",
    );
  });

  it("brak pliku ciSteps wskazanego w manifeście → błąd", async () => {
    const dir = await makeProject({ alpha: { ciSteps: "ci/missing.yml" } });
    await expect(generate(dir)).rejects.toThrow();
  });

  it("drugie generate nie zmienia wyniku", async () => {
    const dir = await makeProject({ alpha: { ciSteps: "ci/alpha.yml" } });
    await put(dir, "ci/alpha.yml", "- run: a\n");
    await generate(dir);
    const first = await readCi(dir);
    await generate(dir);
    expect(await readCi(dir)).toBe(first);
  });
});

const CI_YML_WITHOUT_MARKERS = [
  "jobs:",
  "  integration:",
  "    steps:",
  "      - name: Install dependencies",
  "        run: npm ci",
  "",
  "      - name: Integration tests",
  "        run: npm run test:integration",
  "",
].join("\n");

const CI_YML_ONLY_START = [
  "jobs:",
  "  integration:",
  "    steps:",
  "      # wa:ci-integration:start",
  "      - name: Integration tests",
  "        run: npm run test:integration",
  "",
].join("\n");

const CI_YML_ONLY_END = [
  "jobs:",
  "  integration:",
  "    steps:",
  "      - name: Integration tests",
  "        run: npm run test:integration",
  "      # wa:ci-integration:end",
  "",
].join("\n");

async function snapshotDir(dir: string): Promise<Record<string, string>> {
  const entries = await readdir(dir, { recursive: true });
  const snapshot: Record<string, string> = {};
  for (const entry of entries.sort()) {
    const full = join(dir, entry);
    if ((await stat(full)).isFile())
      snapshot[entry] = await readFile(full, "utf8");
  }
  return snapshot;
}

describe("generate: plik bez markerów regionu", () => {
  it("ci.yml bez markerów i bez ciSteps → sukces, ci.yml bajt w bajt bez zmian", async () => {
    const dir = await makeProject({ alpha: {} }, CI_YML_WITHOUT_MARKERS);

    const { changed } = await generate(dir);

    expect(await readCi(dir)).toBe(CI_YML_WITHOUT_MARKERS);
    expect(changed).not.toContain(".github/workflows/ci.yml");
  });

  it("ci.yml bez markerów i bez ciSteps → pozostałe pliki generowane jak zwykle", async () => {
    const dir = await makeProject({ alpha: {} }, CI_YML_WITHOUT_MARKERS);

    const { changed } = await generate(dir);

    expect(changed).toContain("src/modules.generated.ts");
    expect(changed).toContain("src/modules.client.generated.ts");
    expect(changed).toContain("src/i18n/locales.generated.ts");
    expect(
      await readFile(join(dir, "src/modules.generated.ts"), "utf8"),
    ).toContain('import alphaModule from "@/features/alpha/module";');
  });

  it("ci.yml bez markerów, a moduł ma ciSteps → błąd brak regionu i żaden plik nie zmieniony", async () => {
    const dir = await makeProject(
      { uploads: { ciSteps: "ci/steps.yml" } },
      CI_YML_WITHOUT_MARKERS,
    );
    await put(dir, "ci/steps.yml", "- run: storage\n");
    const snap = await snapshotDir(dir);

    await expect(generate(dir)).rejects.toThrow(
      ".github/workflows/ci.yml: brak regionu wa:ci-integration; dodaj linie ze znacznikami wa:ci-integration:start i wa:ci-integration:end",
    );
    expect(await snapshotDir(dir)).toEqual(snap);
  });

  it("ci.yml tylko ze znacznikiem start i bez ciSteps → błąd uszkodzony region", async () => {
    const dir = await makeProject({ alpha: {} }, CI_YML_ONLY_START);
    const snap = await snapshotDir(dir);

    await expect(generate(dir)).rejects.toThrow(
      ".github/workflows/ci.yml: uszkodzony region wa:ci-integration",
    );
    expect(await snapshotDir(dir)).toEqual(snap);
  });

  it("ci.yml tylko ze znacznikiem end i bez ciSteps → błąd uszkodzony region", async () => {
    const dir = await makeProject({ alpha: {} }, CI_YML_ONLY_END);

    await expect(generate(dir)).rejects.toThrow(
      ".github/workflows/ci.yml: uszkodzony region wa:ci-integration",
    );
    expect(await readCi(dir)).toBe(CI_YML_ONLY_END);
  });

  it("ci.yml tylko ze znacznikiem start, a moduł ma ciSteps → błąd uszkodzony region", async () => {
    const dir = await makeProject(
      { uploads: { ciSteps: "ci/steps.yml" } },
      CI_YML_ONLY_START,
    );
    await put(dir, "ci/steps.yml", "- run: storage\n");

    await expect(generate(dir)).rejects.toThrow(
      ".github/workflows/ci.yml: uszkodzony region wa:ci-integration",
    );
    expect(await readCi(dir)).toBe(CI_YML_ONLY_START);
  });

  it(".env.example bez wa:modules i bez zmiennych modułów → sukces, plik bez zmian", async () => {
    const dir = await makeProject({ alpha: {} });
    await put(dir, ".env.example", "DATABASE_URL=x\n");

    const { changed } = await generate(dir);

    expect(await readFile(join(dir, ".env.example"), "utf8")).toBe(
      "DATABASE_URL=x\n",
    );
    expect(changed).not.toContain(".env.example");
  });

  it(".env.example bez wa:modules, a moduł ma zmienną → błąd brak regionu i żaden plik nie zmieniony", async () => {
    const dir = await makeProject({
      alpha: { env: [{ name: "ALPHA_TOKEN", example: "changeme" }] },
    });
    await put(dir, ".env.example", "DATABASE_URL=x\n");
    const snap = await snapshotDir(dir);

    await expect(generate(dir)).rejects.toThrow(
      ".env.example: brak regionu wa:modules; dodaj linie ze znacznikami wa:modules:start i wa:modules:end",
    );
    expect(await snapshotDir(dir)).toEqual(snap);
  });
});
