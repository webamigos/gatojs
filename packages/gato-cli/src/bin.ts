import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  parseAddArgs,
  parseCreateArgs,
  parseListArgs,
  parseRemoveArgs,
  parseUpdateArgs,
} from "./args.js";
import { addFromSource } from "./commands/add.js";
import { create } from "./commands/create.js";
import { readlinePrompter } from "./process/prompter.js";
import { spawnRunner } from "./process/runner.js";
import { kitSync } from "./commands/kit-sync.js";
import { generate } from "./generate/index.js";
import { list } from "./commands/list.js";
import { remove } from "./commands/remove.js";
import { updateFromSource } from "./commands/update.js";
import { readKitManifests } from "./kit/kit-config.js";
import { resolveKitSource } from "./kit/source.js";
import { readKitState } from "./manifest/kit-state.js";
import {
  createKitDir,
  kitSourceFromEnv,
  runMetaCommand,
  type CliIdentity,
} from "./cli.js";

declare const __CLI_NAME__: CliIdentity["name"];
declare const __CLI_VERSION__: string;

const identity: CliIdentity = { name: __CLI_NAME__, version: __CLI_VERSION__ };

async function listCommand(kit: string | null): Promise<void> {
  const projectDir = process.cwd();
  const state = await readKitState(projectDir);
  const tmpDir = await mkdtemp(join(tmpdir(), "wa-list-"));
  try {
    let available: Awaited<ReturnType<typeof readKitManifests>> | null = null;
    let availableError: string | null = null;
    try {
      const kitDir = await resolveKitSource({
        kitFlag: kit,
        envSource: kitSourceFromEnv(process.env),
        state,
        runner: spawnRunner,
        tmpDir,
      });
      available = await readKitManifests(kitDir);
    } catch (error) {
      availableError = error instanceof Error ? error.message : String(error);
    }
    list({ state, available, availableError, log: console.log });
  } finally {
    await rm(tmpDir, { recursive: true });
  }
}

function bundleKitDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

async function main(argv: string[]): Promise<number> {
  const meta = runMetaCommand(argv, identity);
  if (meta !== null) {
    if (meta.stdout !== null) {
      console.log(meta.stdout);
    }
    if (meta.stderr !== null) {
      console.error(meta.stderr);
    }
    return meta.exitCode;
  }
  const [command] = argv;
  if (command === "kit") {
    const { changed } = await kitSync(process.cwd());
    console.log(changed ? "Zaktualizowano .wa/kit.json" : "Bez zmian");
    return 0;
  }
  if (command === "add") {
    const { module, kit, install } = parseAddArgs(argv.slice(1));
    await addFromSource({
      projectDir: process.cwd(),
      module,
      kitFlag: kit,
      envSource: kitSourceFromEnv(process.env),
      install,
      runner: spawnRunner,
      log: console.log,
      tmpRoot: tmpdir(),
    });
    return 0;
  }
  if (command === "remove") {
    const { module, force, install } = parseRemoveArgs(argv.slice(1));
    await remove({
      projectDir: process.cwd(),
      module,
      force,
      install,
      runner: spawnRunner,
      log: console.log,
    });
    return 0;
  }
  if (command === "list") {
    await listCommand(parseListArgs(argv.slice(1)).kit);
    return 0;
  }
  if (command === "update") {
    const { exitCode } = await updateFromSource({
      projectDir: process.cwd(),
      args: parseUpdateArgs(argv.slice(1)),
      envSource: kitSourceFromEnv(process.env),
      bundleKitDir: bundleKitDir(),
      runner: spawnRunner,
      log: console.log,
      tmpRoot: tmpdir(),
    });
    return exitCode;
  }
  if (command === "create") {
    const { kit, ...parsed } = parseCreateArgs(argv.slice(1));
    await create({
      ...parsed,
      kitDir: createKitDir({
        kitFlag: kit,
        name: identity.name,
        bundleDir: dirname(fileURLToPath(import.meta.url)),
      }),
      runner: spawnRunner,
      prompter: readlinePrompter,
      log: console.log,
    });
    return 0;
  }
  const { changed } = await generate(process.cwd());
  if (changed.length === 0) {
    console.log("Bez zmian");
  } else {
    for (const file of changed) {
      console.log(`zmieniono ${file}`);
    }
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
