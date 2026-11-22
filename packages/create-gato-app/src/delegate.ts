export function gatoCreateCommand(input: {
  nodePath: string;
  gatoBin: string;
  kitDir: string;
  passthrough: string[];
}): { command: string; args: string[] } {
  return {
    command: input.nodePath,
    args: [
      input.gatoBin,
      "create",
      ...input.passthrough,
      "--kit",
      input.kitDir,
    ],
  };
}
