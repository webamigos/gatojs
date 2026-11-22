import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { USAGE } from "../args.js";
import { run, type CliDeps } from "../cli.js";
import type { FetchLike, HttpResponse } from "../github.js";
import type { Spawn, SpawnResult } from "../kit-download.js";
import { bytesResponse, jsonResponse, statusResponse } from "./fake-http.js";

const SECRET = "ghp_SECRET_TOKEN_123";
const NODE = "/usr/local/bin/node";
const GATO = "/nm/gato-cli/dist/gato.mjs";
const TAGS_PAGE_1 =
  "https://api.github.com/repos/webamigos/gatojs/tags?per_page=100&page=1";
const API_TARBALL_010 =
  "https://api.github.com/repos/webamigos/gatojs/tarball/refs/tags/v0.1.0";
const CODELOAD_TARBALL_010 =
  "https://codeload.github.com/webamigos/gatojs/tar.gz/refs/tags/v0.1.0";
const CODELOAD_TARBALL_020 =
  "https://codeload.github.com/webamigos/gatojs/tar.gz/refs/tags/v0.2.0";

type SpawnCall = {
  command: string;
  args: string[];
  options: { cwd?: string; stdio: "inherit" | "pipe" };
};

type Harness = {
  deps: CliDeps;
  events: string[];
  fetchCalls: { url: string; headers: Record<string, string> }[];
  spawnCalls: SpawnCall[];
  tempDirs: string[];
  removed: string[];
  logs: string[];
  errors: string[];
  ghAuthToken: ReturnType<typeof vi.fn>;
  makeTempDir: ReturnType<typeof vi.fn>;
};

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function harness(options: {
  nodeVersion?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  gh?: string | null;
  routes?: Record<string, HttpResponse>;
  childCode?: number;
  tarResult?: SpawnResult;
}): Harness {
  const events: string[] = [];
  const fetchCalls: Harness["fetchCalls"] = [];
  const spawnCalls: SpawnCall[] = [];
  const tempDirs: string[] = [];
  const removed: string[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  const routes = options.routes ?? {};

  const fetch: FetchLike = async (url, init) => {
    fetchCalls.push({ url, headers: init.headers });
    events.push(`fetch ${url}`);
    const response = routes[url];
    if (!response) throw new Error(`unexpected request: ${url}`);
    return response;
  };

  const spawn: Spawn = async (command, args, spawnOptions) => {
    spawnCalls.push({ command, args, options: spawnOptions });
    events.push(`spawn ${command}`);
    if (command === "tar") {
      return options.tarResult ?? { code: 0, stdout: "", stderr: "" };
    }
    if (command === "git") return { code: 0, stdout: "", stderr: "" };
    events.push(`exit ${command}`);
    return { code: options.childCode ?? 0, stdout: "", stderr: "" };
  };

  const ghAuthToken = vi.fn(async () => options.gh ?? null);
  const makeTempDir = vi.fn(async () => {
    const dir = await mkdtemp(join(tmpdir(), "create-gato-app-cli-"));
    createdDirs.push(dir);
    tempDirs.push(dir);
    events.push("mktemp");
    return dir;
  });
  const removeDir = async (dir: string) => {
    removed.push(dir);
    events.push("remove");
    await rm(dir, { recursive: true, force: true });
  };

  return {
    deps: {
      nodeVersion: options.nodeVersion ?? "v22.11.0",
      nodePath: NODE,
      gatoBin: GATO,
      env: options.env ?? {},
      cwd: options.cwd ?? "/work",
      packageVersion: "9.8.7",
      fetch,
      spawn,
      ghAuthToken,
      makeTempDir,
      removeDir,
      log: (line) => {
        logs.push(line);
      },
      error: (line) => {
        errors.push(line);
      },
    },
    events,
    fetchCalls,
    spawnCalls,
    tempDirs,
    removed,
    logs,
    errors,
    ghAuthToken,
    makeTempDir,
  };
}

function output(h: Harness): string {
  return [...h.logs, ...h.errors].join("\n");
}

describe("run: help and version", () => {
  it("--version logs the package version exactly and does nothing else", async () => {
    const h = harness({});
    await expect(run(["--version"], h.deps)).resolves.toBe(0);
    expect(h.logs).toEqual(["9.8.7"]);
    expect(h.fetchCalls).toEqual([]);
    expect(h.spawnCalls).toEqual([]);
    expect(h.makeTempDir).not.toHaveBeenCalled();
  });

  it("--help logs the usage", async () => {
    const h = harness({});
    await expect(run(["--help"], h.deps)).resolves.toBe(0);
    expect(h.logs.join("\n")).toContain("create-gato-app <dir>");
    expect(h.logs).toContain(USAGE);
    expect(h.fetchCalls).toEqual([]);
    expect(h.spawnCalls).toEqual([]);
  });

  it("--help works even on an unsupported Node", async () => {
    const h = harness({ nodeVersion: "v20.0.0" });
    await expect(run(["--help"], h.deps)).resolves.toBe(0);
  });
});

describe("run: parse errors", () => {
  it.each([
    [
      ["app", "--kit", "../kit", "--kit-version", "0.1.0"],
      "--kit and --kit-version cannot be used together",
    ],
    [[], "Missing project directory"],
    [["app", "--skip-docker"], "--skip-docker is not supported yet"],
  ])(
    "%j prints the error and returns 1 without side effects",
    async (argv, message) => {
      const h = harness({});
      await expect(run(argv, h.deps)).resolves.toBe(1);
      expect(h.errors.join("\n")).toContain(message);
      expect(h.fetchCalls).toEqual([]);
      expect(h.spawnCalls).toEqual([]);
      expect(h.makeTempDir).not.toHaveBeenCalled();
    },
  );
});

describe("run: Node check", () => {
  it.each([
    [["app", "--kit-version", "0.1.0"]],
    [["app", "--kit-version", "0.1.0", "--yes"]],
    [["app", "--yes"]],
    [["app", "--kit", "/k", "--yes"]],
  ])("%j on Node v20.0.0 refuses before any download", async (argv) => {
    const h = harness({
      nodeVersion: "v20.0.0",
      env: { GITHUB_TOKEN: SECRET },
      routes: {
        [TAGS_PAGE_1]: jsonResponse([{ name: "v0.1.0" }]),
        [API_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(run(argv, h.deps)).resolves.toBe(1);
    expect(h.errors.join("\n")).toContain("too old");
    expect(h.fetchCalls).toEqual([]);
    expect(h.spawnCalls).toEqual([]);
    expect(h.makeTempDir).not.toHaveBeenCalled();
  });

  it("--skip-install on Node v20.0.0 warns and still delegates", async () => {
    const h = harness({ nodeVersion: "v20.0.0", childCode: 5 });
    await expect(
      run(["app", "--skip-install", "--kit", "/k"], h.deps),
    ).resolves.toBe(5);
    expect(h.errors.join("\n")).toContain("too old");
    expect(h.spawnCalls).toEqual([
      {
        command: NODE,
        args: [GATO, "create", "app", "--no-install", "--kit", "/k"],
        options: { cwd: "/work", stdio: "inherit" },
      },
    ]);
  });
});

describe("run: local kit", () => {
  it.each([0, 3])(
    "resolves --kit against cwd and returns the child's code %i",
    async (code) => {
      const h = harness({ cwd: "/work", childCode: code });
      await expect(
        run(["app", "--kit", "../kit", "--yes"], h.deps),
      ).resolves.toBe(code);
      expect(h.fetchCalls).toEqual([]);
      expect(h.makeTempDir).not.toHaveBeenCalled();
      expect(h.spawnCalls).toEqual([
        {
          command: NODE,
          args: [GATO, "create", "app", "--yes", "--kit", "/kit"],
          options: { cwd: "/work", stdio: "inherit" },
        },
      ]);
    },
  );

  it("resolves a relative --kit against a different cwd", async () => {
    const h = harness({ cwd: "/home/me/projects" });
    await run(["app", "--kit=gatojs"], h.deps);
    expect(h.spawnCalls[0]).toMatchObject({ command: NODE });
    expect(h.spawnCalls[0]?.args).toEqual([
      GATO,
      "create",
      "app",
      "--kit",
      "/home/me/projects/gatojs",
    ]);
  });
});

describe("run: download", () => {
  it("downloads the requested version with the env token and delegates to it", async () => {
    const h = harness({
      env: { GITHUB_TOKEN: "tok" },
      childCode: 0,
      routes: { [API_TARBALL_010]: bytesResponse([31, 139]) },
    });
    await expect(
      run(["app", "--kit-version", "0.1.0", "--yes"], h.deps),
    ).resolves.toBe(0);

    expect(h.fetchCalls.map((call) => call.url)).toEqual([API_TARBALL_010]);
    expect(h.fetchCalls[0]?.headers.Authorization).toBe("Bearer tok");
    expect(h.tempDirs).toHaveLength(1);
    const tmp = h.tempDirs[0] as string;
    expect(h.spawnCalls.map((call) => call.command)).toEqual([
      "tar",
      "git",
      "git",
      NODE,
    ]);
    expect(h.spawnCalls[3]).toEqual({
      command: NODE,
      args: [GATO, "create", "app", "--yes", "--kit", `${tmp}/kit`],
      options: expect.objectContaining({ stdio: "inherit" }),
    });
    expect(h.removed).toEqual([tmp]);
    expect(h.events.indexOf("remove")).toBeGreaterThan(
      h.events.indexOf(`exit ${NODE}`),
    );
  });

  it("without --kit-version fetches the tag list first and uses the highest semver tag", async () => {
    const h = harness({
      routes: {
        [TAGS_PAGE_1]: jsonResponse([
          { name: "v0.1.0" },
          { name: "v0.2.0" },
          { name: "v0.10.0-rc.1" },
        ]),
        [CODELOAD_TARBALL_020]: bytesResponse([1]),
      },
    });
    await expect(run(["app", "--yes"], h.deps)).resolves.toBe(0);
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      TAGS_PAGE_1,
      CODELOAD_TARBALL_020,
    ]);
  });

  it("without any token downloads from codeload without Authorization", async () => {
    const h = harness({
      env: {},
      gh: null,
      routes: { [CODELOAD_TARBALL_010]: bytesResponse([1]) },
    });
    await expect(run(["app", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      0,
    );
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      CODELOAD_TARBALL_010,
    ]);
    expect(h.fetchCalls[0]?.headers).not.toHaveProperty("Authorization");
  });

  it("uses the gh token when env has none", async () => {
    const h = harness({
      env: {},
      gh: "gho_fromgh\n",
      routes: { [API_TARBALL_010]: bytesResponse([1]) },
    });
    await expect(run(["app", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      0,
    );
    expect(h.fetchCalls[0]?.headers.Authorization).toBe("Bearer gho_fromgh");
  });

  it("returns the child's non-zero code and removes the temp dir", async () => {
    const h = harness({
      childCode: 2,
      routes: { [CODELOAD_TARBALL_010]: bytesResponse([1]) },
    });
    await expect(run(["app", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      2,
    );
    expect(h.removed).toEqual(h.tempDirs);
    expect(h.removed).toHaveLength(1);
    expect(h.events.indexOf("remove")).toBeGreaterThan(
      h.events.indexOf(`exit ${NODE}`),
    );
  });

  it("a tar failure returns 1, prints the error, removes the temp dir and does not delegate", async () => {
    const h = harness({
      env: { GITHUB_TOKEN: SECRET },
      tarResult: {
        code: 2,
        stdout: "",
        stderr: "gzip: stdin: not in gzip format",
      },
      routes: { [API_TARBALL_010]: bytesResponse([1]) },
    });
    await expect(run(["app", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      1,
    );
    expect(h.errors.join("\n")).toContain("Could not extract");
    expect(h.removed).toEqual(h.tempDirs);
    expect(h.removed).toHaveLength(1);
    expect(h.spawnCalls.map((call) => call.command)).toEqual(["tar"]);
    expect(output(h)).not.toContain(SECRET);
  });

  it("a 404 on the tarball returns 1, hints at a private repo and removes the temp dir", async () => {
    const h = harness({
      env: {},
      gh: null,
      routes: { [CODELOAD_TARBALL_010]: statusResponse(404) },
    });
    await expect(run(["app", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      1,
    );
    expect(h.errors.join("\n")).toContain("may be private");
    expect(h.removed).toEqual(h.tempDirs);
    expect(h.removed).toHaveLength(1);
    expect(h.spawnCalls).toEqual([]);
  });

  it("a 404 with a token never prints the token", async () => {
    const h = harness({
      env: { GITHUB_TOKEN: SECRET },
      routes: { [API_TARBALL_010]: statusResponse(404) },
    });
    await expect(run(["app", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      1,
    );
    expect(h.errors.join("\n")).toContain("404");
    expect(output(h)).not.toContain(SECRET);
  });

  it("a successful download never prints the token", async () => {
    const h = harness({
      env: { GITHUB_TOKEN: SECRET },
      routes: {
        [TAGS_PAGE_1]: jsonResponse([{ name: "v0.1.0" }]),
        [API_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(run(["app"], h.deps)).resolves.toBe(0);
    expect(output(h)).not.toContain(SECRET);
  });

  it("a tag list failure returns 1 without leaking the token", async () => {
    const h = harness({
      env: { GITHUB_TOKEN: SECRET },
      routes: { [TAGS_PAGE_1]: statusResponse(401) },
    });
    await expect(run(["app"], h.deps)).resolves.toBe(1);
    expect(h.errors.join("\n")).toContain("401");
    expect(output(h)).not.toContain(SECRET);
    expect(h.spawnCalls).toEqual([]);
    expect(h.removed).toEqual(h.tempDirs);
  });
});

describe("run: delegation to gato-cli", () => {
  it("passes --cli-source through to gato create and keeps the target", async () => {
    const h = harness({ cwd: "/work" });
    await expect(
      run(
        [
          "app",
          "--kit",
          "/k",
          "--cli-source",
          "/t/gato-cli-0.2.0.tgz",
          "--yes",
        ],
        h.deps,
      ),
    ).resolves.toBe(0);
    expect(h.spawnCalls).toEqual([
      {
        command: NODE,
        args: [
          GATO,
          "create",
          "app",
          "--cli-source",
          "/t/gato-cli-0.2.0.tgz",
          "--yes",
          "--kit",
          "/k",
        ],
        options: { cwd: "/work", stdio: "inherit" },
      },
    ]);
  });

  it("uses the injected gato bin, not a fixed path", async () => {
    const h = harness({});
    h.deps.gatoBin = "/elsewhere/gato-cli/dist/gato.mjs";
    await run(["app", "--kit", "/k"], h.deps);
    expect(h.spawnCalls[0]?.args[0]).toBe("/elsewhere/gato-cli/dist/gato.mjs");
  });

  it("a downloaded kit is passed with --kit and its wa.mjs is never run", async () => {
    const h = harness({
      routes: { [CODELOAD_TARBALL_010]: bytesResponse([1]) },
    });
    await expect(run(["app", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      0,
    );
    const tmp = h.tempDirs[0] as string;
    const delegated = h.spawnCalls.filter((call) => call.command === NODE);
    expect(delegated).toHaveLength(1);
    expect(delegated[0]?.args).toEqual([
      GATO,
      "create",
      "app",
      "--kit",
      `${tmp}/kit`,
    ]);
    expect(
      h.spawnCalls.some((call) =>
        call.args.some((arg) => arg.includes("wa.mjs")),
      ),
    ).toBe(false);
  });

  it("an unsupported Node refuses before delegating even with --cli-source", async () => {
    const h = harness({ nodeVersion: "v21.7.3" });
    await expect(
      run(["app", "--kit", "/k", "--cli-source", "/t/x.tgz"], h.deps),
    ).resolves.toBe(1);
    expect(h.errors.join("\n")).toContain(">=22");
    expect(h.spawnCalls).toEqual([]);
  });
});
