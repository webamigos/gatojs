import { kitSync } from "./commands/kit-sync.js";
import { generate } from "./generate/index.js";

const USAGE = "Użycie: wa generate | wa kit sync";

async function main(argv: string[]): Promise<number> {
  const [command, subcommand] = argv;
  if (command === "kit" && subcommand === "sync") {
    const { changed } = await kitSync(process.cwd());
    console.log(changed ? "Zaktualizowano .wa/kit.json" : "Bez zmian");
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
