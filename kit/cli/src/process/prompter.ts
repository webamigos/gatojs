import { createInterface } from "node:readline/promises";

export type Prompter = {
  ask(question: string, fallback: string): Promise<string>;
  confirm(question: string, fallback: boolean): Promise<boolean>;
};

const YES_ANSWERS = ["t", "tak", "y", "yes"];

async function readAnswer(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("Brak terminala: użyj --yes");
  }
  const lines = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await lines.question(question)).trim();
  } finally {
    lines.close();
  }
}

export const readlinePrompter: Prompter = {
  async ask(question, fallback) {
    const suffix = fallback === "" ? "" : ` [${fallback}]`;
    const answer = await readAnswer(`${question}${suffix}: `);
    return answer === "" ? fallback : answer;
  },
  async confirm(question, fallback) {
    const answer = await readAnswer(`${question} `);
    if (answer === "") {
      return fallback;
    }
    return YES_ANSWERS.includes(answer.toLowerCase());
  },
};
