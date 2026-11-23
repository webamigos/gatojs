import { spawn } from "node:child_process";
import { formatReport, parseSyncArgs } from "./manifest-deps";
import { runManifestSync } from "./run-manifest-sync";

const COMMAND = "npx tsx scripts/kit/sync-manifest-deps.ts";

function runWa(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [".wa/bin/wa.mjs", ...args], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`wa ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

async function main(): Promise<void> {
  const args = parseSyncArgs(process.argv.slice(2));
  const { changed, result } = await runManifestSync({
    repoDir: process.cwd(),
    base: args.base,
    check: args.check,
    runWa,
  });
  console.log(formatReport(result));
  if (args.check && changed) {
    const baseFlag = args.base === "origin/main" ? "" : ` --base ${args.base}`;
    console.error(
      [
        "",
        "Module manifests do not follow package.json. Run on this branch, then commit and push:",
        "",
        `  npm ci && ${COMMAND}${baseFlag}`,
        '  git commit -am "chore(kit): sync manifests with the dependency bumps"',
      ].join("\n"),
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
