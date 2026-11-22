import { spawn } from "node:child_process";
import { constants } from "node:os";
import type { Spawn, SpawnResult } from "./kit-download.js";

const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

function exitCodeOf(
  code: number | null,
  signal: NodeJS.Signals | null,
): number {
  if (code !== null) {
    return code;
  }
  const signalNumber = signal === null ? undefined : constants.signals[signal];
  return signalNumber === undefined ? 1 : 128 + signalNumber;
}

export const spawnProcess: Spawn = (command, args, options) =>
  new Promise<SpawnResult>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio:
        options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    // WHY: with an attached terminal, Ctrl+C reaches the child too; ignoring it here lets the child finish
    // (gato create cleans up after itself) and still runs our temp dir cleanup instead of dying first.
    const ignore = (): void => {};
    if (options.stdio === "inherit") {
      for (const signal of FORWARDED_SIGNALS) {
        process.on(signal, ignore);
      }
    }
    const release = (): void => {
      for (const signal of FORWARDED_SIGNALS) {
        process.off(signal, ignore);
      }
    };
    child.on("error", (error) => {
      release();
      reject(error);
    });
    child.on("close", (code, signal) => {
      release();
      resolvePromise({ code: exitCodeOf(code, signal), stdout, stderr });
    });
  });

export async function ghAuthToken(): Promise<string | null> {
  const result = await spawnProcess("gh", ["auth", "token"], { stdio: "pipe" });
  return result.code === 0 ? result.stdout : null;
}
