import { describe, expect, it } from "vitest";
import { envSchema } from "../env";

const EXAMPLE = "dev-only-api-key-pepper-change-me-0123456789";

function parse(pepper: string | undefined, nodeEnv: string) {
  return envSchema.safeParse({ API_KEY_PEPPER: pepper, NODE_ENV: nodeEnv });
}

describe("envSchema api-keys", () => {
  it("odrzuca pepper krótszy niż 32 znaki", () => {
    expect(parse("a".repeat(31), "development").success).toBe(false);
  });

  it("przyjmuje pepper o 32 znakach", () => {
    expect(parse("a".repeat(32), "development").success).toBe(true);
  });

  it("odrzuca brak peppera", () => {
    expect(parse(undefined, "development").success).toBe(false);
  });

  it("w produkcji odrzuca wartość przykładową", () => {
    const result = parse(EXAMPLE, "production");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["API_KEY_PEPPER"]);
  });

  it("w produkcji przyjmuje własny pepper", () => {
    expect(parse("q".repeat(40), "production").success).toBe(true);
  });

  it.each(["development", "test"])(
    "poza produkcją (%s) przyjmuje wartość przykładową",
    (nodeEnv) => {
      expect(parse(EXAMPLE, nodeEnv).success).toBe(true);
    },
  );

  it("zwraca tylko API_KEY_PEPPER, bez NODE_ENV", () => {
    expect(
      envSchema.parse({
        API_KEY_PEPPER: "q".repeat(40),
        NODE_ENV: "production",
      }),
    ).toStrictEqual({ API_KEY_PEPPER: "q".repeat(40) });
  });
});
