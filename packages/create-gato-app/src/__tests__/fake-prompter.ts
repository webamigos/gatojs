import type { Option, Prompter } from "../questions.js";

export type PromptMethod = "multiselect" | "text" | "password" | "select" | "confirm";

export type PromptInput = {
  message: string;
  options?: Option<string>[];
  initialValues?: string[];
  initialValue?: unknown;
  defaultValue?: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
};

export type PromptCall = { method: PromptMethod; input: PromptInput };

export type ScriptedAnswer = {
  method: PromptMethod;
  answer: unknown;
};

export function scriptedPrompter(script: ScriptedAnswer[]): {
  prompter: Prompter;
  calls: PromptCall[];
} {
  const calls: PromptCall[] = [];
  const queue = [...script];
  async function next(method: PromptMethod, input: PromptInput): Promise<unknown> {
    calls.push({ method, input });
    const entry = queue.shift();
    if (entry === undefined) {
      throw new Error(`unexpected prompt: ${method} "${input.message}"`);
    }
    if (entry.method !== method) {
      throw new Error(`expected a ${entry.method} prompt, got ${method} "${input.message}"`);
    }
    if (entry.answer instanceof Error) {
      throw entry.answer;
    }
    if (typeof entry.answer === "function") {
      return (entry.answer as (input: PromptInput) => unknown)(input);
    }
    return entry.answer;
  }
  const prompter: Prompter = {
    multiselect: async (input) => (await next("multiselect", input)) as string[],
    text: async (input) => (await next("text", input)) as string,
    password: async (input) => (await next("password", input)) as string,
    select: async <T extends string>(input: {
      message: string;
      options: Option<T>[];
      initialValue: T;
    }) => (await next("select", input)) as T,
    confirm: async (input) => (await next("confirm", input)) as boolean,
  };
  return { prompter, calls };
}

export const silentPrompter: Prompter = scriptedPrompter([]).prompter;
