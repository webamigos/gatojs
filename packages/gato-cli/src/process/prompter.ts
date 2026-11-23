import checkbox from "@inquirer/checkbox";
import { createInterface } from "node:readline/promises";

export type SelectChoice = {
  value: string;
  label: string;
  checked?: boolean;
  locked?: boolean;
};

export type Prompter = {
  ask(question: string, fallback: string): Promise<string>;
  confirm(question: string, fallback: boolean): Promise<boolean>;
  select(question: string, choices: SelectChoice[]): Promise<string[]>;
};

const YES_ANSWERS = ["t", "tak", "y", "yes"];

const KEY_NAMES: Record<string, string> = { space: "spacja" };

const KEY_ACTIONS: Record<string, string> = {
  navigate: "przesuń",
  select: "zaznacz",
  all: "wszystkie",
  invert: "odwróć",
  submit: "zatwierdź",
};

function assertTerminal(): void {
  if (!process.stdin.isTTY) {
    throw new Error("Brak terminala: użyj --yes");
  }
}

function keysHelpTip(keys: [key: string, action: string][]): string {
  return keys
    .map(
      ([key, action]) =>
        `${KEY_NAMES[key] ?? key} ${KEY_ACTIONS[action] ?? action}`,
    )
    .join(" • ");
}

async function readAnswer(question: string): Promise<string> {
  assertTerminal();
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
  async select(question, choices) {
    assertTerminal();
    try {
      return await checkbox({
        message: question,
        choices: choices.map((choice) => ({
          value: choice.value,
          name: choice.label,
          short: choice.value,
          checked: choice.checked ?? false,
          disabled: choice.locked ? "(wymagany)" : false,
        })),
        theme: {
          style: { keysHelpTip },
          i18n: { disabledError: "Tej pozycji nie można odznaczyć" },
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ExitPromptError") {
        throw new Error("Przerwano");
      }
      throw error;
    }
  },
};
