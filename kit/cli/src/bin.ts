import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  parseAddArgs,
  parseCreateArgs,
  parseListArgs,
  parseRemoveArgs,
} from "./args.js";
import { addFromSource } from "./commands/add.js";
import { create } from "./commands/create.js";
import { readlinePrompter } from "./process/prompter.js";
import { spawnRunner } from "./process/runner.js";
import { kitSync } from "./commands/kit-sync.js";
import { generate } from "./generate/index.js";
import { list } from "./commands/list.js";
import { remove } from "./commands/remove.js";
import { readKitManifests } from "./kit/kit-config.js";
import { resolveKitSource } from "./kit/source.js";
import { readKitState } from "./manifest/kit-state.js";

const USAGE =
  "Użycie: wa generate | wa kit sync | wa create <katalog> [opcje] | wa add <moduł> [--kit <ścieżka|url>] [--no-install] | wa remove <moduł> [--force] [--no-install] | wa list [--kit <ścieżka|url>]";

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
        envSource: process.env["WA_KIT_SOURCE"],
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

async function main(argv: string[]): Promise<number> {
  const [command, subcommand] = argv;
  if (command === "kit" && subcommand === "sync") {
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
      envSource: process.env["WA_KIT_SOURCE"],
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
  if (command === "create") {
    const { kit, ...parsed } = parseCreateArgs(argv.slice(1));
    const defaultKit = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    await create({
      ...parsed,
      kitDir: kit === null ? defaultKit : resolve(kit),
      runner: spawnRunner,
      prompter: readlinePrompter,
      log: console.log,
    });
    return 0;
  }
  if (command !== "generate") {
    console.error(USAGE);
    return 1;
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
