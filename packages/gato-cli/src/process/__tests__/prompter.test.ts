import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readline = vi.hoisted(() => ({
  questions: [] as string[],
  answer: "" as string,
  fail: false,
  close: vi.fn(),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: () => ({
    question: async (query: string) => {
      readline.questions.push(query);
      if (readline.fail) throw new Error("awaria wejścia");
      return readline.answer;
    },
    close: readline.close,
  }),
}));

type CheckboxConfig = {
  message: string;
  choices: unknown[];
  theme: {
    i18n: { disabledError: string };
  };
};

const terminal = vi.hoisted(() => ({
  configs: [] as unknown[],
  result: [] as string[],
  failure: null as Error | null,
}));

vi.mock("@inquirer/checkbox", () => ({
  default: async (config: unknown) => {
    terminal.configs.push(config);
    if (terminal.failure) throw terminal.failure;
    return terminal.result;
  },
}));

import { readlinePrompter } from "../prompter.js";

function lastConfig(): CheckboxConfig {
  expect(terminal.configs).toHaveLength(1);
  return terminal.configs[0] as CheckboxConfig;
}

let originalIsTTY: boolean | undefined;

beforeEach(() => {
  originalIsTTY = process.stdin.isTTY;
  process.stdin.isTTY = true;
  readline.questions = [];
  readline.answer = "";
  readline.fail = false;
  readline.close.mockClear();
  terminal.configs = [];
  terminal.result = [];
  terminal.failure = null;
});

afterEach(() => {
  process.stdin.isTTY = originalIsTTY as boolean;
});

describe("readlinePrompter z terminalem", () => {
  it.each(["t", "TAK", "y", "yes"])(
    "confirm traktuje odpowiedź %s jako tak",
    async (answer) => {
      readline.answer = answer;
      expect(await readlinePrompter.confirm("Pytanie?", false)).toBe(true);
    },
  );

  it("confirm traktuje n jako nie mimo fallbacku true", async () => {
    readline.answer = "n";
    expect(await readlinePrompter.confirm("Pytanie?", true)).toBe(false);
  });

  it("confirm z pustą odpowiedzią zwraca fallback true", async () => {
    expect(await readlinePrompter.confirm("Pytanie?", true)).toBe(true);
  });

  it("confirm z pustą odpowiedzią zwraca fallback false", async () => {
    expect(await readlinePrompter.confirm("Pytanie?", false)).toBe(false);
  });

  it("confirm pyta treścią pytania i spacją", async () => {
    await readlinePrompter.confirm("Pytanie?", false);
    expect(readline.questions).toEqual(["Pytanie? "]);
  });

  it("ask przycina odpowiedź", async () => {
    readline.answer = "  x ";
    expect(await readlinePrompter.ask("Pytanie", "dom")).toBe("x");
  });

  it("ask z pustą odpowiedzią zwraca fallback", async () => {
    expect(await readlinePrompter.ask("Pytanie", "dom")).toBe("dom");
  });

  it("ask dopisuje fallback w nawiasach do pytania", async () => {
    await readlinePrompter.ask("Pytanie", "dom");
    expect(readline.questions).toEqual(["Pytanie [dom]: "]);
  });

  it("ask z pustym fallbackiem nie dopisuje nawiasów", async () => {
    await readlinePrompter.ask("Pytanie", "");
    expect(readline.questions).toEqual(["Pytanie: "]);
  });

  it("zamyka interfejs po odpowiedzi", async () => {
    readline.answer = "x";
    await readlinePrompter.ask("Pytanie", "");
    expect(readline.close).toHaveBeenCalledTimes(1);
  });

  it("zamyka interfejs, gdy odczyt rzuca", async () => {
    readline.fail = true;
    await expect(readlinePrompter.ask("Pytanie", "")).rejects.toThrow(
      "awaria wejścia",
    );
    expect(readline.close).toHaveBeenCalledTimes(1);
  });
});

describe("readlinePrompter.select", () => {
  it("bez terminala rzuca No terminal: use --yes i nie otwiera listy", async () => {
    process.stdin.isTTY = false;
    await expect(
      readlinePrompter.select("Modules", [{ value: "a", label: "a" }]),
    ).rejects.toThrow("No terminal: use --yes");
    expect(terminal.configs).toEqual([]);
  });

  it("przekazuje pytanie i pozycje z etykietą, domyślnie niezaznaczone i odblokowane", async () => {
    await readlinePrompter.select("Modules", [
      { value: "a", label: "a — opis" },
      { value: "b", label: "b", checked: true },
    ]);
    const config = lastConfig();
    expect(config.message).toBe("Modules");
    expect(config.choices).toEqual([
      {
        value: "a",
        name: "a — opis",
        short: "a",
        checked: false,
        disabled: false,
      },
      { value: "b", name: "b", short: "b", checked: true, disabled: false },
    ]);
  });

  it("pozycja zablokowana jest zaznaczona i opisana jako (wymagany)", async () => {
    await readlinePrompter.select("Languages", [
      { value: "pl", label: "pl", checked: true, locked: true },
      { value: "en", label: "en", checked: true },
    ]);
    expect(lastConfig().choices).toEqual([
      {
        value: "pl",
        name: "pl",
        short: "pl",
        checked: true,
        disabled: "(required)",
      },
      { value: "en", name: "en", short: "en", checked: true, disabled: false },
    ]);
  });

  it("zwraca wartości wybrane na liście", async () => {
    terminal.result = ["b"];
    expect(
      await readlinePrompter.select("Modules", [
        { value: "a", label: "a" },
        { value: "b", label: "b" },
      ]),
    ).toEqual(["b"]);
  });

  it("pusty wybór zwraca pustą tablicę", async () => {
    terminal.result = [];
    expect(
      await readlinePrompter.select("Modules", [{ value: "a", label: "a" }]),
    ).toEqual([]);
  });

  it("Ctrl+C na liście rzuca Przerwano", async () => {
    terminal.failure = Object.assign(
      new Error("User force closed the prompt with SIGINT"),
      { name: "ExitPromptError" },
    );
    await expect(
      readlinePrompter.select("Modules", [{ value: "a", label: "a" }]),
    ).rejects.toMatchObject({ message: "Aborted" });
  });

  it("inny błąd listy przechodzi bez zmian", async () => {
    const failure = new Error("awaria");
    terminal.failure = failure;
    await expect(
      readlinePrompter.select("Modules", [{ value: "a", label: "a" }]),
    ).rejects.toBe(failure);
  });

  it("komunikat przy próbie odznaczenia pozycji wymaganej jest własny", async () => {
    await readlinePrompter.select("Modules", [{ value: "a", label: "a" }]);
    expect(lastConfig().theme.i18n.disabledError).toBe(
      "This item cannot be unselected",
    );
  });
});
