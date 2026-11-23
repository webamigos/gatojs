import * as clack from "@clack/prompts";
import { CancelledError, type Prompter } from "./questions.js";
import type { Ui } from "./ui.js";

function answered<T>(value: T | symbol): Exclude<T, symbol> {
  if (clack.isCancel(value)) {
    throw new CancelledError("Cancelled");
  }
  return value as Exclude<T, symbol>;
}

export const clackPrompter: Prompter = {
  async multiselect(input) {
    return answered(
      await clack.multiselect({
        message: input.message,
        options: input.options,
        initialValues: input.initialValues,
        required: false,
      }),
    );
  },
  async text(input) {
    return answered(
      await clack.text({
        message: input.message,
        defaultValue: input.defaultValue,
        placeholder: input.placeholder,
        validate: input.validate
          ? (value) => input.validate?.(value ?? "")
          : undefined,
      }),
    );
  },
  async password(input) {
    return answered(
      await clack.password({
        message: input.message,
        validate: input.validate
          ? (value) => input.validate?.(value ?? "")
          : undefined,
      }),
    );
  },
  async select(input) {
    return answered(
      await clack.select({
        message: input.message,
        options: input.options as clack.Option<
          (typeof input.options)[number]["value"]
        >[],
        initialValue: input.initialValue,
      }),
    );
  },
  async confirm(input) {
    return answered(
      await clack.confirm({
        message: input.message,
        initialValue: input.initialValue,
      }),
    );
  },
};

export const clackUi: Ui = {
  intro: (title) => clack.intro(title),
  step: (message) => clack.log.step(message),
  info: (message) => clack.log.info(message),
  warn: (message) => clack.log.warn(message),
  note: (title, lines) => clack.note(lines.join("\n"), title),
  outro: (message) => clack.outro(message),
  async task(label, work) {
    const spinner = clack.spinner();
    spinner.start(label);
    try {
      const result = await work();
      spinner.stop(label);
      return result;
    } catch (error) {
      spinner.error(label);
      throw error;
    }
  },
};
