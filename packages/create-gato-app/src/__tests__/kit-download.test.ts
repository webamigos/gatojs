import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadKit, type Spawn, type SpawnResult } from "../kit-download.js";
import { bytesResponse, fakeFetch, statusResponse } from "./fake-http.js";

const TARBALL =
  "https://codeload.github.com/webamigos/gatojs/tar.gz/refs/tags/v0.1.0";
const API_TARBALL =
  "https://api.github.com/repos/webamigos/gatojs/tarball/refs/tags/v0.1.0";

type SpawnCall = {
  command: string;
  args: string[];
  options: { cwd?: string; stdio: "inherit" | "pipe" };
};

const OK: SpawnResult = { code: 0, stdout: "", stderr: "" };

function recordingSpawn(
  respond: (call: SpawnCall) => Promise<SpawnResult> | SpawnResult = () => OK,
): { spawn: Spawn; calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  const spawn: Spawn = async (command, args, options) => {
    const call = { command, args, options };
    calls.push(call);
    return respond(call);
  };
  return { spawn, calls };
}

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a rejection");
}

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "create-gato-app-download-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("downloadKit", () => {
  it("writes the tarball, extracts it into kit/ and indexes it with git", async () => {
    const { fetch } = fakeFetch({
      [TARBALL]: bytesResponse([31, 139, 8, 0, 42]),
    });
    let tarballAtExtraction: number[] | null = null;
    let kitDirExistedAtExtraction = false;
    const { spawn, calls } = recordingSpawn(async (call) => {
      if (call.command === "tar") {
        tarballAtExtraction = Array.from(
          await readFile(join(workDir, "kit.tar.gz")),
        );
        kitDirExistedAtExtraction = (
          await stat(join(workDir, "kit"))
        ).isDirectory();
      }
      return OK;
    });

    const kitDir = await downloadKit({
      version: "0.1.0",
      token: null,
      fetch,
      spawn,
      workDir,
    });

    expect(kitDir).toBe(`${workDir}/kit`);
    expect(Array.from(await readFile(`${workDir}/kit.tar.gz`))).toEqual([
      31, 139, 8, 0, 42,
    ]);
    expect(tarballAtExtraction).toEqual([31, 139, 8, 0, 42]);
    expect(kitDirExistedAtExtraction).toBe(true);
    expect(calls).toEqual([
      {
        command: "tar",
        args: [
          "-xzf",
          `${workDir}/kit.tar.gz`,
          "-C",
          `${workDir}/kit`,
          "--strip-components=1",
        ],
        options: { stdio: "pipe" },
      },
      {
        command: "git",
        args: ["init", "-q"],
        options: { cwd: `${workDir}/kit`, stdio: "pipe" },
      },
      {
        command: "git",
        args: ["add", "-A", "-f"],
        options: { cwd: `${workDir}/kit`, stdio: "pipe" },
      },
    ]);
  });

  it("with a token downloads through the API", async () => {
    const { fetch, requests } = fakeFetch({
      [API_TARBALL]: bytesResponse([7]),
    });
    const { spawn } = recordingSpawn();
    await downloadKit({ version: "0.1.0", token: "t", fetch, spawn, workDir });
    expect(requests.map((request) => request.url)).toEqual([API_TARBALL]);
    expect(requests[0]?.headers.Authorization).toBe("Bearer t");
    expect(Array.from(await readFile(`${workDir}/kit.tar.gz`))).toEqual([7]);
  });

  it("a failing tar stops with its stderr and git is not spawned", async () => {
    const { fetch } = fakeFetch({ [TARBALL]: bytesResponse([1]) });
    const { spawn, calls } = recordingSpawn((call) =>
      call.command === "tar"
        ? { code: 2, stdout: "", stderr: "gzip: stdin: not in gzip format" }
        : OK,
    );
    const message = await messageOf(
      downloadKit({ version: "0.1.0", token: null, fetch, spawn, workDir }),
    );
    expect(message).toContain("Could not extract");
    expect(message).toContain("gzip: stdin: not in gzip format");
    expect(calls.map((call) => call.command)).toEqual(["tar"]);
  });

  it("a failing git init says git is needed", async () => {
    const { fetch } = fakeFetch({ [TARBALL]: bytesResponse([1]) });
    const { spawn, calls } = recordingSpawn((call) =>
      call.command === "git" && call.args[0] === "init"
        ? { code: 128, stdout: "", stderr: "fatal" }
        : OK,
    );
    const message = await messageOf(
      downloadKit({ version: "0.1.0", token: null, fetch, spawn, workDir }),
    );
    expect(message).toContain("needs git");
    expect(calls.map((call) => call.args[0])).not.toContain("add");
  });

  it("a failing git add says git is needed", async () => {
    const { fetch } = fakeFetch({ [TARBALL]: bytesResponse([1]) });
    const { spawn } = recordingSpawn((call) =>
      call.command === "git" && call.args[0] === "add"
        ? { code: 1, stdout: "", stderr: "fatal" }
        : OK,
    );
    const message = await messageOf(
      downloadKit({ version: "0.1.0", token: null, fetch, spawn, workDir }),
    );
    expect(message).toContain("needs git");
  });

  it("a missing git binary says git is needed", async () => {
    const { fetch } = fakeFetch({ [TARBALL]: bytesResponse([1]) });
    const { spawn } = recordingSpawn((call) => {
      if (call.command === "git") {
        return Promise.reject(
          Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" }),
        );
      }
      return OK;
    });
    const message = await messageOf(
      downloadKit({ version: "0.1.0", token: null, fetch, spawn, workDir }),
    );
    expect(message).toContain("needs git");
  });

  it("a fetch error propagates and nothing is spawned", async () => {
    const { fetch } = fakeFetch({ [TARBALL]: statusResponse(500) });
    const { spawn, calls } = recordingSpawn();
    const message = await messageOf(
      downloadKit({ version: "0.1.0", token: null, fetch, spawn, workDir }),
    );
    expect(message).toContain("500");
    expect(calls).toEqual([]);
  });
});
