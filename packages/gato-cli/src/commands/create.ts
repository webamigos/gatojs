import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseLocales } from "../args.js";
import type { Locale } from "../args.js";
import { copyFiles } from "../assemble/copy.js";
import {
  projectPackageJson,
  withCliDependency,
} from "../assemble/package-json.js";
import { projectNames } from "../assemble/project-names.js";
import type { ProjectNames } from "../assemble/project-names.js";
import { moduleFiles, resolveModules } from "../assemble/resolve-modules.js";
import { generate } from "../generate/index.js";
import { assemblableFiles } from "../kit/files.js";
import { readKitConfig, readKitManifests } from "../kit/kit-config.js";
import type { KitConfig } from "../kit/kit-config.js";
import { writeKitState } from "../manifest/kit-state.js";
import type { ModuleManifest } from "../manifest/schema.js";
import type { Prompter, SelectChoice } from "../process/prompter.js";
import type { Runner } from "../process/runner.js";

export type CreateOptions = {
  target: string;
  kitDir: string;
  modules: string[] | null;
  locales: Locale[] | null;
  title: string | null;
  adminEmail: string | null;
  yes: boolean;
  setup: boolean;
  install: boolean;
  git: boolean;
  cliSource?: string | null;
  cliDependency?: string | null;
  runner: Runner;
  prompter: Prompter;
  log: (line: string) => void;
};

type Answers = {
  modules: string[];
  locales: Locale[];
  title: string | null;
  adminEmail: string | null;
  setup: boolean;
};

const DEFAULT_LOCALES = "pl,en";
const SETUP_QUESTION = "Uruchomić bazę, migrację i admin:create teraz? [t/N]";

async function isNonEmptyDirectory(dir: string): Promise<boolean> {
  if (!existsSync(dir)) {
    return false;
  }
  return (await readdir(dir)).length > 0;
}

const LOCALE_CHOICES: SelectChoice[] = [
  { value: "pl", label: "pl", checked: true, locked: true },
  { value: "en", label: "en", checked: true },
];

function moduleChoices(manifests: ModuleManifest[]): SelectChoice[] {
  return manifests
    .filter((manifest) => manifest.name !== "core")
    .map((manifest) => ({
      value: manifest.name,
      label: `${manifest.name} — ${manifest.description}`,
    }));
}

async function collectAnswers(
  options: CreateOptions,
  manifests: ModuleManifest[],
  names: ProjectNames,
): Promise<Answers> {
  const { prompter, yes } = options;
  let modules = options.modules ?? [];
  const choices = moduleChoices(manifests);
  if (options.modules === null && !yes && choices.length > 0) {
    modules = await prompter.select("Moduły", choices);
  }
  let locales = options.locales ?? parseLocales(DEFAULT_LOCALES);
  if (options.locales === null && !yes) {
    locales = parseLocales(
      (await prompter.select("Języki", LOCALE_CHOICES)).join(","),
    );
  }
  let title = options.title;
  if (title === null && !yes) {
    title = await prompter.ask("Nazwa wyświetlana", names.name);
  }
  let adminEmail = options.adminEmail;
  if (adminEmail === null && !yes) {
    const answer = await prompter.ask("Email admina (puste = pomiń)", "");
    adminEmail = answer === "" ? null : answer;
  }
  let setup = options.setup;
  if (!setup && !yes && options.install) {
    setup = await prompter.confirm(SETUP_QUESTION, false);
  }
  return { modules, locales, title, adminEmail, setup };
}

async function removeDirectoryContents(dir: string): Promise<void> {
  for (const entry of await readdir(dir)) {
    await rm(join(dir, entry), { recursive: true });
  }
}

async function discardAssembly(dir: string, existed: boolean): Promise<void> {
  if (existed) {
    await removeDirectoryContents(dir);
  } else {
    await rm(dir, { recursive: true });
  }
}

async function assemble(input: {
  options: CreateOptions;
  projectDir: string;
  config: KitConfig;
  manifests: ModuleManifest[];
  names: ProjectNames;
  locales: Locale[];
}): Promise<void> {
  const { options, projectDir, config, manifests, names, locales } = input;
  const available = await assemblableFiles(options.kitDir, config);
  const modules: Record<
    string,
    { version: string; manifest: ModuleManifest; files: Record<string, string> }
  > = {};
  for (const manifest of manifests) {
    const files = await copyFiles({
      kitDir: options.kitDir,
      projectDir,
      files: moduleFiles(manifest, available),
      config,
      names,
    });
    modules[manifest.name] = { version: manifest.version, manifest, files };
  }
  const packageJsonPath = join(projectDir, "package.json");
  await writeFile(
    packageJsonPath,
    withCliDependency(
      projectPackageJson(
        await readFile(packageJsonPath, "utf8"),
        manifests,
        names,
      ),
      options.cliDependency ?? null,
    ),
  );
  await writeKitState(projectDir, {
    kitVersion: config.version,
    kitRepo: config.repo,
    project: { name: names.name, slug: names.slug },
    locales,
    modules,
    projectModules: {},
  });
  await generate(projectDir);
}

async function writeEnvFile(
  projectDir: string,
  adminEmail: string | null,
): Promise<void> {
  const example = await readFile(join(projectDir, ".env.example"), "utf8");
  const secret = randomBytes(32).toString("base64url");
  let env = example.replace(
    /^BETTER_AUTH_SECRET=.*/m,
    () => `BETTER_AUTH_SECRET=${secret}`,
  );
  if (adminEmail !== null) {
    env = env.replace(/^ADMIN_EMAIL=.*/m, () => `ADMIN_EMAIL=${adminEmail}`);
  }
  const envPath = join(projectDir, ".env");
  await writeFile(envPath, env, { mode: 0o600 });
  await chmod(envPath, 0o600);
}

async function commitInitial(
  options: CreateOptions,
  projectDir: string,
  version: string,
): Promise<void> {
  const { runner, log } = options;
  try {
    await runner("git", ["add", "-A"], projectDir);
    await runner(
      "git",
      [
        "commit",
        "-q",
        "--no-verify",
        "-m",
        `chore: initial commit from wa-kit v${version}`,
      ],
      projectDir,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      `Uwaga: nie utworzono commita (${message}). Skonfiguruj git i zrób commit ręcznie.`,
    );
  }
}

async function runSetup(
  options: CreateOptions,
  projectDir: string,
  adminEmail: string | null,
): Promise<void> {
  const { runner } = options;
  await runner("docker", ["compose", "up", "-d", "--wait"], projectDir);
  await runner(
    "npx",
    ["prisma", "migrate", "dev", "--name", "init"],
    projectDir,
  );
  if (adminEmail !== null) {
    await runner(
      "npm",
      ["run", "admin:create", "--", "--email", adminEmail],
      projectDir,
    );
  }
}

function logNextSteps(
  log: (line: string) => void,
  projectDir: string,
  setup: boolean,
  adminEmail: string | null,
): void {
  log(`cd ${projectDir}`);
  if (!setup) {
    log("docker compose up -d");
    log("npx prisma migrate dev --name init");
    log(`npm run admin:create -- --email ${adminEmail ?? "twój-email"}`);
  }
  log("npm run dev");
}

export async function create(
  options: CreateOptions,
): Promise<{ projectDir: string; modules: string[] }> {
  const projectDir = resolve(options.target);
  if (options.cliSource && !existsSync(options.cliSource)) {
    throw new Error(`--cli-source: ${options.cliSource} does not exist`);
  }
  const names = projectNames(projectDir, options.title);
  const existed = existsSync(projectDir);
  if (await isNonEmptyDirectory(projectDir)) {
    throw new Error(`Katalog ${projectDir} istnieje i nie jest pusty`);
  }
  if (!existsSync(join(options.kitDir, "kit/kit.json"))) {
    throw new Error("Uruchom create z klonu wa-kit albo podaj --kit <ścieżka>");
  }
  const config = await readKitConfig(options.kitDir);
  const available = await readKitManifests(options.kitDir);
  const answers = await collectAnswers(options, available, names);
  const runSetupSteps = options.install && answers.setup;
  const resolved = resolveModules(answers.modules, available);
  const finalNames = projectNames(projectDir, answers.title);

  if (await isNonEmptyDirectory(projectDir)) {
    throw new Error(`Katalog ${projectDir} istnieje i nie jest pusty`);
  }
  await mkdir(projectDir, { recursive: true });
  try {
    await assemble({
      options,
      projectDir,
      config,
      manifests: resolved,
      names: finalNames,
      locales: answers.locales,
    });
  } catch (error) {
    await discardAssembly(projectDir, existed).catch(() => undefined);
    throw error;
  }
  await writeEnvFile(projectDir, answers.adminEmail);

  if (options.git) {
    await options.runner("git", ["init", "-q"], projectDir);
  }
  if (options.install) {
    try {
      await options.runner("npm", ["install"], projectDir);
    } catch {
      throw new Error(
        `Projekt utworzony w ${projectDir}, ale npm install się nie powiódł. Uruchom: cd ${projectDir} && npm install`,
      );
    }
  }
  if (options.git) {
    await commitInitial(options, projectDir, config.version);
  }
  if (runSetupSteps) {
    await runSetup(options, projectDir, answers.adminEmail);
  }
  logNextSteps(options.log, projectDir, runSetupSteps, answers.adminEmail);
  return { projectDir, modules: resolved.map((manifest) => manifest.name) };
}
