import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  modules: Record<string, { ciSteps?: string }>,
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
  await put(dir, ".github/workflows/ci.yml", CI_YML);
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
