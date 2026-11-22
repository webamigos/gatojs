import { join } from "node:path";

export function waCreateCommand(input: {
  nodePath: string;
  kitDir: string;
  passthrough: string[];
}): { command: string; args: string[] } {
  return {
    command: input.nodePath,
    args: [
      join(input.kitDir, ".wa", "bin", "wa.mjs"),
      "create",
      ...input.passthrough,
      "--kit",
      input.kitDir,
    ],
  };
}
