import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
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
    [[""], "Missing project directory."],
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

const NAME_ERROR_SUFFIX =
  "use lowercase letters, digits and hyphens, start with a letter, 2-50 characters";
const FIFTY = `a${"b".repeat(49)}`;
const FIFTY_ONE = `a${"b".repeat(50)}`;

describe("run: project name validation", () => {
  it.each([
    ["Bad Name", "/work"],
    ["UPPER", "/work"],
    ["123app", "/work"],
    ["a", "/work"],
    ["ąę", "/work"],
    [FIFTY_ONE, "/work"],
  ])("%j is rejected before the download with exit 1", async (target, cwd) => {
    const h = harness({
      cwd,
      env: { GITHUB_TOKEN: SECRET },
      routes: {
        [TAGS_PAGE_1]: jsonResponse([{ name: "v0.1.0" }]),
        [API_TARBALL_010]: bytesResponse([1]),
      },
    });
    await expect(run([target, "--yes"], h.deps)).resolves.toBe(1);
    expect(h.errors).toEqual([
      `Project name "${target}": ${NAME_ERROR_SUFFIX}`,
    ]);
    expect(h.fetchCalls).toEqual([]);
    expect(h.spawnCalls).toEqual([]);
    expect(h.makeTempDir).not.toHaveBeenCalled();
  });

  it("an invalid name is rejected with --kit too, without delegating", async () => {
    const h = harness({});
    await expect(run(["Bad Name", "--kit", "/k"], h.deps)).resolves.toBe(1);
    expect(h.errors).toEqual([`Project name "Bad Name": ${NAME_ERROR_SUFFIX}`]);
    expect(h.spawnCalls).toEqual([]);
  });

  it("an invalid name is rejected with --kit-version, without downloading", async () => {
    const h = harness({
      routes: { [CODELOAD_TARBALL_010]: bytesResponse([1]) },
    });
    await expect(
      run(["UPPER", "--kit-version", "0.1.0"], h.deps),
    ).resolves.toBe(1);
    expect(h.errors).toEqual([`Project name "UPPER": ${NAME_ERROR_SUFFIX}`]);
    expect(h.fetchCalls).toEqual([]);
    expect(h.makeTempDir).not.toHaveBeenCalled();
  });

  it("the name is the last path segment of the target", async () => {
    const h = harness({});
    await expect(run(["nested/Bad Dir", "--kit", "/k"], h.deps)).resolves.toBe(
      1,
    );
    expect(h.errors).toEqual([`Project name "Bad Dir": ${NAME_ERROR_SUFFIX}`]);
  });

  it(". in a badly named cwd is rejected with the cwd's name", async () => {
    const h = harness({ cwd: "/work/Bad Dir" });
    await expect(run([".", "--kit", "/k"], h.deps)).resolves.toBe(1);
    expect(h.errors).toEqual([`Project name "Bad Dir": ${NAME_ERROR_SUFFIX}`]);
    expect(h.spawnCalls).toEqual([]);
  });

  it.each([
    ["ab", "/work"],
    [FIFTY, "/work"],
    ["nested/dir/my-app", "/work"],
    [".", "/work/acme-crm"],
  ])("%j in %s is accepted and delegated with --kit", async (target, cwd) => {
    const h = harness({ cwd, childCode: 4 });
    await expect(run([target, "--kit", "/k"], h.deps)).resolves.toBe(4);
    expect(h.errors).toEqual([]);
    expect(h.spawnCalls).toEqual([
      {
        command: NODE,
        args: [GATO, "create", target, "--kit", "/k"],
        options: { cwd, stdio: "inherit" },
      },
    ]);
  });

  it("a valid name still downloads the kit exactly as before", async () => {
    const h = harness({
      routes: { [CODELOAD_TARBALL_010]: bytesResponse([1]) },
    });
    await expect(run(["ab", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      0,
    );
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      CODELOAD_TARBALL_010,
    ]);
    expect(h.spawnCalls.map((call) => call.command)).toEqual([
      "tar",
      "git",
      "git",
      NODE,
    ]);
  });

  test.prop([fc.stringMatching(/^[a-z][a-z0-9-]{1,49}$/)])(
    "every name of a lowercase letter and 1-49 letters, digits or hyphens is delegated",
    async (name) => {
      const h = harness({});
      await expect(run([name, "--kit", "/k"], h.deps)).resolves.toBe(0);
      expect(h.errors).toEqual([]);
      expect(h.spawnCalls).toHaveLength(1);
    },
  );

  test.prop([
    fc
      .string({ minLength: 1, maxLength: 60 })
      .filter(
        (name) =>
          !/^[a-z][a-z0-9-]{1,49}$/.test(name) &&
          !name.includes("/") &&
          !name.startsWith("-") &&
          name !== "." &&
          name !== "..",
      ),
  ])(
    "every other single-segment name is rejected without side effects",
    async (name) => {
      const h = harness({});
      await expect(run([name, "--kit", "/k"], h.deps)).resolves.toBe(1);
      expect(h.errors).toEqual([
        `Project name "${name}": ${NAME_ERROR_SUFFIX}`,
      ]);
      expect(h.spawnCalls).toEqual([]);
      expect(h.fetchCalls).toEqual([]);
    },
  );
});

describe("run: a rejected token is retried anonymously once", () => {
  const BOGUS = "bogus";
  const RETRY_WARNING = "GitHub rejected the token (401); retrying without it.";

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

  function authOf(h: Harness): (string | undefined)[] {
    return h.fetchCalls.map((call) => call.headers.Authorization);
  }

  it("a 401 on the tag list retries the tag list and the tarball without the token", async () => {
    const h = harness({ env: { GITHUB_TOKEN: BOGUS }, childCode: 6 });
    routeByToken(h, {
      [TAGS_PAGE_1]: {
        withToken: statusResponse(401),
        anonymous: jsonResponse([{ name: "v0.1.0" }, { name: "v0.2.0" }]),
      },
      [CODELOAD_TARBALL_020]: { anonymous: bytesResponse([1]) },
    });
    await expect(run(["app", "--yes"], h.deps)).resolves.toBe(6);
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      TAGS_PAGE_1,
      TAGS_PAGE_1,
      CODELOAD_TARBALL_020,
    ]);
    expect(authOf(h)).toEqual(["Bearer bogus", undefined, undefined]);
    expect(h.fetchCalls[1]?.headers).not.toHaveProperty("Authorization");
    expect(h.fetchCalls[2]?.headers).not.toHaveProperty("Authorization");
    expect(h.errors).toEqual([RETRY_WARNING]);
    expect(h.spawnCalls.filter((call) => call.command === NODE)).toHaveLength(
      1,
    );
  });

  it("a 401 on the API tarball falls back to codeload without the token", async () => {
    const h = harness({ env: { GITHUB_TOKEN: BOGUS } });
    routeByToken(h, {
      [API_TARBALL_010]: { withToken: statusResponse(401) },
      [CODELOAD_TARBALL_010]: { anonymous: bytesResponse([1]) },
    });
    await expect(run(["app", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      0,
    );
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      API_TARBALL_010,
      CODELOAD_TARBALL_010,
    ]);
    expect(authOf(h)).toEqual(["Bearer bogus", undefined]);
    expect(h.errors).toEqual([RETRY_WARNING]);
    expect(h.spawnCalls.map((call) => call.command)).toEqual([
      "tar",
      "git",
      "git",
      NODE,
    ]);
  });

  it("the retry never prints the token", async () => {
    const h = harness({ env: { GITHUB_TOKEN: SECRET } });
    routeByToken(h, {
      [TAGS_PAGE_1]: {
        withToken: statusResponse(401),
        anonymous: jsonResponse([{ name: "v0.1.0" }]),
      },
      [CODELOAD_TARBALL_010]: { anonymous: bytesResponse([1]) },
    });
    await expect(run(["app"], h.deps)).resolves.toBe(0);
    expect(output(h)).not.toContain(SECRET);
  });

  it("a second 401 without the token fails with the anonymous error and no further retry", async () => {
    const h = harness({ env: { GITHUB_TOKEN: BOGUS } });
    routeByToken(h, {
      [TAGS_PAGE_1]: {
        withToken: statusResponse(401),
        anonymous: statusResponse(401),
      },
    });
    await expect(run(["app"], h.deps)).resolves.toBe(1);
    expect(authOf(h)).toEqual(["Bearer bogus", undefined]);
    expect(h.errors[0]).toBe(RETRY_WARNING);
    expect(h.errors[1]).toContain("GitHub returned 401 for the tag list.");
    expect(h.errors).toHaveLength(2);
    expect(h.spawnCalls).toEqual([]);
  });

  it("another status after the retry fails with the anonymous message", async () => {
    const h = harness({ env: { GITHUB_TOKEN: BOGUS } });
    routeByToken(h, {
      [API_TARBALL_010]: { withToken: statusResponse(401) },
      [CODELOAD_TARBALL_010]: { anonymous: statusResponse(404) },
    });
    await expect(run(["app", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      1,
    );
    expect(h.fetchCalls.map((call) => call.url)).toEqual([
      API_TARBALL_010,
      CODELOAD_TARBALL_010,
    ]);
    expect(h.errors[0]).toBe(RETRY_WARNING);
    expect(h.errors[1]).toContain("GitHub returned 404 for kit v0.1.0.");
    expect(h.errors[1]).toContain("may be private");
    expect(h.errors).toHaveLength(2);
    expect(h.removed).toEqual(h.tempDirs);
  });

  it.each([403, 404, 429, 500])(
    "a %i with a token is not retried",
    async (status) => {
      const h = harness({ env: { GITHUB_TOKEN: BOGUS } });
      routeByToken(h, {
        [TAGS_PAGE_1]: {
          withToken: statusResponse(status),
          anonymous: jsonResponse([{ name: "v0.1.0" }]),
        },
        [CODELOAD_TARBALL_010]: { anonymous: bytesResponse([1]) },
      });
      await expect(run(["app"], h.deps)).resolves.toBe(1);
      expect(authOf(h)).toEqual(["Bearer bogus"]);
      expect(h.errors).toHaveLength(1);
      expect(h.errors[0]).toContain(`GitHub returned ${status}`);
      expect(h.errors).not.toContain(RETRY_WARNING);
    },
  );

  it("a 401 without any token is not retried", async () => {
    const h = harness({ env: {}, gh: null });
    routeByToken(h, {
      [CODELOAD_TARBALL_010]: { anonymous: statusResponse(401) },
    });
    await expect(run(["app", "--kit-version", "0.1.0"], h.deps)).resolves.toBe(
      1,
    );
    expect(h.fetchCalls).toHaveLength(1);
    expect(h.errors).not.toContain(RETRY_WARNING);
  });
});
