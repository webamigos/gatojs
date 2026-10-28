import { join, resolve } from "node:path";
import type { KitState } from "../manifest/schema.js";
import type { Runner } from "../process/runner.js";
import { readKitConfig } from "./kit-config.js";

function isRemote(source: string): boolean {
  return source.includes("://") || source.startsWith("git@");
}

async function cloneKit(input: {
  url: string;
  version: string;
  runner: Runner;
  tmpDir: string;
}): Promise<string> {
  const target = join(input.tmpDir, "wa-kit");
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
        input.url,
        target,
      ],
      input.tmpDir,
    );
  } catch {
    throw new Error(
      `Nie udało się pobrać wa-kit v${input.version} z ${input.url}. Sprawdź dostęp (gh auth status) albo podaj --kit <ścieżka>`,
    );
  }
  return target;
}

export async function resolveKitSource(input: {
  kitFlag: string | null;
  envSource: string | undefined;
  state: KitState;
  runner: Runner;
  tmpDir: string;
}): Promise<string> {
  const { state } = input;
  const source = input.kitFlag ?? input.envSource ?? state.kitRepo;
  if (isRemote(source)) {
    return cloneKit({
      url: source,
      version: state.kitVersion,
      runner: input.runner,
      tmpDir: input.tmpDir,
    });
  }
  const kitDir = resolve(source);
  const config = await readKitConfig(kitDir);
  if (config.version !== state.kitVersion) {
    throw new Error(
      `Kit w ${kitDir} ma wersję ${config.version}, projekt używa ${state.kitVersion}`,
    );
  }
  return kitDir;
}
