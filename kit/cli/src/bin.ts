import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { parseAddArgs, parseCreateArgs } from "./args.js";
import { addFromSource } from "./commands/add.js";
import { create } from "./commands/create.js";
import { readlinePrompter } from "./process/prompter.js";
import { spawnRunner } from "./process/runner.js";
import { kitSync } from "./commands/kit-sync.js";
import { generate } from "./generate/index.js";

const USAGE =
  "Użycie: wa generate | wa kit sync | wa create <katalog> [opcje] | wa add <moduł> [--kit <ścieżka|url>] [--no-install]";

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
    for (const file of changed) console.log(`zmieniono ${file}`);
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
