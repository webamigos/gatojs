import { join, resolve } from "node:path";
import type { KitState } from "../manifest/schema.js";
import type { Runner } from "../process/runner.js";
import { readKitConfig } from "./kit-config.js";

const REMOTE_PREFIXES = ["https://", "ssh://", "file://", "git@"];

function isRemote(source: string): boolean {
  return REMOTE_PREFIXES.some((prefix) => source.startsWith(prefix));
}

function looksLikeTransport(source: string): boolean {
  return source.includes("://") || source.includes("::");
}

async function cloneKit(input: {
  source: string;
  version: string;
  runner: Runner;
  tmpDir: string;
  name: string;
}): Promise<string> {
  const target = join(input.tmpDir, input.name);
  try {
    await input.runner(
      "git",
      [
        "-c",
        "advice.detachedHead=false",
        "clone",
        ...(isRemote(input.source) ? ["--depth", "1"] : []),
        "--branch",
        `v${input.version}`,
        "--quiet",
        "--",
        input.source,
        target,
      ],
      input.tmpDir,
    );
  } catch (error) {
    throw new Error(
      `Could not fetch GatoJS v${input.version} from ${input.source}. Check access (gh auth status) or pass --kit <path>`,
      { cause: error },
    );
  }
  return target;
}

export async function cloneKitVersion(input: {
  source: string;
  version: string;
  runner: Runner;
  tmpDir: string;
  name: string;
}): Promise<string> {
  const target = await cloneKit(input);
  const config = await readKitConfig(target);
  if (config.version !== input.version) {
    throw new Error(
      `Kit in ${target} has version ${config.version}, expected ${input.version}`,
    );
  }
  return target;
}

export function kitSourceLocation(input: {
  kitFlag: string | null;
  envSource: string | undefined;
  state: KitState;
}): string {
  const source = input.kitFlag ?? input.envSource ?? input.state.kitRepo;
  if (
    source.startsWith("-") ||
    (!isRemote(source) && looksLikeTransport(source))
  ) {
    throw new Error(`Invalid kit source: ${source}`);
  }
  return isRemote(source) ? source : resolve(source);
}

export async function resolveKitSource(input: {
  kitFlag: string | null;
  envSource: string | undefined;
  state: KitState;
  runner: Runner;
  tmpDir: string;
}): Promise<string> {
  const { state } = input;
  const source = kitSourceLocation(input);
  if (isRemote(source)) {
    // WHY: dotychczasowy kontrakt nie sprawdza wersji zdalnego klonu; cloneKitVersion by to zmienił
    return cloneKit({
      source,
      version: state.kitVersion,
      runner: input.runner,
      tmpDir: input.tmpDir,
      name: "wa-kit",
    });
  }
  const config = await readKitConfig(source);
  if (config.version !== state.kitVersion) {
    throw new Error(
      `Kit in ${source} has version ${config.version}, the project uses ${state.kitVersion}`,
    );
  }
  return source;
}
