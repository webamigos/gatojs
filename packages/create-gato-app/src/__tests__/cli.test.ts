import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { USAGE } from "../args.js";
import { run, type CliDeps } from "../cli.js";
import type { FetchLike, HttpResponse } from "../github.js";
import type { Spawn, SpawnResult } from "../kit-download.js";
import { CancelledError } from "../questions.js";
import type { Ui } from "../ui.js";
import { bytesResponse, jsonResponse, statusResponse } from "./fake-http.js";
import { scriptedPrompter, type ScriptedAnswer } from "./fake-prompter.js";
import {
  base64Wrapped,
  KIT_COMPOSE,
  KIT_NODE_RANGE,
  writeKit,
} from "./kit-fixture.js";

const SECRET = "ghp_SECRET_TOKEN_123";
const NODE = "/usr/local/bin/node";
const GATO = "/nm/gato-cli/dist/gato.mjs";
const TAGS_PAGE_1 =
  "https://api.github.com/repos/webamigos/gatojs/tags?per_page=100&page=1";
const CONTENTS_010 =
  "https://api.github.com/repos/webamigos/gatojs/contents/package.json?ref=v0.1.0";
const CONTENTS_020 =
  "https://api.github.com/repos/webamigos/gatojs/contents/package.json?ref=v0.2.0";
const API_TARBALL_010 =
  "https://api.github.com/repos/webamigos/gatojs/tarball/refs/tags/v0.1.0";
const CODELOAD_TARBALL_010 =
  "https://codeload.github.com/webamigos/gatojs/tar.gz/refs/tags/v0.1.0";
const CODELOAD_TARBALL_020 =
  "https://codeload.github.com/webamigos/gatojs/tar.gz/refs/tags/v0.2.0";

const GATO_CREATE = "gato create";
const GIT_INIT = "git init -q";
const NPM_INSTALL = "npm install";
const DOCKER_INFO = "docker info";
const COMPOSE_UP = "docker compose up -d --wait";
const MIGRATE = "npx prisma migrate dev --name init";
const GIT_ADD = "git add -A";
const COMMIT =
  "git commit -q --no-verify -m chore: initial commit from GatoJS v0.9.0";
const ADMIN_CREATE = "npm run admin:create -- --email a@b.co";
const COMMIT_HINT = 'git add -A && git commit -m "chore: initial commit"';
const RETRY_WARNING = "GitHub rejected the token (401); retrying without it.";
const RANDOM_PATTERN = [0, 1, 2, 35, 36, 255];
const AUTH_SECRET = "s".repeat(43);
const PROJECT_ENV = [
  "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/my_app",
  `BETTER_AUTH_SECRET=${AUTH_SECRET}`,
  "SMTP_URL=smtp://localhost:1025",
  "ADMIN_EMAIL=",
  "STORAGE_PROVIDER=local",
  "STORAGE_LOCAL_PATH=./volumes/uploads",
  "S3_ENDPOINT=http://localhost:9000",
  "S3_ACCESS_KEY_ID=minioadmin",
  "S3_SECRET_ACCESS_KEY=minioadmin",
  "",
].join("\n");

type SpawnCall = {
  command: string;
  args: string[];
  cwd: string | undefined;
  stdio: "inherit" | "pipe";
};

type Note = { title: string; lines: string[] };

type HarnessOptions = {
  nodeVersion?: string;
  env?: Record<string, string | undefined>;
  gh?: string | null;
  routes?: Record<string, HttpResponse>;
  results?: Record<string, Partial<SpawnResult>>;
  rejects?: string[];
  tarResult?: SpawnResult;
  interactive?: boolean;
  script?: ScriptedAnswer[];
  busy?: number[];
  projectEnvExtra?: string;
  kitPackageJson?: unknown;
  cwdName?: string;
};

type Harness = {
  deps: CliDeps;
  root: string;
  cwd: string;
  kitDir: string;
  projectDir: string;
  calls: SpawnCall[];
  events: string[];
  fetchCalls: { url: string; headers: Record<string, string> }[];
  tempDirs: string[];
  removed: string[];
  logs: string[];
  errors: string[];
  uiLines: string[];
  notes: Note[];
  probed: number[];
  envAtComposeUp: string[];
};

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function label(call: { command: string; args: string[] }): string {
  if (call.command === NODE && call.args[1] === "create") return GATO_CREATE;
  return [call.command, ...call.args].join(" ");
}

async function writeProject(projectDir: string, extra: string): Promise<void> {
  await mkdir(join(projectDir, ".wa"), { recursive: true });
  await writeFile(join(projectDir, ".env"), `${PROJECT_ENV}${extra}`);
  await writeFile(join(projectDir, "docker-compose.yml"), KIT_COMPOSE);
  await writeFile(
    join(projectDir, ".wa", "kit.json"),
    JSON.stringify({ kitVersion: "0.9.0" }),
  );
}

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), "create-gato-app-cli-"));
  createdDirs.push(root);
  const cwd = join(root, options.cwdName ?? "work");
  const kitDir = join(root, "kit");
  await mkdir(cwd, { recursive: true });
  await writeKit(kitDir, options.kitPackageJson);
  const routes = options.routes ?? {};
  const busy = options.busy ?? [];
  const { prompter } = scriptedPrompter(options.script ?? []);

  const h: Harness = {
    deps: undefined as unknown as CliDeps,
    root,
    cwd,
    kitDir,
    projectDir: join(cwd, "my-app"),
    calls: [],
    events: [],
    fetchCalls: [],
    tempDirs: [],
    removed: [],
    logs: [],
    errors: [],
    uiLines: [],
    notes: [],
    probed: [],
    envAtComposeUp: [],
  };

  const fetch: FetchLike = async (url, init) => {
    h.fetchCalls.push({ url, headers: init.headers });
    h.events.push(`fetch ${url}`);
    const response = routes[url];
    if (!response) throw new Error(`unexpected request: ${url}`);
    return response;
  };

  const spawn: Spawn = async (command, args, spawnOptions) => {
    const call: SpawnCall = {
      command,
      args,
      cwd: spawnOptions.cwd,
      stdio: spawnOptions.stdio,
    };
    h.calls.push(call);
    const name = label(call);
    h.events.push(`spawn ${name}`);
    if (command === "tar") {
      const target = args[args.indexOf("-C") + 1];
      if (target === undefined) throw new Error("tar without -C");
      await writeKit(target);
      return options.tarResult ?? { code: 0, stdout: "", stderr: "" };
    }
    if ((options.rejects ?? []).some((key) => name.startsWith(key))) {
      throw new Error(`spawn ${command} ENOENT`);
    }
    const configured = Object.entries(options.results ?? {}).find(([key]) =>
      name.startsWith(key),
    )?.[1];
    const result: SpawnResult = {
      code: 0,
      stdout: "",
      stderr: "",
      ...configured,
    };
    if (name === GATO_CREATE && result.code === 0) {
      const projectDir = args[2];
      if (projectDir === undefined)
        throw new Error("gato create without a directory");
      await writeProject(projectDir, options.projectEnvExtra ?? "");
    }
    if (name.startsWith("docker compose") && name.includes(" up")) {
      h.envAtComposeUp.push(await readFile(join(h.projectDir, ".env"), "utf8"));
    }
    return result;
  };

  const ui: Ui = {
    intro: (title) => {
      h.uiLines.push(title);
    },
    step: (message) => {
      h.uiLines.push(message);
    },
    info: (message) => {
      h.uiLines.push(message);
    },
    warn: (message) => {
      h.uiLines.push(message);
    },
    note: (title, lines) => {
      h.notes.push({ title, lines });
    },
    outro: (message) => {
      h.uiLines.push(message);
    },
    task: async <T>(taskLabel: string, work: () => Promise<T>): Promise<T> => {
      h.events.push(`task ${taskLabel}`);
      return work();
    },
  };

  h.deps = {
    nodeVersion: options.nodeVersion ?? "v24.15.0",
    nodePath: NODE,
    gatoBin: GATO,
    env: options.env ?? {},
    cwd,
    packageVersion: "9.8.7",
    fetch,
    spawn,
    ghAuthToken: async () => options.gh ?? null,
    makeTempDir: async () => {
      const dir = await mkdtemp(join(tmpdir(), "create-gato-app-cli-kit-"));
      createdDirs.push(dir);
      h.tempDirs.push(dir);
      h.events.push("mktemp");
      return dir;
    },
    removeDir: async (dir) => {
      h.removed.push(dir);
      h.events.push("remove");
      await rm(dir, { recursive: true, force: true });
    },
    interactive: options.interactive ?? true,
    prompter,
    ui,
    isPortBusy: async (port) => {
      h.probed.push(port);
      return busy.includes(port);
    },
    randomBytes: (size) =>
      Uint8Array.from(
        { length: size },
        (_, index) => RANDOM_PATTERN[index % 6] ?? 0,
      ),
    log: (line) => {
      h.logs.push(line);
    },
    error: (line) => {
      h.errors.push(line);
    },
  };
  return h;
}

function lines(h: Harness): string[] {
  return [
    ...h.logs,
    ...h.errors,
    ...h.uiLines,
    ...h.notes.flatMap((note) => [note.title, ...note.lines]),
  ].flatMap((line) => line.split("\n"));
}

function output(h: Harness): string {
  return lines(h).join("\n");
}

function steps(h: Harness): string[] {
  return h.calls
    .filter(
      (call) =>
        call.command !== "tar" &&
        !h.tempDirs.some((dir) => call.cwd?.startsWith(dir)),
    )
    .map(label);
}

function callNamed(h: Harness, name: string): SpawnCall {
  const call = h.calls.find((candidate) => label(candidate) === name);
  expect(call, `spawn ${name}`).toBeDefined();
  return call as SpawnCall;
}

function nextStepsOf(h: Harness): string[] {
  const note = h.notes.find((candidate) => candidate.title === "Next steps");
  expect(note, "Next steps note").toBeDefined();
  return (note as Note).lines;
}

async function projectEnv(h: Harness): Promise<string[]> {
  const path = join(h.projectDir, ".env");
  expect(existsSync(path), `${path} exists`).toBe(true);
  return (await readFile(path, "utf8")).split("\n");
}

function contentsResponse(packageJson: unknown): HttpResponse {
  return jsonResponse({
    encoding: "base64",
    content: base64Wrapped(JSON.stringify(packageJson)),
  });
}

const KIT_PACKAGE = contentsResponse({
  name: "gatojs",
  engines: { node: KIT_NODE_RANGE },
});

describe("run: pomoc i wersja", () => {
  it("--version wypisuje dokładnie wersję pakietu i nic więcej nie robi", async () => {
    const h = await harness();
    await expect(run(["--version"], h.deps)).resolves.toBe(0);
    expect(h.logs).toEqual(["9.8.7"]);
    expect(h.fetchCalls).toEqual([]);
    expect(h.calls).toEqual([]);
    expect(h.tempDirs).toEqual([]);
  });

  it("--help wypisuje opis użycia", async () => {
    const h = await harness();
    await expect(run(["--help"], h.deps)).resolves.toBe(0);
    expect(h.logs).toContain(USAGE);
    expect(h.fetchCalls).toEqual([]);
    expect(h.calls).toEqual([]);
  });

  it("--help działa także na nieobsługiwanym Node", async () => {
    const h = await harness({ nodeVersion: "v20.0.0" });
    await expect(run(["--help"], h.deps)).resolves.toBe(0);
  });
});

describe("run: błędy argumentów", () => {
  it.each([
    [
      ["app", "--kit", "../kit", "--kit-version", "0.1.0"],
      "--kit and --kit-version cannot be used together",
    ],
    [[], "Missing project directory."],
    [["my-app", "--nope"], "Unknown option: --nope"],
    [["my-app", "--title", 'A"B', "--yes"], "--title: "],
    [
      ["my-app", "--setup", "--skip-docker"],
      "--setup needs npm install and Docker",
    ],
  ])(
    "%j kończy się kodem 1 bez pobierania i bez procesów",
    async (argv, message) => {
      const h = await harness({
        routes: { [TAGS_PAGE_1]: jsonResponse([{ name: "v0.1.0" }]) },
      });
      await expect(run(argv, h.deps)).resolves.toBe(1);
      expect(output(h)).toContain(message);
      expect(h.fetchCalls).toEqual([]);
      expect(h.calls).toEqual([]);
      expect(h.tempDirs).toEqual([]);
    },
  );
});

describe("run: katalog docelowy i terminal", () => {
  it("istniejący niepusty katalog kończy się kodem 1 bez pobierania i procesów", async () => {
    const h = await harness({
      routes: { [TAGS_PAGE_1]: jsonResponse([{ name: "v0.1.0" }]) },
    });
    await mkdir(h.projectDir);
    await writeFile(join(h.projectDir, "README.md"), "x");
    await expect(run(["my-app", "--yes"], h.deps)).resolves.toBe(1);
    expect(lines(h)).toContain(
      `Directory ${h.projectDir} exists and is not empty; choose another name or empty it.`,
    );
    expect(h.fetchCalls).toEqual([]);
    expect(h.calls).toEqual([]);
  });

  it("istniejący pusty katalog jest w porządku", async () => {
    const h = await harness();
    await mkdir(h.projectDir);
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(steps(h)).toEqual([GATO_CREATE, GIT_INIT]);
  });

  it("bez terminala i bez --yes kończy się kodem 1 przed pobieraniem", async () => {
    const h = await harness({
      interactive: false,
      routes: { [TAGS_PAGE_1]: jsonResponse([{ name: "v0.1.0" }]) },
    });
    await expect(run(["my-app"], h.deps)).resolves.toBe(1);
    expect(
      lines(h).some((line) =>
        line.startsWith("No terminal for questions: pass --yes"),
      ),
    ).toBe(true);
    expect(h.fetchCalls).toEqual([]);
    expect(h.calls).toEqual([]);
  });

  it("bez terminala z --yes kreator działa", async () => {
    const h = await harness({ interactive: false });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(steps(h)).toEqual([GATO_CREATE, GIT_INIT]);
  });

  it("anulowanie pytań kończy się kodem 1, bez gato create i bez katalogu projektu", async () => {
    const h = await harness({
      script: [
        { method: "multiselect", answer: new CancelledError("cancelled") },
      ],
    });
    await expect(run(["my-app", "--kit", h.kitDir], h.deps)).resolves.toBe(1);
    expect(lines(h)).toContain("Cancelled; nothing was written.");
    expect(steps(h)).toEqual([]);
    expect(existsSync(h.projectDir)).toBe(false);
  });

  it("nieznany moduł z --modules kończy się kodem 1 bez gato create", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--modules", "nope"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain(
      'Unknown module "nope". Available: api-keys, uploads.',
    );
    expect(steps(h)).toEqual([]);
  });

  it("lokalny kit bez package.json nie jest checkoutem GatoJS", async () => {
    const h = await harness();
    const empty = join(h.root, "empty-kit");
    await mkdir(empty);
    await expect(
      run(["my-app", "--kit", empty, "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain(
      `${empty} is not a GatoJS checkout (no package.json)`,
    );
    expect(steps(h)).toEqual([]);
  });
});

describe("run: lokalny kit z --yes --skip-docker", () => {
  it("uruchamia gato create z odpowiedziami, potem git init, npm install i commit w katalogu projektu", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-docker"], h.deps),
    ).resolves.toBe(0);
    expect(steps(h)).toEqual([
      GATO_CREATE,
      GIT_INIT,
      NPM_INSTALL,
      GIT_ADD,
      COMMIT,
    ]);
    const create = callNamed(h, GATO_CREATE);
    expect(create.command).toBe(NODE);
    expect(create.args).toEqual([
      GATO,
      "create",
      h.projectDir,
      "--yes",
      "--no-install",
      "--no-git",
      "--modules=",
      "--locales=pl,en",
      "--title=My App",
      `--kit=${h.kitDir}`,
    ]);
    expect(create.stdio).toBe("pipe");
    for (const name of [GIT_INIT, NPM_INSTALL, GIT_ADD, COMMIT]) {
      expect(callNamed(h, name).cwd).toBe(h.projectDir);
    }
    expect(callNamed(h, COMMIT).args).toEqual([
      "commit",
      "-q",
      "--no-verify",
      "-m",
      "chore: initial commit from GatoJS v0.9.0",
    ]);
  });

  it("nie uruchamia dockera ani migracji", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-docker"], h.deps),
    ).resolves.toBe(0);
    expect(h.calls.some((call) => call.command === "docker")).toBe(false);
    expect(h.calls.some((call) => call.command === "npx")).toBe(false);
  });

  it("dopisuje do .env COMPOSE_PROJECT_NAME z przyrostkiem z randomBytes i nie rusza reszty", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-docker"], h.deps),
    ).resolves.toBe(0);
    const env = await projectEnv(h);
    expect(env).toContain("COMPOSE_PROJECT_NAME=my-app-abc9ad");
    expect(
      env.filter((line) => line.startsWith("COMPOSE_PROJECT_NAME=")),
    ).toHaveLength(1);
    expect(env).toContain(`BETTER_AUTH_SECRET=${AUTH_SECRET}`);
    expect(env).toContain(
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/my_app",
    );
    expect(env).toContain("ADMIN_EMAIL=");
  });

  it("istniejący COMPOSE_PROJECT_NAME zostaje bez zmian", async () => {
    const h = await harness({
      projectEnvExtra: "COMPOSE_PROJECT_NAME=keep-me\n",
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-docker"], h.deps),
    ).resolves.toBe(0);
    const env = await projectEnv(h);
    expect(env).toContain("COMPOSE_PROJECT_NAME=keep-me");
    expect(
      env.filter((line) => line.startsWith("COMPOSE_PROJECT_NAME=")),
    ).toEqual(["COMPOSE_PROJECT_NAME=keep-me"]);
  });

  it("następne kroki to Docker, migracja, admin i dev, bez npm install i commita", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-docker"], h.deps),
    ).resolves.toBe(0);
    expect(nextStepsOf(h)).toEqual([
      "cd my-app",
      "docker compose up -d",
      "npx prisma migrate dev --name init",
      "npm run admin:create -- --email <your-email>",
      "npm run dev",
    ]);
  });

  it("wyjście gato create nie trafia do użytkownika, gdy się udało", async () => {
    const h = await harness({
      results: {
        [GATO_CREATE]: { stdout: "Projekt gotowy", stderr: "Ostrzeżenie" },
      },
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-docker"], h.deps),
    ).resolves.toBe(0);
    expect(output(h)).not.toContain("Projekt gotowy");
    expect(output(h)).not.toContain("Ostrzeżenie");
  });

  it("względny --kit jest liczony od cwd", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", "../kit", "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(callNamed(h, GATO_CREATE).args.at(-1)).toBe(`--kit=${h.kitDir}`);
  });

  it("--cli-source i --admin-email trafiają do gato create", async () => {
    const h = await harness();
    await expect(
      run(
        [
          "my-app",
          "--kit",
          h.kitDir,
          "--yes",
          "--skip-install",
          "--cli-source",
          "/t/gato-cli.tgz",
          "--admin-email",
          "a@b.co",
        ],
        h.deps,
      ),
    ).resolves.toBe(0);
    expect(callNamed(h, GATO_CREATE).args).toEqual([
      GATO,
      "create",
      h.projectDir,
      "--yes",
      "--no-install",
      "--no-git",
      "--modules=",
      "--locales=pl,en",
      "--title=My App",
      "--admin-email=a@b.co",
      "--cli-source=/t/gato-cli.tgz",
      `--kit=${h.kitDir}`,
    ]);
  });
});

describe("run: --skip-install", () => {
  it("uruchamia tylko gato create i git init, bez commita", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(steps(h)).toEqual([GATO_CREATE, GIT_INIT]);
    expect(nextStepsOf(h).slice(0, 2)).toEqual(["cd my-app", "npm install"]);
    expect(nextStepsOf(h)).toContain(COMMIT_HINT);
  });

  it("dalej zapisuje COMPOSE_PROJECT_NAME", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(await projectEnv(h)).toContain("COMPOSE_PROJECT_NAME=my-app-abc9ad");
  });
});

describe("run: pełna konfiguracja z --yes", () => {
  it("przy wolnych portach uruchamia Dockera, instalację, migrację i commit w tej kolejności", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(0);
    expect(steps(h)).toEqual([
      GATO_CREATE,
      DOCKER_INFO,
      COMPOSE_UP,
      GIT_INIT,
      NPM_INSTALL,
      MIGRATE,
      GIT_ADD,
      COMMIT,
    ]);
    expect(callNamed(h, COMPOSE_UP).cwd).toBe(h.projectDir);
    expect(callNamed(h, MIGRATE).cwd).toBe(h.projectDir);
    expect(nextStepsOf(h)).toEqual([
      "cd my-app",
      "npm run admin:create -- --email <your-email>",
      "npm run dev",
    ]);
  });

  it("sprawdza porty db i mail przed docker info", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(0);
    expect([...h.probed].sort((a, b) => a - b)).toEqual([1025, 5432, 8025]);
  });

  it(".env ma COMPOSE_PROJECT_NAME, zanim ruszy docker compose up", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(0);
    expect(h.envAtComposeUp).toHaveLength(1);
    expect(h.envAtComposeUp[0]?.split("\n")).toContain(
      "COMPOSE_PROJECT_NAME=my-app-abc9ad",
    );
  });

  it("z --admin-email tworzy administratora po migracji, przed commitem, na terminalu użytkownika", async () => {
    const h = await harness();
    await expect(
      run(
        ["my-app", "--kit", h.kitDir, "--yes", "--admin-email", "a@b.co"],
        h.deps,
      ),
    ).resolves.toBe(0);
    expect(steps(h)).toEqual([
      GATO_CREATE,
      DOCKER_INFO,
      COMPOSE_UP,
      GIT_INIT,
      NPM_INSTALL,
      MIGRATE,
      ADMIN_CREATE,
      GIT_ADD,
      COMMIT,
    ]);
    expect(callNamed(h, ADMIN_CREATE).stdio).toBe("inherit");
    expect(callNamed(h, ADMIN_CREATE).cwd).toBe(h.projectDir);
    expect(nextStepsOf(h)).toEqual(["cd my-app", "npm run dev"]);
  });

  it("uploads z S3 uruchamia profil s3, sprawdza porty MinIO i zapisuje magazyn w .env", async () => {
    const h = await harness();
    await expect(
      run(
        [
          "my-app",
          "--kit",
          h.kitDir,
          "--yes",
          "--modules",
          "uploads",
          "--storage",
          "s3",
        ],
        h.deps,
      ),
    ).resolves.toBe(0);
    expect(steps(h)).toContain("docker compose --profile s3 up -d --wait");
    expect(steps(h)).not.toContain(COMPOSE_UP);
    expect(h.probed).toEqual(expect.arrayContaining([5432, 9000, 9001]));
    expect(callNamed(h, GATO_CREATE).args).toContain("--modules=uploads");
    const env = await projectEnv(h);
    expect(env).toContain("STORAGE_PROVIDER=s3");
    expect(env).toContain("S3_ENDPOINT=http://localhost:9000");
    expect(env).not.toContain("STORAGE_PROVIDER=local");
  });

  it("uploads z lokalnym magazynem nie włącza profilu s3 ani portów MinIO", async () => {
    const h = await harness();
    await expect(
      run(
        ["my-app", "--kit", h.kitDir, "--yes", "--modules", "uploads"],
        h.deps,
      ),
    ).resolves.toBe(0);
    expect(steps(h)).toContain(COMPOSE_UP);
    expect(h.probed).not.toContain(9000);
    expect(await projectEnv(h)).toContain("STORAGE_PROVIDER=local");
  });

  it("DB_PORT z otoczenia zmienia sprawdzany port bazy", async () => {
    const h = await harness({ env: { DB_PORT: "5544" } });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(0);
    expect(h.probed).toContain(5544);
    expect(h.probed).not.toContain(5432);
  });
});

describe("run: porażki kroków", () => {
  it("zajęty port 5432 pomija Dockera i migrację, instaluje, commituje i kończy się kodem 1", async () => {
    const h = await harness({ busy: [5432] });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(steps(h)).toEqual([
      GATO_CREATE,
      GIT_INIT,
      NPM_INSTALL,
      GIT_ADD,
      COMMIT,
    ]);
    expect(output(h)).toContain("DB_PORT=5433");
    expect(output(h)).toContain(
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5433/my_app",
    );
    expect(nextStepsOf(h)).toContain("docker compose up -d");
    expect(nextStepsOf(h)).toContain("npx prisma migrate dev --name init");
  });

  it("niedostępny Docker kończy się kodem 1 bez compose i migracji", async () => {
    const h = await harness({
      results: { [DOCKER_INFO]: { code: 1, stderr: "Cannot connect" } },
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(steps(h)).toContain(DOCKER_INFO);
    expect(steps(h).some((name) => name.startsWith("docker compose"))).toBe(
      false,
    );
    expect(steps(h)).not.toContain(MIGRATE);
    expect(output(h)).toContain("Docker is not available");
  });

  it("nieudane docker compose up pomija migrację i admina, ale commituje i kończy się kodem 1", async () => {
    const h = await harness({
      results: { "docker compose": { code: 1, stderr: "port is allocated" } },
    });
    await expect(
      run(
        ["my-app", "--kit", h.kitDir, "--yes", "--admin-email", "a@b.co"],
        h.deps,
      ),
    ).resolves.toBe(1);
    expect(steps(h)).not.toContain(MIGRATE);
    expect(steps(h)).not.toContain(ADMIN_CREATE);
    expect(steps(h)).toContain(NPM_INSTALL);
    expect(steps(h).at(-1)).toBe(COMMIT);
    expect(output(h)).toContain("docker compose up failed");
  });

  it("nieudane npm install pomija migrację i commit i kończy się kodem 1", async () => {
    const h = await harness({
      results: { [NPM_INSTALL]: { code: 1, stderr: "ERESOLVE" } },
    });
    await expect(
      run(
        ["my-app", "--kit", h.kitDir, "--yes", "--admin-email", "a@b.co"],
        h.deps,
      ),
    ).resolves.toBe(1);
    expect(steps(h)).not.toContain(MIGRATE);
    expect(steps(h)).not.toContain(ADMIN_CREATE);
    expect(steps(h)).not.toContain(GIT_ADD);
    expect(steps(h)).not.toContain(COMMIT);
    expect(output(h)).toContain("npm install failed");
    expect(nextStepsOf(h)).toContain("npm install");
    expect(nextStepsOf(h)).toContain(COMMIT_HINT);
  });

  it("nieudane npm install bez Dockera też nie commituje", async () => {
    const h = await harness({ results: { [NPM_INSTALL]: { code: 1 } } });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-docker"], h.deps),
    ).resolves.toBe(1);
    expect(steps(h)).toEqual([GATO_CREATE, GIT_INIT, NPM_INSTALL]);
  });

  it("nieudana migracja pomija admin:create, commituje i kończy się kodem 1", async () => {
    const h = await harness({
      results: { "npx prisma": { code: 1, stderr: "P1001" } },
    });
    await expect(
      run(
        ["my-app", "--kit", h.kitDir, "--yes", "--admin-email", "a@b.co"],
        h.deps,
      ),
    ).resolves.toBe(1);
    expect(steps(h)).toContain(MIGRATE);
    expect(steps(h)).not.toContain(ADMIN_CREATE);
    expect(steps(h).at(-1)).toBe(COMMIT);
    expect(nextStepsOf(h)).toContain("npx prisma migrate dev --name init");
  });

  it("nieudane admin:create kończy się kodem 1", async () => {
    const h = await harness({
      results: { "npm run admin:create": { code: 1 } },
    });
    await expect(
      run(
        ["my-app", "--kit", h.kitDir, "--yes", "--admin-email", "a@b.co"],
        h.deps,
      ),
    ).resolves.toBe(1);
    expect(nextStepsOf(h)).toContain("npm run admin:create -- --email a@b.co");
  });

  it("nieudany pierwszy commit to tylko ostrzeżenie z kodem 0", async () => {
    const h = await harness({
      results: { "git commit": { code: 1, stderr: "Author identity unknown" } },
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(0);
    expect(output(h)).toContain("Could not create the first commit");
    expect(nextStepsOf(h)).toContain(COMMIT_HINT);
  });

  it("--no-git nie uruchamia git", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--no-git"], h.deps),
    ).resolves.toBe(0);
    expect(h.calls.some((call) => call.command === "git")).toBe(false);
    expect(nextStepsOf(h)).not.toContain(COMMIT_HINT);
  });

  it("nieudane gato create pokazuje jego wyjście, kończy się kodem 1 i nic więcej nie uruchamia", async () => {
    const h = await harness({
      results: { [GATO_CREATE]: { code: 2, stderr: "boom" } },
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain("boom");
    expect(steps(h)).toEqual([GATO_CREATE]);
  });
});

describe("run: porty z .env projektu i dodatkowe porażki", () => {
  it("DB_PORT z .env projektu zmienia sprawdzany port, a zakomentowana linia nie", async () => {
    const h = await harness({
      projectEnvExtra: "DB_PORT=5544\n# DB_PORT=6000\n",
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(0);
    expect(h.probed).toContain(5544);
    expect(h.probed).not.toContain(5432);
    expect(h.probed).not.toContain(6000);
  });

  it("zajęte porty MinIO dostają różne wolne porty", async () => {
    const h = await harness({ busy: [9000, 9001] });
    await expect(
      run(
        [
          "my-app",
          "--kit",
          h.kitDir,
          "--yes",
          "--modules",
          "uploads",
          "--storage",
          "s3",
        ],
        h.deps,
      ),
    ).resolves.toBe(1);
    expect(output(h)).toContain("MINIO_PORT=9002");
    expect(output(h)).toContain("MINIO_CONSOLE_PORT=9003");
    expect(steps(h).some((name) => name.startsWith("docker compose"))).toBe(
      false,
    );
  });

  it("nieudany git init ostrzega, nie commituje i nie podpowiada commita", async () => {
    const h = await harness({
      results: { [GIT_INIT]: { code: 1, stderr: "fatal" } },
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-docker"], h.deps),
    ).resolves.toBe(0);
    expect(steps(h)).not.toContain(GIT_ADD);
    expect(steps(h)).not.toContain(COMMIT);
    expect(nextStepsOf(h)).not.toContain(COMMIT_HINT);
  });

  it("nieudany git add nie uruchamia git commit i ostrzega", async () => {
    const h = await harness({
      results: { [GIT_ADD]: { code: 1, stderr: "fatal" } },
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-docker"], h.deps),
    ).resolves.toBe(0);
    expect(steps(h)).toContain(GIT_ADD);
    expect(steps(h)).not.toContain(COMMIT);
    expect(output(h)).toContain("Could not create the first commit");
  });

  it("brak programu docker kończy się kodem 1 i komunikatem o niedostępnym Dockerze", async () => {
    const h = await harness({ rejects: ["docker"] });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain("Docker is not available");
    expect(steps(h)).not.toContain(MIGRATE);
  });

  it("odrzucone uruchomienie admin:create kończy się kodem 1", async () => {
    const h = await harness({ rejects: ["npm run admin:create"] });
    await expect(
      run(
        ["my-app", "--kit", h.kitDir, "--yes", "--admin-email", "a@b.co"],
        h.deps,
      ),
    ).resolves.toBe(1);
  });
});

describe("run: pytania interaktywne", () => {
  it("odpowiedzi z promptera trafiają do gato create i .env", async () => {
    const h = await harness({
      script: [
        { method: "multiselect", answer: ["uploads"] },
        { method: "confirm", answer: false },
        { method: "text", answer: "Sklep" },
        { method: "text", answer: "" },
        { method: "select", answer: "local" },
        { method: "select", answer: "smtp" },
        { method: "text", answer: "127.0.0.1" },
        { method: "confirm", answer: false },
      ],
    });
    await expect(run(["my-app", "--kit", h.kitDir], h.deps)).resolves.toBe(0);
    expect(callNamed(h, GATO_CREATE).args).toEqual([
      GATO,
      "create",
      h.projectDir,
      "--yes",
      "--no-install",
      "--no-git",
      "--modules=uploads",
      "--locales=pl",
      "--title=Sklep",
      `--kit=${h.kitDir}`,
    ]);
    expect(h.calls.some((call) => call.command === "docker")).toBe(false);
    expect(await projectEnv(h)).toContain("STORAGE_PROVIDER=local");
  });

  it("a chosen relay goes to .env with SMTP_URL blanked", async () => {
    const h = await harness({
      script: [
        { method: "multiselect", answer: [] },
        { method: "confirm", answer: true },
        { method: "text", answer: "Sklep" },
        { method: "text", answer: "" },
        { method: "select", answer: "smtp" },
        { method: "text", answer: "relay.internal" },
        { method: "text", answer: "2525" },
        { method: "text", answer: "" },
        { method: "confirm", answer: false },
      ],
    });
    await expect(run(["my-app", "--kit", h.kitDir], h.deps)).resolves.toBe(0);
    const env = await projectEnv(h);
    expect(env.filter((line) => line.startsWith("SMTP_URL="))).toEqual([
      "SMTP_URL=",
    ]);
    expect(env).toContain("MAIL_PROVIDER=smtp");
    expect(env).toContain("SMTP_HOST=relay.internal");
    expect(env).toContain("SMTP_PORT=2525");
    expect(env.some((line) => line.startsWith("SMTP_USER="))).toBe(false);
  });
});

describe("run: mail in .env", () => {
  it("--yes without mail flags keeps the local mailpit SMTP_URL and writes no MAIL_PROVIDER", async () => {
    const h = await harness();
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-docker"], h.deps),
    ).resolves.toBe(0);
    const env = await projectEnv(h);
    expect(env.filter((line) => line.startsWith("SMTP_URL="))).toEqual([
      "SMTP_URL=smtp://localhost:1025",
    ]);
    expect(env.some((line) => line.startsWith("MAIL_PROVIDER="))).toBe(false);
  });

  it("--yes --mail-provider console writes MAIL_PROVIDER=console and an empty SMTP_URL", async () => {
    const h = await harness();
    await expect(
      run(
        [
          "my-app",
          "--kit",
          h.kitDir,
          "--yes",
          "--skip-docker",
          "--mail-provider",
          "console",
        ],
        h.deps,
      ),
    ).resolves.toBe(0);
    const env = await projectEnv(h);
    expect(env).toContain("MAIL_PROVIDER=console");
    expect(env.filter((line) => line.startsWith("SMTP_URL="))).toEqual([
      "SMTP_URL=",
    ]);
  });

  it("--yes --mail-provider resend writes the key", async () => {
    const h = await harness();
    await expect(
      run(
        [
          "my-app",
          "--kit",
          h.kitDir,
          "--yes",
          "--skip-docker",
          "--mail-provider",
          "resend",
          "--resend-api-key",
          "re_x",
        ],
        h.deps,
      ),
    ).resolves.toBe(0);
    const env = await projectEnv(h);
    expect(env).toContain("MAIL_PROVIDER=resend");
    expect(env).toContain("RESEND_API_KEY=re_x");
    expect(env.filter((line) => line.startsWith("SMTP_URL="))).toEqual([
      "SMTP_URL=",
    ]);
  });
});

describe("run: zakres Node z kitu", () => {
  it("kit wymagający ^24.0.0 odrzuca Node v22.23.2 przed jakimkolwiek procesem, także z --yes", async () => {
    const h = await harness({
      nodeVersion: "v22.23.2",
      kitPackageJson: { engines: { node: "^24.0.0" } },
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain("too old");
    expect(h.calls).toEqual([]);
    expect(existsSync(h.projectDir)).toBe(false);
  });

  it("z --skip-install ten sam Node tylko ostrzega i kreator idzie dalej", async () => {
    const h = await harness({
      nodeVersion: "v22.23.2",
      kitPackageJson: { engines: { node: "^24.0.0" } },
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(output(h)).toContain("too old");
    expect(steps(h)).toEqual([GATO_CREATE, GIT_INIT]);
  });

  it("nieparzysty Node jest odrzucony z zakresem kitu", async () => {
    const h = await harness({ nodeVersion: "v23.3.0" });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain(
      `Node 23.3.0 is an unsupported odd-numbered release line: GatoJS supports Node ${KIT_NODE_RANGE}.`,
    );
    expect(h.calls).toEqual([]);
  });

  it("kit bez engines.node jest sprawdzany względem >=22", async () => {
    const h = await harness({
      nodeVersion: "v21.7.3",
      kitPackageJson: { name: "gatojs" },
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain(
      "Node 21.7.3 is too old: GatoJS needs Node >=22.",
    );
    expect(h.calls).toEqual([]);
  });

  it("kit bez engines.node przepuszcza Node 22.1.0", async () => {
    const h = await harness({
      nodeVersion: "v22.1.0",
      kitPackageJson: { name: "gatojs" },
    });
    await expect(
      run(["my-app", "--kit", h.kitDir, "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(steps(h)).toEqual([GATO_CREATE, GIT_INIT]);
  });
});

describe("run: pobieranie kitu", () => {
  it("bez --kit-version pobiera listę tagów, potem package.json najwyższego tagu, potem archiwum", async () => {
    const h = await harness({
      routes: {
        [TAGS_PAGE_1]: jsonResponse([
          { name: "v0.1.0" },
          { name: "v0.2.0" },
          { name: "v0.10.0-rc.1" },
        ]),
        [CONTENTS_020]: KIT_PACKAGE,
        [CODELOAD_TARBALL_020]: bytesResponse([1]),
      },
    });
    await expect(
      run(["my-app", "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      TAGS_PAGE_1,
      CONTENTS_020,
      CODELOAD_TARBALL_020,
    ]);
  });

  it("za stary Node wobec engines kitu z GitHuba jest odrzucony przed pobraniem archiwum", async () => {
    const h = await harness({
      nodeVersion: "v22.1.0",
      routes: {
        [TAGS_PAGE_1]: jsonResponse([{ name: "v0.1.0" }]),
        [CONTENTS_010]: KIT_PACKAGE,
        [CODELOAD_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(run(["my-app", "--yes"], h.deps)).resolves.toBe(1);
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      TAGS_PAGE_1,
      CONTENTS_010,
    ]);
    expect(output(h)).toContain("too old");
    expect(h.calls).toEqual([]);
    expect(h.removed).toEqual(h.tempDirs);
  });

  it("--yes nie omija sprawdzenia Node przy pobieraniu wskazanej wersji", async () => {
    const h = await harness({
      nodeVersion: "v20.0.0",
      routes: {
        [CONTENTS_010]: KIT_PACKAGE,
        [CODELOAD_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(
      run(["my-app", "--kit-version", "0.1.0", "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(h.fetchCalls.map((call) => call.url)).toEqual([CONTENTS_010]);
    expect(output(h)).toContain(
      `Node 20.0.0 is too old: GatoJS needs Node ${KIT_NODE_RANGE}.`,
    );
    expect(h.calls).toEqual([]);
  });

  it("kit z GitHuba bez engines.node przepuszcza Node 22.1.0", async () => {
    const h = await harness({
      nodeVersion: "v22.1.0",
      routes: {
        [TAGS_PAGE_1]: jsonResponse([{ name: "v0.1.0" }]),
        [CONTENTS_010]: contentsResponse({ name: "gatojs" }),
        [CODELOAD_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(
      run(["my-app", "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      TAGS_PAGE_1,
      CONTENTS_010,
      CODELOAD_TARBALL_010,
    ]);
  });

  it("niezrozumiały zakres Node kitu daje ostrzeżenie i sprawdzenie względem >=22", async () => {
    const h = await harness({
      routes: {
        [CONTENTS_010]: contentsResponse({ engines: { node: "22.x" } }),
        [CODELOAD_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(
      run(
        ["my-app", "--kit-version", "0.1.0", "--yes", "--skip-install"],
        h.deps,
      ),
    ).resolves.toBe(0);
    expect(output(h)).toContain(
      `The kit's Node range "22.x" is not one create-gato-app understands; checking against >=22 instead.`,
    );
  });

  it("pobiera wskazaną wersję z tokenem z env, przekazuje kit do gato create i usuwa katalog tymczasowy", async () => {
    const h = await harness({
      env: { GITHUB_TOKEN: "tok" },
      routes: {
        [CONTENTS_010]: KIT_PACKAGE,
        [API_TARBALL_010]: bytesResponse([31, 139]),
      },
    });
    await expect(
      run(
        ["my-app", "--kit-version", "0.1.0", "--yes", "--skip-install"],
        h.deps,
      ),
    ).resolves.toBe(0);
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      CONTENTS_010,
      API_TARBALL_010,
    ]);
    expect(h.fetchCalls.map((call) => call.headers.Authorization)).toEqual([
      "Bearer tok",
      "Bearer tok",
    ]);
    expect(h.tempDirs).toHaveLength(1);
    const tmp = h.tempDirs[0] as string;
    expect(h.calls.slice(0, 3).map((call) => call.command)).toEqual([
      "tar",
      "git",
      "git",
    ]);
    expect(callNamed(h, GATO_CREATE).args.at(-1)).toBe(`--kit=${tmp}/kit`);
    expect(h.removed).toEqual([tmp]);
    expect(h.events.indexOf("remove")).toBeGreaterThan(
      h.events.indexOf(`spawn ${GATO_CREATE}`),
    );
  });

  it("moduły pochodzą z pobranego kitu", async () => {
    const h = await harness({
      routes: {
        [CONTENTS_010]: KIT_PACKAGE,
        [CODELOAD_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(
      run(
        [
          "my-app",
          "--kit-version",
          "0.1.0",
          "--yes",
          "--skip-install",
          "--modules",
          "api-keys",
        ],
        h.deps,
      ),
    ).resolves.toBe(0);
    expect(callNamed(h, GATO_CREATE).args).toContain("--modules=api-keys");
  });

  it("bez tokenu pobiera z codeload bez Authorization", async () => {
    const h = await harness({
      routes: {
        [CONTENTS_010]: KIT_PACKAGE,
        [CODELOAD_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(
      run(
        ["my-app", "--kit-version", "0.1.0", "--yes", "--skip-install"],
        h.deps,
      ),
    ).resolves.toBe(0);
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      CONTENTS_010,
      CODELOAD_TARBALL_010,
    ]);
    for (const call of h.fetchCalls) {
      expect(call.headers).not.toHaveProperty("Authorization");
    }
  });

  it("używa tokenu z gh, gdy env go nie ma", async () => {
    const h = await harness({
      gh: "gho_fromgh\n",
      routes: {
        [CONTENTS_010]: KIT_PACKAGE,
        [API_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(
      run(
        ["my-app", "--kit-version", "0.1.0", "--yes", "--skip-install"],
        h.deps,
      ),
    ).resolves.toBe(0);
    expect(h.fetchCalls.at(-1)?.headers.Authorization).toBe(
      "Bearer gho_fromgh",
    );
  });

  it("nieudane gato create z pobranym kitem daje kod 1 i usuwa katalog tymczasowy", async () => {
    const h = await harness({
      results: { [GATO_CREATE]: { code: 2, stderr: "boom" } },
      routes: {
        [CONTENTS_010]: KIT_PACKAGE,
        [CODELOAD_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(
      run(["my-app", "--kit-version", "0.1.0", "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(h.removed).toEqual(h.tempDirs);
    expect(h.removed).toHaveLength(1);
  });

  it("błąd tar daje kod 1, usuwa katalog tymczasowy i nie uruchamia gato create", async () => {
    const h = await harness({
      env: { GITHUB_TOKEN: SECRET },
      tarResult: {
        code: 2,
        stdout: "",
        stderr: "gzip: stdin: not in gzip format",
      },
      routes: {
        [CONTENTS_010]: KIT_PACKAGE,
        [API_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(
      run(["my-app", "--kit-version", "0.1.0", "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain("Could not extract");
    expect(h.removed).toEqual(h.tempDirs);
    expect(h.removed).toHaveLength(1);
    expect(h.calls.map((call) => call.command)).toEqual(["tar"]);
    expect(output(h)).not.toContain(SECRET);
  });

  it("404 na archiwum daje kod 1, podpowiada prywatne repozytorium i usuwa katalog tymczasowy", async () => {
    const h = await harness({
      routes: {
        [CONTENTS_010]: KIT_PACKAGE,
        [CODELOAD_TARBALL_010]: statusResponse(404),
      },
    });
    await expect(
      run(["my-app", "--kit-version", "0.1.0", "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain("may be private");
    expect(h.removed).toEqual(h.tempDirs);
    expect(h.calls).toEqual([]);
  });

  it("404 na package.json kitu daje kod 1 bez pobierania archiwum", async () => {
    const h = await harness({
      routes: {
        [CONTENTS_010]: statusResponse(404),
        [CODELOAD_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(
      run(["my-app", "--kit-version", "0.1.0", "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain("GitHub returned 404");
    expect(h.fetchCalls.map((call) => call.url)).toEqual([CONTENTS_010]);
    expect(h.calls).toEqual([]);
  });

  it("404 z tokenem nigdy nie wypisuje tokenu", async () => {
    const h = await harness({
      env: { GITHUB_TOKEN: SECRET },
      routes: {
        [CONTENTS_010]: KIT_PACKAGE,
        [API_TARBALL_010]: statusResponse(404),
      },
    });
    await expect(
      run(["my-app", "--kit-version", "0.1.0", "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(output(h)).toContain("404");
    expect(output(h)).not.toContain(SECRET);
  });

  it("udane pobranie nigdy nie wypisuje tokenu", async () => {
    const h = await harness({
      env: { GITHUB_TOKEN: SECRET },
      routes: {
        [TAGS_PAGE_1]: jsonResponse([{ name: "v0.1.0" }]),
        [CONTENTS_010]: KIT_PACKAGE,
        [API_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(
      run(["my-app", "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(output(h)).not.toContain(SECRET);
  });

  it("błąd listy tagów daje kod 1 bez wypisania tokenu", async () => {
    const h = await harness({
      env: { GITHUB_TOKEN: SECRET },
      routes: { [TAGS_PAGE_1]: statusResponse(401) },
    });
    await expect(run(["my-app", "--yes"], h.deps)).resolves.toBe(1);
    expect(output(h)).toContain("401");
    expect(output(h)).not.toContain(SECRET);
    expect(h.calls).toEqual([]);
    expect(h.removed).toEqual(h.tempDirs);
  });
});

describe("run: odrzucony token jest raz ponawiany bez niego", () => {
  const BOGUS = "bogus";

  type Route = { withToken?: HttpResponse; anonymous?: HttpResponse };

  function routeByToken(h: Harness, routes: Record<string, Route>): void {
    h.deps.fetch = async (url, init) => {
      h.fetchCalls.push({ url, headers: init.headers });
      h.events.push(`fetch ${url}`);
      const route = routes[url];
      const response =
        init.headers.Authorization === undefined
          ? route?.anonymous
          : route?.withToken;
      if (!response) throw new Error(`unexpected request: ${url}`);
      return response;
    };
  }

  function retryWarnings(h: Harness): number {
    return lines(h).filter((line) => line === RETRY_WARNING).length;
  }

  it("401 na liście tagów ponawia listę, package.json i archiwum bez tokenu", async () => {
    const h = await harness({ env: { GITHUB_TOKEN: BOGUS } });
    routeByToken(h, {
      [TAGS_PAGE_1]: {
        withToken: statusResponse(401),
        anonymous: jsonResponse([{ name: "v0.1.0" }, { name: "v0.2.0" }]),
      },
      [CONTENTS_020]: { anonymous: KIT_PACKAGE },
      [CODELOAD_TARBALL_020]: { anonymous: bytesResponse([1]) },
    });
    await expect(
      run(["my-app", "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      TAGS_PAGE_1,
      TAGS_PAGE_1,
      CONTENTS_020,
      CODELOAD_TARBALL_020,
    ]);
    expect(h.fetchCalls.map((call) => call.headers.Authorization)).toEqual([
      "Bearer bogus",
      undefined,
      undefined,
      undefined,
    ]);
    expect(retryWarnings(h)).toBe(1);
    expect(steps(h).filter((name) => name === GATO_CREATE)).toHaveLength(1);
  });

  it("401 na package.json kitu ponawia bez tokenu", async () => {
    const h = await harness({ env: { GITHUB_TOKEN: BOGUS } });
    routeByToken(h, {
      [CONTENTS_010]: {
        withToken: statusResponse(401),
        anonymous: KIT_PACKAGE,
      },
      [CODELOAD_TARBALL_010]: { anonymous: bytesResponse([1]) },
    });
    await expect(
      run(
        ["my-app", "--kit-version", "0.1.0", "--yes", "--skip-install"],
        h.deps,
      ),
    ).resolves.toBe(0);
    const contents = h.fetchCalls.filter((call) => call.url === CONTENTS_010);
    expect(contents.map((call) => call.headers.Authorization)).toEqual([
      "Bearer bogus",
      undefined,
    ]);
    expect(h.fetchCalls.at(-1)?.url).toBe(CODELOAD_TARBALL_010);
    expect(retryWarnings(h)).toBe(1);
  });

  it("401 na archiwum z API przechodzi na codeload bez tokenu", async () => {
    const h = await harness({ env: { GITHUB_TOKEN: BOGUS } });
    routeByToken(h, {
      [CONTENTS_010]: { withToken: KIT_PACKAGE, anonymous: KIT_PACKAGE },
      [API_TARBALL_010]: { withToken: statusResponse(401) },
      [CODELOAD_TARBALL_010]: { anonymous: bytesResponse([1]) },
    });
    await expect(
      run(
        ["my-app", "--kit-version", "0.1.0", "--yes", "--skip-install"],
        h.deps,
      ),
    ).resolves.toBe(0);
    const tarballs = h.fetchCalls.filter((call) => call.url !== CONTENTS_010);
    expect(tarballs.map((call) => call.url)).toEqual([
      API_TARBALL_010,
      CODELOAD_TARBALL_010,
    ]);
    expect(tarballs.map((call) => call.headers.Authorization)).toEqual([
      "Bearer bogus",
      undefined,
    ]);
    expect(retryWarnings(h)).toBe(1);
    expect(steps(h)).toEqual([GATO_CREATE, GIT_INIT]);
  });

  it("ponowienie nigdy nie wypisuje tokenu", async () => {
    const h = await harness({ env: { GITHUB_TOKEN: SECRET } });
    routeByToken(h, {
      [TAGS_PAGE_1]: {
        withToken: statusResponse(401),
        anonymous: jsonResponse([{ name: "v0.1.0" }]),
      },
      [CONTENTS_010]: { anonymous: KIT_PACKAGE },
      [CODELOAD_TARBALL_010]: { anonymous: bytesResponse([1]) },
    });
    await expect(
      run(["my-app", "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(output(h)).not.toContain(SECRET);
  });

  it("drugie 401 bez tokenu kończy się błędem bez kolejnego ponowienia", async () => {
    const h = await harness({ env: { GITHUB_TOKEN: BOGUS } });
    routeByToken(h, {
      [TAGS_PAGE_1]: {
        withToken: statusResponse(401),
        anonymous: statusResponse(401),
      },
    });
    await expect(run(["my-app", "--yes"], h.deps)).resolves.toBe(1);
    expect(h.fetchCalls.map((call) => call.headers.Authorization)).toEqual([
      "Bearer bogus",
      undefined,
    ]);
    expect(retryWarnings(h)).toBe(1);
    expect(output(h)).toContain("GitHub returned 401 for the tag list.");
    expect(h.calls).toEqual([]);
  });

  it.each([403, 404, 429, 500])(
    "%i z tokenem nie jest ponawiane",
    async (status) => {
      const h = await harness({ env: { GITHUB_TOKEN: BOGUS } });
      routeByToken(h, {
        [TAGS_PAGE_1]: {
          withToken: statusResponse(status),
          anonymous: jsonResponse([{ name: "v0.1.0" }]),
        },
        [CONTENTS_010]: { anonymous: KIT_PACKAGE },
        [CODELOAD_TARBALL_010]: { anonymous: bytesResponse([1]) },
      });
      await expect(run(["my-app", "--yes"], h.deps)).resolves.toBe(1);
      expect(h.fetchCalls.map((call) => call.headers.Authorization)).toEqual([
        "Bearer bogus",
      ]);
      expect(output(h)).toContain(`GitHub returned ${status}`);
      expect(retryWarnings(h)).toBe(0);
    },
  );

  it("401 bez żadnego tokenu nie jest ponawiane", async () => {
    const h = await harness();
    routeByToken(h, {
      [CONTENTS_010]: { anonymous: KIT_PACKAGE },
      [CODELOAD_TARBALL_010]: { anonymous: statusResponse(401) },
    });
    await expect(
      run(["my-app", "--kit-version", "0.1.0", "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(
      h.fetchCalls.filter((call) => call.url === CODELOAD_TARBALL_010),
    ).toHaveLength(1);
    expect(retryWarnings(h)).toBe(0);
  });
});

const NAME_ERROR_SUFFIX =
  "use lowercase letters, digits and hyphens, start with a letter, 2-50 characters";
const FIFTY = `a${"b".repeat(49)}`;
const FIFTY_ONE = `a${"b".repeat(50)}`;

describe("run: nazwa projektu", () => {
  it.each(["Bad Name", "UPPER", "123app", "a", "ąę", FIFTY_ONE])(
    "%j jest odrzucona przed pobraniem z kodem 1",
    async (target) => {
      const h = await harness({
        env: { GITHUB_TOKEN: SECRET },
        routes: { [TAGS_PAGE_1]: jsonResponse([{ name: "v0.1.0" }]) },
      });
      await expect(run([target, "--yes"], h.deps)).resolves.toBe(1);
      expect(lines(h)).toContain(
        `Project name "${target}": ${NAME_ERROR_SUFFIX}`,
      );
      expect(h.fetchCalls).toEqual([]);
      expect(h.calls).toEqual([]);
      expect(h.tempDirs).toEqual([]);
    },
  );

  it("nazwą jest ostatni segment ścieżki", async () => {
    const h = await harness();
    await expect(
      run(["nested/Bad Dir", "--kit", h.kitDir, "--yes"], h.deps),
    ).resolves.toBe(1);
    expect(lines(h)).toContain(`Project name "Bad Dir": ${NAME_ERROR_SUFFIX}`);
    expect(h.calls).toEqual([]);
  });

  it(". w źle nazwanym cwd jest odrzucona z nazwą cwd", async () => {
    const h = await harness({ cwdName: "Bad Dir" });
    await expect(run([".", "--kit", h.kitDir, "--yes"], h.deps)).resolves.toBe(
      1,
    );
    expect(lines(h)).toContain(`Project name "Bad Dir": ${NAME_ERROR_SUFFIX}`);
    expect(h.calls).toEqual([]);
  });

  it.each(["ab", FIFTY, "nested/dir/my-app"])(
    "%j jest przyjęta i przekazana do gato create",
    async (target) => {
      const h = await harness();
      await expect(
        run([target, "--kit", h.kitDir, "--yes", "--skip-install"], h.deps),
      ).resolves.toBe(0);
      expect(callNamed(h, GATO_CREATE).args[2]).toBe(join(h.cwd, target));
    },
  );

  it(". w pustym cwd o poprawnej nazwie tworzy projekt w cwd bez kroku cd", async () => {
    const h = await harness({ cwdName: "acme-crm" });
    h.projectDir = h.cwd;
    await expect(
      run([".", "--kit", h.kitDir, "--yes", "--skip-install"], h.deps),
    ).resolves.toBe(0);
    expect(callNamed(h, GATO_CREATE).args[2]).toBe(h.cwd);
    expect(callNamed(h, GATO_CREATE).args).toContain("--title=Acme Crm");
    expect(nextStepsOf(h)[0]).toBe("npm install");
  });

  test.prop(
    [
      fc
        .string({ minLength: 1, maxLength: 60 })
        .filter(
          (name) =>
            !/^[a-z][a-z0-9-]{1,49}$/.test(name) &&
            !name.includes("/") &&
            !/[\n\r]/.test(name) &&
            !name.startsWith("-") &&
            name !== "." &&
            name !== "..",
        ),
    ],
    { numRuns: 40 },
  )(
    "każda inna nazwa jednosegmentowa jest odrzucona bez skutków ubocznych",
    async (name) => {
      const h = await harness();
      await expect(
        run([name, "--kit", h.kitDir, "--yes"], h.deps),
      ).resolves.toBe(1);
      expect(lines(h)).toContain(
        `Project name "${name}": ${NAME_ERROR_SUFFIX}`,
      );
      expect(h.calls).toEqual([]);
      expect(h.fetchCalls).toEqual([]);
    },
  );
});
