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

import { readlinePrompter } from "../prompter.js";

let originalIsTTY: boolean | undefined;

beforeEach(() => {
  originalIsTTY = process.stdin.isTTY;
  process.stdin.isTTY = true;
  readline.questions = [];
  readline.answer = "";
  readline.fail = false;
  readline.close.mockClear();
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
