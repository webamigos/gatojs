import type { Answers } from "./questions.js";

export function gatoCreateCommand(input: {
  nodePath: string;
  gatoBin: string;
  kitDir: string;
  projectDir: string;
  answers: Pick<Answers, "modules" | "locales" | "title" | "adminEmail">;
  cliSource: string | null;
}): { command: string; args: string[] } {
  throw new Error(`not implemented: ${input.projectDir}`);
}
