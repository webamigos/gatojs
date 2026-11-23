import type { Answers } from "./questions.js";

export function gatoCreateCommand(input: {
  nodePath: string;
  gatoBin: string;
  kitDir: string;
  projectDir: string;
  answers: Pick<Answers, "modules" | "locales" | "title" | "adminEmail">;
  cliSource: string | null;
}): { command: string; args: string[] } {
  const { answers } = input;
  const args = [
    input.gatoBin,
    "create",
    input.projectDir,
    "--yes",
    "--no-install",
    "--no-git",
    `--modules=${answers.modules.join(",")}`,
    `--locales=${answers.locales.join(",")}`,
    `--title=${answers.title}`,
  ];
  if (answers.adminEmail !== null) {
    args.push(`--admin-email=${answers.adminEmail}`);
  }
  if (input.cliSource !== null) {
    args.push(`--cli-source=${input.cliSource}`);
  }
  args.push(`--kit=${input.kitDir}`);
  return { command: input.nodePath, args };
}
