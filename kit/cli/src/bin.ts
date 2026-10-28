import { generate } from "./generate/index.js";

const USAGE = "Użycie: wa generate";

async function main(argv: string[]): Promise<number> {
  const [command] = argv;
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
