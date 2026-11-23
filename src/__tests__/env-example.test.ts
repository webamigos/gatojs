// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import { EXAMPLE_BETTER_AUTH_SECRET, parseEnv } from "@gatojs/env";

function readEnvExample(): string {
  return readFileSync(join(process.cwd(), ".env.example"), "utf8");
}

describe(".env.example against the core env schema from @gatojs/env", () => {
  it("parses .env.example copied as .env", () => {
    const example = dotenv.parse(readEnvExample());
    const e = parseEnv(example, []);
    expect(e.DATABASE_URL).toBe(example.DATABASE_URL);
    expect(e.RESEND_API_KEY).toBeUndefined();
    expect(e.AUTH_PUBLIC_SIGNUP).toBe(false);
  });

  it("declares ADMIN_IMPERSONATION=false outside the modules region", () => {
    const source = readEnvExample();
    const coreSection = source.split("# wa:modules:start")[0];
    expect(dotenv.parse(coreSection).ADMIN_IMPERSONATION).toBe("false");
    expect(parseEnv(dotenv.parse(source), []).ADMIN_IMPERSONATION).toBe(false);
  });

  it("the placeholder constant matches the value in .env.example", () => {
    const example = dotenv.parse(readEnvExample());
    expect(example.BETTER_AUTH_SECRET).toBe(EXAMPLE_BETTER_AUTH_SECRET);
  });
});
