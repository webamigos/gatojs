import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { GENERATED_FILES, generate } from "../generate/index.js";
import { REGION_FILES } from "../generate/targets.js";
import { resolveKitSource } from "../kit/source.js";
import {
  KIT_STATE_PATH,
  readKitState,
  writeKitState,
} from "../manifest/kit-state.js";
import type { KitState } from "../manifest/schema.js";
import type { Runner } from "../process/runner.js";
import { readKitSnapshot } from "../update/snapshot.js";
import { recordedHashes } from "../doctor/files.js";
import { insideProject } from "./remove.js";
import { rememberOriginal, restoreOriginal } from "./update.js";

const REASON_REQUIRED = 'Specify why the file is ejected: --reason "<why>"';

async function gatoFilePath(
  projectDir: string,
  file: string,
  state: KitState,
): Promise<string> {
  const absolute = await insideProject(projectDir, file);
  const path = relative(resolve(projectDir), absolute).split(sep).join("/");
  if (GENERATED_FILES.includes(path)) {
    throw new Error(
      `${path} is generated; change the manifest or module files and run npm run wa -- generate`,
    );
  }
  const hash = recordedHashes(state).get(path);
  if (hash === "managed") {
    throw new Error(
      `${path} is managed by GatoJS (wa update merges it); it needs no eject`,
    );
  }
  if (hash === "seed") {
    throw new Error(
      `${path} is a seed file owned by the project; it needs no eject`,
    );
  }
  if (hash === undefined) {
    throw new Error(`${path} is a project file; it needs no eject`);
  }
  return path;
}

export async function eject(options: {
  projectDir: string;
  file: string;
  reason: string;
  now: () => Date;
  log: (line: string) => void;
}): Promise<void> {
  const { projectDir } = options;
  const state = await readKitState(projectDir);
  const path = await gatoFilePath(projectDir, options.file, state);
  const existing = state.ejected[path];
  if (existing !== undefined) {
    throw new Error(
      `${path} is already ejected ("${existing.reason}"); edit its reason in .wa/kit.json`,
    );
  }
  const reason = options.reason.trim();
  if (reason === "") {
    throw new Error(REASON_REQUIRED);
  }
  await writeKitState(projectDir, {
    ...state,
    ejected: {
      ...state.ejected,
      [path]: { reason, ejectedAt: options.now().toISOString().slice(0, 10) },
    },
  });
  options.log(
    `Ejected ${path}; wa update will merge it instead of replacing it`,
  );
}

export async function undoEject(options: {
  projectDir: string;
  file: string;
  kitDir: string;
  log: (line: string) => void;
}): Promise<void> {
  const { projectDir } = options;
  const state = await readKitState(projectDir);
  const path = await gatoFilePath(projectDir, options.file, state);
  const snapshot = await readKitSnapshot(
    options.kitDir,
    Object.keys(state.modules),
    {
      name: state.project.name,
      slug: state.project.slug,
      snake: state.project.slug.replaceAll("-", "_"),
    },
  );
  const kitFile = snapshot.files.get(path);
  if (kitFile === undefined) {
    throw new Error(`${path} is not in GatoJS ${state.kitVersion}`);
  }
  const absolute = await insideProject(projectDir, path);
  const originalFile = await rememberOriginal(absolute);
  const originalState = await rememberOriginal(
    join(projectDir, KIT_STATE_PATH),
  );
  const ejected = Object.fromEntries(
    Object.entries(state.ejected).filter(([entry]) => entry !== path),
  );
  try {
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, kitFile.content);
    await chmod(absolute, kitFile.mode);
    await writeKitState(projectDir, { ...state, ejected });
    if (REGION_FILES.includes(path)) {
      await generate(projectDir);
    }
  } catch (error) {
    await (originalFile
      ? restoreOriginal(originalFile)
      : rm(absolute, { force: true }));
    if (originalState) {
      await restoreOriginal(originalState);
    }
    throw error;
  }
  options.log(`Restored ${path} from GatoJS ${state.kitVersion}`);
}

export async function undoEjectFromSource(options: {
  projectDir: string;
  file: string;
  kitFlag: string | null;
  envSource: string | undefined;
  runner: Runner;
  tmpDir: string;
  log: (line: string) => void;
}): Promise<void> {
  const state = await readKitState(options.projectDir);
  const kitDir = await resolveKitSource({
    kitFlag: options.kitFlag,
    envSource: options.envSource,
    state,
    runner: options.runner,
    tmpDir: options.tmpDir,
  });
  await undoEject({
    projectDir: options.projectDir,
    file: options.file,
    kitDir,
    log: options.log,
  });
}
