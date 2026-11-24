import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  checkEnv,
  formatEnvReport,
  parseEnv,
  processStartupIo,
  verifyEnvOnStartup,
} from "../index";

const demoTokenSchema = z
  .object({ DEMO_TOKEN: z.string().min(1) })
  .transform(({ DEMO_TOKEN }) => ({ DEMO_TOKEN }));

const moduleSchemas = [demoTokenSchema];

const validCore = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
  BETTER_AUTH_SECRET: "s".repeat(32),
  APP_URL: "http://localhost:3000",
  EMAIL_FROM: "WA App <noreply@example.com>",
  DEMO_TOKEN: "t",
};

const brokenEnv = { ...validCore, DATABASE_URL: undefined, DEMO_TOKEN: "" };

function createIo() {
  return {
    error: vi.fn<(message: string) => void>(),
    exit: vi.fn<(code: number) => void>(),
  };
}

describe("checkEnv", () => {
  it("valid core and module variables → ok with the parsed env", () => {
    expect(checkEnv(validCore, moduleSchemas)).toMatchObject({
      ok: true,
      env: {
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
        DEMO_TOKEN: "t",
      },
    });
  });

  it("collects core and module issues at once, not only the first one", () => {
    const result = checkEnv(brokenEnv, moduleSchemas);

    expect(result).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        { name: "DATABASE_URL", message: expect.any(String) },
        { name: "DEMO_TOKEN", message: expect.any(String) },
      ]),
    });
    expect(result).toHaveProperty("issues.length", 2);
  });

  it("validates the module schemas passed as the second argument", () => {
    const withoutToken = { ...validCore, DEMO_TOKEN: undefined };

    expect(checkEnv(withoutToken, [])).toMatchObject({ ok: true });
    expect(checkEnv(withoutToken, moduleSchemas)).toEqual({
      ok: false,
      issues: [{ name: "DEMO_TOKEN", message: expect.any(String) }],
    });
  });

  it("validates every module schema passed, not only the first one", () => {
    const pepperSchema = z.object({ PEPPER: z.string().min(1) });

    expect(
      checkEnv({ ...validCore, DEMO_TOKEN: "t" }, [
        demoTokenSchema,
        pepperSchema,
      ]),
    ).toEqual({
      ok: false,
      issues: [{ name: "PEPPER", message: expect.any(String) }],
    });
  });

  it("does not remember module schemas between calls", () => {
    checkEnv(validCore, moduleSchemas);

    expect(checkEnv({ ...validCore, DEMO_TOKEN: undefined }, [])).toMatchObject(
      { ok: true },
    );
  });
});

describe("checkEnv: name of an issue reported by a module schema", () => {
  it("an issue without a path, about the whole env, is named (env) with the schema message", () => {
    const schema = z
      .object({})
      .refine(() => false, { message: "konflikt zmiennych" });

    expect(checkEnv(validCore, [schema])).toEqual({
      ok: false,
      issues: [{ name: "(env)", message: "konflikt zmiennych" }],
    });
  });

  it("an issue with a nested path is named with its segments joined by a dot", () => {
    const schema = z.object({}).superRefine((_, ctx) => {
      ctx.addIssue({
        code: "custom",
        message: "zła para kluczy",
        path: ["S3", "BUCKET"],
      });
    });

    expect(checkEnv(validCore, [schema])).toEqual({
      ok: false,
      issues: [{ name: "S3.BUCKET", message: "zła para kluczy" }],
    });
  });

  it("two issues of the same variable stay two issues", () => {
    const schema = z.object({}).superRefine((_, ctx) => {
      ctx.addIssue({
        code: "custom",
        message: "za krótki",
        path: ["DEMO_TOKEN"],
      });
      ctx.addIssue({
        code: "custom",
        message: "zły prefiks",
        path: ["DEMO_TOKEN"],
      });
    });

    const result = checkEnv(validCore, [schema]);

    expect(result).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        { name: "DEMO_TOKEN", message: "za krótki" },
        { name: "DEMO_TOKEN", message: "zły prefiks" },
      ]),
    });
    expect(result).toHaveProperty("issues.length", 2);
  });
});

describe("formatEnvReport", () => {
  it("a header with the issue count, then one line per issue", () => {
    expect(
      formatEnvReport([
        { name: "DATABASE_URL", message: "brak" },
        { name: "DEMO_TOKEN", message: "pusty" },
      ]),
    ).toBe(
      "Invalid environment variables (2):\n- DATABASE_URL: brak\n- DEMO_TOKEN: pusty",
    );
  });

  it("prints a whole-env issue under the name (env)", () => {
    expect(formatEnvReport([{ name: "(env)", message: "x" }])).toBe(
      "Invalid environment variables (1):\n- (env): x",
    );
  });

  test.prop([
    fc.array(
      fc.record({
        name: fc.oneof(
          fc.constant("(env)"),
          fc.stringMatching(/^[A-Z][A-Z0-9_.]{0,15}$/),
        ),
        message: fc
          .string({ unit: "grapheme" })
          .filter((message) => !message.includes("\n")),
      }),
      { maxLength: 20 },
    ),
  ])(
    "the report read back gives the issue count in the header and the issues in input order",
    (issues) => {
      const [header, ...problemLines] = formatEnvReport(issues).split("\n");
      const readBack = problemLines.map((line) => {
        const [, name, message] = /^- ([^:]+): ([\s\S]*)$/.exec(line) ?? [];
        return { name, message };
      });

      expect(header).toBe(`Invalid environment variables (${issues.length}):`);
      expect(readBack).toEqual(issues);
    },
  );
});

describe("parseEnv", () => {
  it("a missing variable throws a one-line error with the variable name after the colon", () => {
    expect(() =>
      parseEnv({ ...validCore, DATABASE_URL: undefined }, moduleSchemas),
    ).toThrow(/^Invalid environment variables: DATABASE_URL: /);
  });

  it("joins several issues in one line with a semicolon, each as name: message", () => {
    expect(() => parseEnv(brokenEnv, moduleSchemas)).toThrow(
      /^Invalid environment variables: (DATABASE_URL: .+; DEMO_TOKEN: .+|DEMO_TOKEN: .+; DATABASE_URL: .+)$/,
    );
  });

  it("the error message for a single known issue is exact", () => {
    expect(() =>
      parseEnv({ ...validCore, NODE_ENV: "production" }, moduleSchemas),
    ).toThrow(
      new Error(
        "Invalid environment variables: MAIL_PROVIDER: no mail provider configured for production: set SMTP_HOST, SMTP_URL or RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail",
      ),
    );
  });

  it("returns the module schema output next to the core variables", () => {
    expect(parseEnv(validCore, moduleSchemas)).toMatchObject({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
      DEMO_TOKEN: "t",
    });
  });
});

describe("verifyEnvOnStartup", () => {
  it("valid variables → prints nothing and does not exit", () => {
    const io = createIo();

    verifyEnvOnStartup(validCore, io, moduleSchemas);

    expect(io.error).not.toHaveBeenCalled();
    expect(io.exit).not.toHaveBeenCalled();
  });

  it("invalid variables → one report with a header and a line per issue", () => {
    const io = createIo();

    verifyEnvOnStartup(brokenEnv, io, moduleSchemas);

    expect(io.error).toHaveBeenCalledTimes(1);
    const [report] = io.error.mock.calls[0];
    expect(report).toMatch(/^Invalid environment variables \(2\):\n/);
    expect(report).toContain("\n- DATABASE_URL: ");
    expect(report).toContain("\n- DEMO_TOKEN: ");
  });

  it("invalid variables → exits once, with code 1", () => {
    const io = createIo();

    verifyEnvOnStartup(brokenEnv, io, moduleSchemas);

    expect(io.exit).toHaveBeenCalledTimes(1);
    expect(io.exit).toHaveBeenCalledWith(1);
  });

  it("invalid variables → the report goes to the error output before the process exits", () => {
    const io = createIo();

    verifyEnvOnStartup(brokenEnv, io, moduleSchemas);

    expect(io.error.mock.invocationCallOrder[0]).toBeLessThan(
      io.exit.mock.invocationCallOrder[0],
    );
  });

  it("a variable required only by a module schema fails startup", () => {
    const io = createIo();

    verifyEnvOnStartup(
      { ...validCore, DEMO_TOKEN: undefined },
      io,
      moduleSchemas,
    );

    expect(io.error).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Invalid environment variables \(1\):\n- DEMO_TOKEN: /,
      ),
    );
    expect(io.exit.mock.calls).toEqual([[1]]);
  });

  it("the next build phase → no check, report or exit", () => {
    const io = createIo();

    verifyEnvOnStartup(
      { NEXT_PHASE: "phase-production-build" },
      io,
      moduleSchemas,
    );

    expect(io.error).not.toHaveBeenCalled();
    expect(io.exit).not.toHaveBeenCalled();
  });

  it("the production server phase does not skip the check", () => {
    const io = createIo();

    verifyEnvOnStartup(
      {
        ...validCore,
        DATABASE_URL: undefined,
        NEXT_PHASE: "phase-production-server",
      },
      io,
      moduleSchemas,
    );

    expect(io.exit).toHaveBeenCalledTimes(1);
    expect(io.exit).toHaveBeenCalledWith(1);
  });

  it("production without a mail provider → report with the production mail rule and exit code 1", () => {
    const io = createIo();

    verifyEnvOnStartup(
      { ...validCore, NODE_ENV: "production" },
      io,
      moduleSchemas,
    );

    expect(io.error.mock.calls).toEqual([
      [
        "Invalid environment variables (1):\n- MAIL_PROVIDER: no mail provider configured for production: set SMTP_HOST, SMTP_URL or RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail",
      ],
    ]);
    expect(io.exit.mock.calls).toEqual([[1]]);
  });

  it("a valid production configuration → prints nothing and does not exit", () => {
    const io = createIo();

    verifyEnvOnStartup(
      {
        ...validCore,
        NODE_ENV: "production",
        RESEND_API_KEY: "re_live",
        BETTER_AUTH_SECRET: "p".repeat(48),
      },
      io,
      moduleSchemas,
    );

    expect(io.error).not.toHaveBeenCalled();
    expect(io.exit).not.toHaveBeenCalled();
  });

  it.each([
    ["MAIL_PROVIDER=console", { MAIL_PROVIDER: "console" }],
    ["only SMTP_HOST", { SMTP_HOST: "relay.internal" }],
  ])(
    "production with %s and no RESEND_API_KEY → prints nothing and does not exit",
    (_, mail) => {
      const io = createIo();

      verifyEnvOnStartup(
        {
          ...validCore,
          ...mail,
          NODE_ENV: "production",
          BETTER_AUTH_SECRET: "p".repeat(48),
        },
        io,
        moduleSchemas,
      );

      expect(io.error).not.toHaveBeenCalled();
      expect(io.exit).not.toHaveBeenCalled();
    },
  );

  it("does not remember the result: every call checks the given variables again", () => {
    const io = createIo();

    verifyEnvOnStartup(validCore, io, moduleSchemas);
    verifyEnvOnStartup(brokenEnv, io, moduleSchemas);
    verifyEnvOnStartup(brokenEnv, io, moduleSchemas);

    expect(io.error).toHaveBeenCalledTimes(2);
    expect(io.exit.mock.calls).toEqual([[1], [1]]);
  });
});

describe("processStartupIo", () => {
  it("error writes the message to console.error", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    processStartupIo.error("raport");

    expect(consoleError).toHaveBeenCalledWith("raport");
    consoleError.mockRestore();
  });

  it("exit ends the process with the given code", () => {
    const processExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    processStartupIo.exit(1);

    expect(processExit).toHaveBeenCalledWith(1);
    processExit.mockRestore();
  });
});
