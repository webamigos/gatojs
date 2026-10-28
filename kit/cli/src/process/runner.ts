import { spawn } from "node:child_process";

export type Runner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<void>;

export const spawnRunner: Runner = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`${[command, ...args].join(" ")} zakończone kodem ${code}`),
      );
    });
  });
