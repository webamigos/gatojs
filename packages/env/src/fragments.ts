import { z } from "zod";

export function httpUrl() {
  return z.url({ protocol: /^https?$/ });
}

export function blankAsUndefined<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema,
  );
}

export function flag() {
  return z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() ?? "")
    .pipe(z.enum(["", "true", "false"]))
    .transform((value) => value === "true");
}
