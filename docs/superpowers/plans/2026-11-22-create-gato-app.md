# `create-gato-app` 0.1: minimal installer

Date: 2026-11-22. Source: `docs/superpowers/specs/2026-11-21-gato-cli-design.md` (sections 3, 5, 7, 9), modelled on
Ragen's `create-ragen-app`. Package: `kit/create-gato-app/` (kit-only, own lockfile, not a workspace).

`npx create-gato-app <dir> [flags]` checks Node, resolves a kit version, downloads the tag tarball of
`webamigos/gatojs` into a temp dir and delegates to `node <kit>/.wa/bin/wa.mjs create <dir> … --kit <kit>`.
Out of scope: the wizard, secrets, port probing, `gato-cli`, `kitFormat`, moving to `packages/`.

All modules are ESM (`.js` suffix in relative imports). Network and process spawning are injected; tests mock only
those. Local filesystem in tests is a real temp dir.

## Task 1: argument parsing (`src/args.ts`)

```ts
export type CliArgs =
  | { kind: "help" }
  | { kind: "version" }
  | {
      kind: "create";
      target: string;
      kitVersion: string | null;
      kitPath: string | null;
      install: boolean;
      passthrough: string[];
    };
export const USAGE: string;
export function parseCliArgs(argv: string[]): CliArgs;
```

Own flags: `--help`/`-h`, `--version`/`-v`, `--kit-version <x.y.z>`, `--kit <path>`, `--skip-install`; each value flag
also as `--name=value`. The reserved flag `--skip-docker` (spec section 7) is not implemented yet. Everything else is
passed to `wa create` unchanged and in order. `wa create` string options whose next token is a value:
`--modules`, `--locales`, `--title`, `--admin-email`.

### Behaviours

- `["--help"]`, `["-h"]`, `["my-app", "--help"]` → `{ kind: "help" }`; `["--version"]`, `["-v"]` → `{ kind: "version" }`;
  `["--version", "--help"]` → help.
- `["my-app"]` → `{ kind: "create", target: "my-app", kitVersion: null, kitPath: null, install: true, passthrough: ["my-app"] }`.
- `["my-app", "--kit-version", "0.1.0"]` and `["my-app", "--kit-version=0.1.0"]` → `kitVersion: "0.1.0"`,
  passthrough `["my-app"]`. `"v0.2.3"` → `"0.2.3"`.
- `--kit-version` with `"1.0"`, `"latest"`, `"1.0.0-rc.1"`, `"01.0.0"` → throws `--kit-version: expected x.y.z, got "<value>"`.
- `["my-app", "--kit-version"]`, `["my-app", "--kit-version", "--yes"]`, `["my-app", "--kit-version="]` → throws
  `--kit-version needs a value, e.g. --kit-version 0.1.0`.
- `["my-app", "--kit", "../gatojs"]` and `--kit=../gatojs` → `kitPath: "../gatojs"`, passthrough `["my-app"]`
  (`--kit` is never passed through: the CLI appends its own). Missing/empty value → throws `--kit needs a path`.
- `--kit` together with `--kit-version` → throws `--kit and --kit-version cannot be used together`.
- An own value flag given twice → throws `<flag> given more than once`.
- `["my-app", "--skip-install"]` → `install: false`, passthrough `["my-app", "--no-install"]`.
- `["my-app", "--no-install"]` → `install: false`, passthrough `["my-app", "--no-install"]`.
- `["my-app", "--skip-install", "--no-install"]` → passthrough contains `--no-install` exactly once.
- `["my-app", "--skip-docker"]` → throws `--skip-docker is not supported yet`.
- `["--yes", "my-app", "--modules", "uploads,api-keys", "--title", "Acme", "--no-git", "--setup"]` → target `my-app`,
  passthrough identical to the input (order kept).
- `["--title", "Acme App", "my-app"]` → target `my-app` (value of a `wa create` string option is not a target).
- `["--title=Acme", "my-app"]` → target `my-app`.
- `["--yes"]`, `[]`, `["--title", "Acme"]` → throws a message starting with `Missing project directory`.
- Unknown flags (`["my-app", "--frobnicate"]`) pass through: passthrough `["my-app", "--frobnicate"]`.
- `USAGE` mentions `create-gato-app <dir>`, `--kit-version`, `--kit`, `--skip-install`.

### Mutations to kill

- `--skip-install` not translated to `--no-install`, or `--no-install` duplicated.
- `--kit` or `--kit-version` (or their values) leaking into passthrough.
- A `wa create` option value taken as the target.
- `v` prefix kept in `kitVersion`; non-`x.y.z` accepted.
- Missing target not rejected; conflict of `--kit` and `--kit-version` not rejected.
- `--version` winning over `--help`.

## Task 2: Node check (`src/node-version.ts`)

```ts
export type NodeRange = { from: string; belowMajor?: number };
export const SUPPORTED_NODE_RANGES: readonly NodeRange[]; // [{ from: "22.0.0" }]
export function enginesRange(ranges: readonly NodeRange[]): string; // ">=22.0.0"
export function parseNodeVersion(version: string): { major: number; minor: number; patch: number; prerelease?: string } | undefined;
export type NodeVerdict = { kind: "ok" } | { kind: "warn"; message: string } | { kind: "refuse"; message: string };
export function checkNodeVersion(input: {
  version: string;
  willInstall: boolean;
  ranges?: readonly NodeRange[];
}): NodeVerdict;
```

The kit's `.nvmrc` is 22 and the kit declares no `engines`, so the supported range is `>=22.0.0`. A range with
`belowMajor` is closed (`{ from: "24.15.0", belowMajor: 25 }` = `^24.15.0`), one without is open.

### Behaviours

- `enginesRange(SUPPORTED_NODE_RANGES)` → `">=22.0.0"`; it equals `engines.node` in `kit/create-gato-app/package.json`.
- `enginesRange([{ from: "24.15.0", belowMajor: 25 }, { from: "26.0.0" }])` → `"^24.15.0 || >=26.0.0"`.
- `parseNodeVersion("v22.11.0")` → `{ major: 22, minor: 11, patch: 0 }`; `"v24.0.0-nightly2026"` → prerelease
  `"nightly2026"`; `"22"`, `"v22.1"`, `"banana"` → `undefined`.
- Default ranges: `v22.0.0`, `v22.11.0`, `v24.15.0`, `v26.1.0` → ok; `v21.7.3`, `v20.18.0`, `v18.0.0` → refuse with a
  message containing `too old`, `>=22.0.0` and the current version without `v` (`21.7.3`); `v22.0.0-rc.1` → refuse
  (a prerelease is below its release).
- Unparseable version (`"banana"`) → ok (an unknown format never blocks).
- Ranges `[{ from: "22.0.0", belowMajor: 25 }]`: `v25.0.0`, `v26.2.0` → refuse with `too new`; `v24.9.9` → ok.
- Ranges `[{ from: "24.15.0", belowMajor: 25 }, { from: "26.0.0" }]`: `v25.3.0` → refuse with
  `unsupported release line`; `v24.14.0` → `too old`; `v26.0.0` → ok.
- Refusal message also contains `nvm install 22` (the first range's major) and `--skip-install`.
- `willInstall: false` with an unsupported version → `{ kind: "warn" }` whose message contains the same headline
  (`too old` …) and `npm install`; a supported version → ok.

### Mutations to kill

- Boundary off by one (`>=` → `>`, `<` → `<=`) at `from` and at `belowMajor`.
- Prerelease ignored (treated as the release).
- `willInstall: false` still refusing, or `willInstall: true` only warning.
- Wrong category word (too old / too new / unsupported release line) for each case.

## Task 3: kit version (`src/kit-version.ts`)

```ts
export function highestSemverTag(tagNames: string[]): string | null;
```

### Behaviours

- `["v0.1.0", "v0.10.0", "v0.9.1"]` → `"0.10.0"`; `["v1.0.0", "v0.99.99"]` → `"1.0.0"`; `["v1.2.3", "v1.10.0"]` → `"1.10.0"`;
  `["v2.0.1", "v2.0.10"]` → `"2.0.10"`.
- Ignored: `"0.5.0"` (no `v`), `"v1.0"`, `"v1.0.0-rc.1"`, `"latest"`, `"gato-cli@1.0.0"`, `"v01.0.0"`, `"v1.0.0.1"`.
  `["v0.1.0", "v9.0.0-rc.1", "latest", "gato-cli@5.0.0"]` → `"0.1.0"`.
- `[]` and `["latest"]` → `null`.
- Property: for any list of valid `v<x.y.z>` tags the result is one of them (without `v`) and no tag in the list
  is greater (compare numerically, major then minor then patch) — expected value from the generated tuples, not from
  production code.

### Mutations to kill

- String comparison instead of numeric (`0.9.1` > `0.10.0`).
- Comparing only major/minor; prerelease or non-`v` tags accepted.

## Task 4: GitHub access (`src/github.ts`)

```ts
export const KIT_REPO = "webamigos/gatojs";
export type HttpResponse = { ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> };
export type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<HttpResponse>;
export function githubHeaders(token: string | null): Record<string, string>;
export function tagsUrl(page: number): string;
export function tarballUrl(version: string, token: string | null): string;
export function resolveToken(input: {
  env: Record<string, string | undefined>;
  ghAuthToken: () => Promise<string | null>;
}): Promise<string | null>;
export function fetchTagNames(input: { fetch: FetchLike; token: string | null }): Promise<string[]>;
export function resolveKitVersion(input: { requested: string | null; fetch: FetchLike; token: string | null }): Promise<string>;
export function fetchKitTarball(input: { fetch: FetchLike; token: string | null; version: string }): Promise<Uint8Array>;
```

### Behaviours

- `githubHeaders(null)` → exactly `{ "User-Agent": "create-gato-app", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }`;
  `githubHeaders("t0k")` → the same plus `Authorization: "Bearer t0k"`.
- `tagsUrl(1)` → `https://api.github.com/repos/webamigos/gatojs/tags?per_page=100&page=1`.
- `tarballUrl("0.1.0", null)` → `https://codeload.github.com/webamigos/gatojs/tar.gz/refs/tags/v0.1.0`;
  `tarballUrl("0.1.0", "t")` → `https://api.github.com/repos/webamigos/gatojs/tarball/refs/tags/v0.1.0`.
- `resolveToken`: `GITHUB_TOKEN` wins over `GH_TOKEN`, which wins over `gh auth token`; values are trimmed; empty or
  whitespace values are skipped; `ghAuthToken` is not called when an env token exists; `ghAuthToken` returning `null`,
  `""`/`"\n"` or rejecting → `null`; `"gho_x\n"` from gh → `"gho_x"`.
- `fetchTagNames` requests `tagsUrl(1)`, `tagsUrl(2)`, … with `githubHeaders(token)` until a page has fewer than 100
  entries; returns all `name` fields in order. A page of exactly 100 entries followed by an empty page → 2 requests.
- `resolveKitVersion({ requested: "0.3.0" })` → `"0.3.0"` without any fetch. With `requested: null` → highest semver
  tag; no semver tag → throws a message containing `No v<x.y.z> tag found` and `--kit-version`.
- `fetchKitTarball` requests `tarballUrl(version, token)` with `githubHeaders(token)` and returns the body bytes.
- HTTP errors (both calls), where `<what>` is `the tag list` or `kit v<version>`:
  - 404 without token → message contains `404`, `may be private` and `GITHUB_TOKEN` and `gh auth login`;
  - 404 with token → message contains `404` and does not contain `may be private`;
  - 401 → contains `401` and `GITHUB_TOKEN`;
  - 403 and 429 → contain the status and `--kit-version`;
  - 500 → contains `500`.
  - No error message ever contains the token value.
- `fetch` rejecting with `Error("getaddrinfo ENOTFOUND")` → throws a message containing `Could not reach GitHub` and
  `ENOTFOUND`.

### Mutations to kill

- Authorization header sent without a token or missing with one; token leaked into an error message.
- Pagination stops after the first page or never stops.
- Wrong precedence of token sources; gh called when env token exists; untrimmed token.
- Private-repo hint shown with a token or missing without one.
- Requested version ignored or fetch done anyway.

## Task 5: download and extract (`src/kit-download.ts`)

```ts
export type SpawnResult = { code: number; stdout: string; stderr: string };
export type Spawn = (
  command: string,
  args: string[],
  options: { cwd?: string; stdio: "inherit" | "pipe" },
) => Promise<SpawnResult>;
export function downloadKit(input: {
  version: string;
  token: string | null;
  fetch: FetchLike;
  spawn: Spawn;
  workDir: string;
}): Promise<string>;
```

`wa create` lists kit files with `git ls-files`, and a tarball has no `.git`. So after extraction the kit dir is indexed
with `git init -q` and `git add -A -f` (the tarball holds exactly the tracked files, `-f` keeps force-added ones).

### Behaviours

- Writes the tarball bytes to `<workDir>/kit.tar.gz`, creates `<workDir>/kit`, then spawns in this order:
  1. `tar ["-xzf", "<workDir>/kit.tar.gz", "-C", "<workDir>/kit", "--strip-components=1"]`, `stdio: "pipe"`;
  2. `git ["init", "-q"]` with `cwd: "<workDir>/kit"`, `stdio: "pipe"`;
  3. `git ["add", "-A", "-f"]` with `cwd: "<workDir>/kit"`, `stdio: "pipe"`.
  Returns `<workDir>/kit`.
- tar exits non-zero → throws a message containing `Could not extract` and tar's stderr; git is not spawned.
- git exits non-zero, or the spawn rejects (e.g. `ENOENT`) → throws a message containing `needs git`.
- A fetch error propagates and nothing is spawned.

### Mutations to kill

- `--strip-components=1` dropped; wrong order; tar failure ignored; git failure ignored.

## Task 6: delegation and orchestration (`src/delegate.ts`, `src/cli.ts`)

```ts
export function waCreateCommand(input: { nodePath: string; kitDir: string; passthrough: string[] }): {
  command: string;
  args: string[];
};

export type CliDeps = {
  nodeVersion: string;
  nodePath: string;
  env: Record<string, string | undefined>;
  cwd: string;
  packageVersion: string;
  fetch: FetchLike;
  spawn: Spawn;
  ghAuthToken: () => Promise<string | null>;
  makeTempDir: () => Promise<string>;
  removeDir: (dir: string) => Promise<void>;
  log: (line: string) => void;
  error: (line: string) => void;
};
export function run(argv: string[], deps: CliDeps): Promise<number>;
```

### Behaviours

- `waCreateCommand({ nodePath: "/usr/bin/node", kitDir: "/k", passthrough: ["app", "--yes"] })` →
  `{ command: "/usr/bin/node", args: ["/k/.wa/bin/wa.mjs", "create", "app", "--yes", "--kit", "/k"] }`.
- `run(["--version"])` → logs `packageVersion` exactly, returns 0, no fetch/spawn. `run(["--help"])` → logs `USAGE`, 0.
- Parse error → `error` gets the message, returns 1, no fetch/spawn/temp dir.
- Node check runs before anything else: Node `v20.0.0` with `["app", "--kit-version", "0.1.0"]` → returns 1, `error`
  message contains `too old`, no fetch, no spawn, no temp dir. Same with `--yes` added.
- Node `v20.0.0` with `--skip-install` and `--kit /k` → warning on `error` (`too old`), then delegation runs, returns
  the child's code.
- `["app", "--kit", "../kit", "--yes"]`, `cwd: "/work"` → no fetch, no temp dir, one spawn:
  `nodePath ["/kit/.wa/bin/wa.mjs", "create", "app", "--yes", "--kit", "/kit"]` with `cwd: "/work"`, `stdio: "inherit"`;
  returns the child's exit code (0 → 0, 3 → 3).
- Download path, `["app", "--kit-version", "0.1.0", "--yes"]`, env `GITHUB_TOKEN=tok`: fetches
  `https://api.github.com/repos/webamigos/gatojs/tarball/refs/tags/v0.1.0` with `Authorization: Bearer tok`; spawns tar,
  git, git, then `nodePath ["<tmp>/kit/.wa/bin/wa.mjs", "create", "app", "--yes", "--kit", "<tmp>/kit"]` with
  `stdio: "inherit"`; returns the child's code; `removeDir(<tmp>)` called once, after the child exits.
- Without `--kit-version`: fetches the tag list first and uses the highest semver tag.
- No token anywhere (`ghAuthToken` → null): tarball from `codeload.github.com`, no `Authorization` header.
- Child exits 2 → returns 2 and the temp dir is removed. tar fails → returns 1, error printed, temp dir removed,
  no delegation. 404 on the tarball → returns 1, `may be private` printed, temp dir removed.
- No `run` path prints the token.

### Mutations to kill

- Temp dir not removed on failure; removed before the child exits.
- Child exit code replaced with 0/1.
- `--kit` path not resolved against `cwd`; `--kit` missing from the delegated command.
- Node check after download, or bypassed by `--yes`.
