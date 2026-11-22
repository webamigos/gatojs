#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./cli.js";
import { gatoBinPath } from "./gato-bin.js";
import { ghAuthToken, spawnProcess } from "./process.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const gatoPackageJsonPath = createRequire(import.meta.url).resolve(
  "gato-cli/package.json",
);
const gatoBin = gatoBinPath(
  gatoPackageJsonPath,
  JSON.parse(readFileSync(gatoPackageJsonPath, "utf8")),
);

run(process.argv.slice(2), {
  nodeVersion: process.version,
  nodePath: process.execPath,
  gatoBin,
  env: process.env,
  cwd: process.cwd(),
  packageVersion: packageJson.version,
  fetch: (url, init) => fetch(url, init),
  spawn: spawnProcess,
  ghAuthToken,
  makeTempDir: () => mkdtemp(join(tmpdir(), "create-gato-app-")),
  removeDir: (dir) => rm(dir, { recursive: true, force: true }),
  log: (line) => console.log(line),
  error: (line) => console.error(line),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
