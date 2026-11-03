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
        "clone",
        "--depth",
        "1",
        "--branch",
        `v${input.version}`,
        "--quiet",
        "--",
        input.source,
        target,
      ],
      input.tmpDir,
    );
  } catch {
    throw new Error(
      `Nie udało się pobrać wa-kit v${input.version} z ${input.source}. Sprawdź dostęp (gh auth status) albo podaj --kit <ścieżka>`,
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
      `Kit w ${target} ma wersję ${config.version}, oczekiwano ${input.version}`,
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
    throw new Error(`Nieprawidłowe źródło wa-kit: ${source}`);
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
      `Kit w ${source} ma wersję ${config.version}, projekt używa ${state.kitVersion}`,
    );
  }
  return source;
}
