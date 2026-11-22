import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { UpdateArgs } from "../args.js";
import { fileHash } from "../assemble/hash.js";
import { readKitConfig } from "../kit/kit-config.js";
import { cloneKitVersion, kitSourceLocation } from "../kit/source.js";
import { moduleFiles } from "../assemble/resolve-modules.js";
import { compareCodePoint } from "../compare.js";
import { generate } from "../generate/index.js";
import { REGION_FILES } from "../generate/targets.js";
import {
  KIT_STATE_PATH,
  readKitState,
  writeKitState,
} from "../manifest/kit-state.js";
import type { KitState } from "../manifest/schema.js";
import type { Runner } from "../process/runner.js";
import { planUpdate } from "../update/plan.js";
import type { PlannedFile } from "../update/plan.js";
import { planReport, successHints } from "../update/report.js";
import { readKitSnapshot } from "../update/snapshot.js";
import type { KitSnapshot } from "../update/snapshot.js";
import { compareVersions } from "../update/version.js";
import { missingDirectories } from "./add.js";
import { insideProject, removeEmptyParents } from "./remove.js";

export type UpdateOptions = {
  projectDir: string;
  version: string;
  baseKitDir: string;
  targetKitDir: string;
  dryRun: boolean;
  install: boolean;
  runner: Runner;
  log: (line: string) => void;
};

const execFileAsync = promisify(execFile);
const UNDO_HINT =
  "Sprawdź git status; całość cofa: git restore . && git clean -fd";
const PERMISSION_BITS = 0o777;
const MANAGED = "managed";

export function checkVersions(
  current: string,
  target: string,
): "same" | "newer" {
  const order = compareVersions(target, current);
  if (order < 0) {
    throw new Error(
      `Projekt ma wa-kit ${current}, nowszą niż ${target}; wa update nie obniża wersji`,
    );
  }
  return order === 0 ? "same" : "newer";
}

export async function assertCleanTree(projectDir: string): Promise<void> {
  let status: string;
  try {
    ({ stdout: status } = await execFileAsync(
      "git",
      ["status", "--porcelain"],
      {
        cwd: projectDir,
      },
    ));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "Nie znaleziono polecenia git; zainstaluj git, żeby uruchomić wa update",
        { cause: error },
      );
    }
    throw new Error(
      `${projectDir} nie jest repozytorium git; wa update wymaga gita, żeby dało się cofnąć zmiany`,
      { cause: error },
    );
  }
  if (status !== "") {
    throw new Error(
      "Niezacommitowane zmiany w projekcie; zrób commit albo stash przed wa update",
    );
  }
}

function assertRequirementsInstalled(
  state: KitState,
  target: KitSnapshot,
): void {
  for (const manifest of target.manifests) {
    const missing = manifest.requires
      .filter((name) => !(name in state.modules))
      .sort(compareCodePoint);
    if (missing.length > 0) {
      throw new Error(
        `Moduł ${manifest.name} w wa-kit ${target.version} wymaga niezainstalowanych modułów: ${missing.join(", ")}`,
      );
    }
  }
}

async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function isSymlink(path: string): Promise<boolean | null> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writableInsideProject(
  projectDir: string,
  file: string,
): Promise<string> {
  const absolute = await insideProject(projectDir, file);
  let current = projectDir;
  for (const segment of relative(projectDir, absolute).split(sep)) {
    current = join(current, segment);
    const link = await isSymlink(current);
    if (link === null) {
      break;
    }
    if (link) {
      throw new Error(`Dowiązanie symboliczne na ścieżce zapisu: ${file}`);
    }
  }
  return absolute;
}

type Original = { path: string; content: Buffer; mode: number };
type Write = { file: PlannedFile; absolute: string };

async function rememberOriginal(absolute: string): Promise<Original | null> {
  const content = await readIfExists(absolute);
  if (!content) {
    return null;
  }
  const mode = (await stat(absolute)).mode & PERMISSION_BITS;
  return { path: absolute, content, mode };
}

async function applyWrite(
  projectDir: string,
  { file, absolute }: Write,
): Promise<void> {
  if (file.action === "usunięto") {
    await rm(absolute);
    await removeEmptyParents(projectDir, absolute);
    return;
  }
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, file.content as Buffer);
  await chmod(absolute, file.mode as number);
}

async function restoreOriginal(original: Original): Promise<void> {
  const current = await readIfExists(original.path);
  if (!current?.equals(original.content)) {
    // WHY: aktualizacja mogła zostawić plik tylko do odczytu; po usunięciu writeFile tworzy go od nowa
    await rm(original.path, { force: true });
    await mkdir(dirname(original.path), { recursive: true });
    await writeFile(original.path, original.content);
  }
  await chmod(original.path, original.mode);
}

async function rollbackUpdate(input: {
  projectDir: string;
  writes: Write[];
  originals: Map<string, Original>;
  createdDirectories: string[];
  log: (line: string) => void;
}): Promise<void> {
  const { projectDir, originals } = input;
  const steps = [
    ...input.writes.map(({ file, absolute }) => {
      const original = originals.get(absolute);
      return {
        path: file.path,
        run: () =>
          original ? restoreOriginal(original) : rm(absolute, { force: true }),
      };
    }),
    ...input.createdDirectories
      .filter((directory) => existsSync(join(projectDir, directory)))
      .map((directory) => ({
        path: directory,
        run: () => rmdir(join(projectDir, directory)),
      })),
    {
      path: KIT_STATE_PATH,
      run: () =>
        restoreOriginal(
          originals.get(join(projectDir, KIT_STATE_PATH)) as Original,
        ),
    },
  ];
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      const { code, message } = error as NodeJS.ErrnoException;
      input.log(`Nie udało się posprzątać: ${step.path} (${code ?? message})`);
    }
  }
}

function nextState(
  state: KitState,
  target: KitSnapshot,
  undecided: Set<string>,
): KitState {
  const paths = [...target.files.keys()];
  const modules = Object.fromEntries(
    target.manifests.map((manifest) => {
      const managed = Object.entries(state.modules[manifest.name].files).filter(
        ([path, hash]) =>
          hash === MANAGED && target.config.managedFiles.includes(path),
      );
      const files = Object.fromEntries([
        ...managed,
        ...moduleFiles(manifest, paths)
          .filter((path) => !undecided.has(path))
          .map((path) => [
            path,
            fileHash(
              path,
              (target.files.get(path) as { content: Buffer }).content,
              target.config,
            ),
          ]),
      ]);
      return [manifest.name, { version: manifest.version, manifest, files }];
    }),
  );
  return { ...state, kitVersion: target.version, modules };
}

async function writeUpdate(input: {
  projectDir: string;
  writes: Write[];
  state: KitState;
  log: (line: string) => void;
}): Promise<void> {
  const { projectDir, writes } = input;
  const kitStatePath = join(projectDir, KIT_STATE_PATH);
  const originals = new Map<string, Original>();
  for (const absolute of [
    ...writes.map((write) => write.absolute),
    kitStatePath,
  ]) {
    const original = await rememberOriginal(absolute);
    if (original) {
      originals.set(absolute, original);
    }
  }
  const createdDirectories = missingDirectories(
    projectDir,
    writes.map(({ file }) => file.path),
  );
  try {
    for (const write of writes) {
      await applyWrite(projectDir, write);
    }
    await writeKitState(projectDir, input.state);
  } catch (error) {
    await rollbackUpdate({
      projectDir,
      writes,
      originals,
      createdDirectories,
      log: input.log,
    });
    throw new Error(`${(error as Error).message}\n${UNDO_HINT}`, {
      cause: error,
    });
  }
}

export async function update(
  options: UpdateOptions,
): Promise<{ exitCode: 0 | 1 }> {
  const { projectDir, version, runner, log } = options;
  const state = await readKitState(projectDir);
  if (checkVersions(state.kitVersion, version) === "same") {
    log(`Projekt ma już wa-kit ${version}`);
    return { exitCode: 0 };
  }
  if (!options.dryRun) {
    await assertCleanTree(projectDir);
  }
  const names = {
    name: state.project.name,
    slug: state.project.slug,
    snake: state.project.slug.replaceAll("-", "_"),
  };
  const modules = Object.keys(state.modules);
  const base = await readKitSnapshot(options.baseKitDir, modules, names);
  const target = await readKitSnapshot(options.targetKitDir, modules, names);
  if (target.version !== version) {
    throw new Error(
      `Kit docelowy ma wersję ${target.version}, oczekiwano ${version}`,
    );
  }
  assertRequirementsInstalled(state, target);
  const recordedHashes = Object.assign(
    {},
    ...Object.values(state.modules).map((entry) => entry.files),
  ) as Record<string, string>;
  const plan = await planUpdate({
    base,
    target,
    recordedHashes,
    readProject: async (path) =>
      readIfExists(await insideProject(projectDir, path)),
  });
  const report = planReport({
    plan,
    from: state.kitVersion,
    to: version,
    dryRun: options.dryRun,
  });
  if (options.dryRun) {
    report.forEach((line) => log(line));
    return { exitCode: 0 };
  }

  for (const path of [
    KIT_STATE_PATH,
    ...target.config.generatedFiles,
    ...REGION_FILES,
  ]) {
    await writableInsideProject(projectDir, path);
  }
  const writes: Write[] = [];
  for (const file of plan.files) {
    if (file.content || file.action === "usunięto") {
      writes.push({
        file,
        absolute: await writableInsideProject(projectDir, file.path),
      });
    }
  }
  const undecided = new Set(
    plan.files
      .filter((file) => file.action === "do decyzji")
      .map((file) => file.path),
  );
  await writeUpdate({
    projectDir,
    writes,
    state: nextState(state, target, undecided),
    log,
  });
  report.forEach((line) => log(line));

  if (plan.files.some((file) => file.action === "konflikt")) {
    log("Rozwiąż konflikty, potem: npm run wa -- generate && npm install");
    log("Cofnięcie całej aktualizacji: git restore . && git clean -fd");
    return { exitCode: 1 };
  }
  try {
    await generate(projectDir);
  } catch (error) {
    throw new Error(
      `Zaktualizowano do wa-kit ${version}, ale wa generate się nie powiódł. Uruchom: npm run wa -- generate`,
      { cause: error },
    );
  }
  successHints(base, target).forEach((line) => log(line));
  if (options.install) {
    try {
      await runner("npm", ["install"], projectDir);
    } catch (error) {
      throw new Error(
        `Zaktualizowano do wa-kit ${version}, ale npm install się nie powiódł. Uruchom: npm install`,
        { cause: error },
      );
    }
  }
  return { exitCode: undecided.size > 0 ? 1 : 0 };
}

async function bundleKitVersion(bundleKitDir: string): Promise<string | null> {
  if (!existsSync(join(bundleKitDir, "kit", "kit.json"))) {
    return null;
  }
  return (await readKitConfig(bundleKitDir)).version;
}

async function delegateToTarget(input: {
  projectDir: string;
  args: UpdateArgs;
  source: string;
  targetKitDir: string;
  runner: Runner;
}): Promise<{ exitCode: 0 | 1 }> {
  const { args, targetKitDir } = input;
  const flags = [
    ...(args.dryRun ? ["--dry-run"] : []),
    ...(args.install ? [] : ["--no-install"]),
  ];
  try {
    await input.runner(
      "node",
      [
        join(targetKitDir, ".wa/bin/wa.mjs"),
        "update",
        args.version,
        "--from-kit",
        targetKitDir,
        "--kit",
        input.source,
        ...flags,
      ],
      input.projectDir,
    );
  } catch (error) {
    const { code, message } = error as NodeJS.ErrnoException;
    if (typeof code === "string") {
      throw new Error(
        `Nie udało się uruchomić bundla wa-kit ${args.version}: ${message}`,
        { cause: error },
      );
    }
    // WHY: proces potomny wypisał już swój błąd; jego kod wyjścia staje się kodem komendy
    return { exitCode: 1 };
  }
  return { exitCode: 0 };
}

export async function updateFromSource(options: {
  projectDir: string;
  args: UpdateArgs;
  envSource: string | undefined;
  bundleKitDir: string;
  runner: Runner;
  log: (line: string) => void;
  tmpRoot: string;
}): Promise<{ exitCode: 0 | 1 }> {
  const { projectDir, args, runner } = options;
  const state = await readKitState(projectDir);
  if (checkVersions(state.kitVersion, args.version) === "same") {
    options.log(`Projekt ma już wa-kit ${args.version}`);
    return { exitCode: 0 };
  }
  if (!args.dryRun) {
    await assertCleanTree(projectDir);
  }
  const source = kitSourceLocation({
    kitFlag: args.kit,
    envSource: options.envSource,
    state,
  });
  const bundleVersion =
    args.fromKit === null ? await bundleKitVersion(options.bundleKitDir) : null;
  if (bundleVersion !== null && bundleVersion !== args.version) {
    throw new Error(
      `Bundel pochodzi z wa-kit ${bundleVersion}, a aktualizacja prowadzi do ${args.version}`,
    );
  }
  const tmpDir = await mkdtemp(join(options.tmpRoot, "wa-update-"));
  try {
    const clone = (version: string, name: string) =>
      cloneKitVersion({ source, version, runner, tmpDir, name });
    if (args.fromKit === null && bundleVersion === null) {
      return await delegateToTarget({
        projectDir,
        args,
        source,
        targetKitDir: await clone(args.version, "target"),
        runner,
      });
    }
    const targetKitDir =
      args.fromKit === null
        ? await clone(args.version, "target")
        : resolve(args.fromKit);
    return await update({
      projectDir,
      version: args.version,
      baseKitDir: await clone(state.kitVersion, "base"),
      targetKitDir,
      dryRun: args.dryRun,
      install: args.install,
      runner,
      log: options.log,
    });
  } finally {
    await rm(tmpDir, { recursive: true });
  }
}
