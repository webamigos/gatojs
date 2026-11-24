import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  checkEnv,
  formatEnvReport,
  mailRules,
  parseEnv,
  resolveMailConfig,
  type EnvIssue,
  type EnvSource,
} from "../index";

const validCore = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
  BETTER_AUTH_SECRET: "s".repeat(32),
  APP_URL: "http://localhost:3000",
  EMAIL_FROM: "WA App <noreply@example.com>",
};

const NO_PROVIDER_IN_PRODUCTION =
  "no mail provider configured for production: set SMTP_HOST, SMTP_URL or RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail";

function parseCore(source: EnvSource) {
  return parseEnv({ ...validCore, ...source }, []);
}

function issuesOf(source: EnvSource): EnvIssue[] {
  const result = checkEnv({ ...validCore, ...source }, []);
  return result.ok ? [] : result.issues;
}

function withCase(value: string, upper: readonly boolean[]): string {
  return [...value]
    .map((char, index) => (upper[index] ? char.toUpperCase() : char))
    .join("");
}

describe("resolveMailConfig: detection when MAIL_PROVIDER is unset", () => {
  it("SMTP_URL → smtp with the URL string as transport", () => {
    expect(
      resolveMailConfig(parseCore({ SMTP_URL: "smtp://127.0.0.1:1025" })),
    ).toStrictEqual({ provider: "smtp", transport: "smtp://127.0.0.1:1025" });
  });

  it("SMTP_HOST alone → smtp options with port 587, secure false and no auth key", () => {
    expect(
      resolveMailConfig(parseCore({ SMTP_HOST: "relay.internal" })),
    ).toStrictEqual({
      provider: "smtp",
      transport: { host: "relay.internal", port: 587, secure: false },
    });
  });

  it("SMTP_HOST with port, secure and credentials → smtp options with auth", () => {
    expect(
      resolveMailConfig(
        parseCore({
          SMTP_HOST: "relay.internal",
          SMTP_PORT: "465",
          SMTP_SECURE: "true",
          SMTP_USER: "app",
          SMTP_PASS: "pw",
        }),
      ),
    ).toStrictEqual({
      provider: "smtp",
      transport: {
        host: "relay.internal",
        port: 465,
        secure: true,
        auth: { user: "app", pass: "pw" },
      },
    });
  });

  it("SMTP_HOST with a custom port and SMTP_SECURE=false → that port, secure false", () => {
    expect(
      resolveMailConfig(
        parseCore({
          SMTP_HOST: "relay.internal",
          SMTP_PORT: "2525",
          SMTP_SECURE: "false",
        }),
      ),
    ).toStrictEqual({
      provider: "smtp",
      transport: { host: "relay.internal", port: 2525, secure: false },
    });
  });

  it("RESEND_API_KEY alone → resend with the key", () => {
    expect(
      resolveMailConfig(parseCore({ RESEND_API_KEY: "re_x" })),
    ).toStrictEqual({ provider: "resend", apiKey: "re_x" });
  });

  it("SMTP_HOST and RESEND_API_KEY → SMTP wins", () => {
    expect(
      resolveMailConfig(
        parseCore({ SMTP_HOST: "relay.internal", RESEND_API_KEY: "re_x" }),
      ),
    ).toStrictEqual({
      provider: "smtp",
      transport: { host: "relay.internal", port: 587, secure: false },
    });
  });

  it("SMTP_URL and RESEND_API_KEY → SMTP wins", () => {
    expect(
      resolveMailConfig(
        parseCore({
          SMTP_URL: "smtp://127.0.0.1:1025",
          RESEND_API_KEY: "re_x",
        }),
      ),
    ).toStrictEqual({ provider: "smtp", transport: "smtp://127.0.0.1:1025" });
  });

  it("nothing set → console, not explicit", () => {
    expect(resolveMailConfig(parseCore({}))).toStrictEqual({
      provider: "console",
      explicit: false,
    });
  });

  it("blank mail variables count as unset → console, not explicit", () => {
    expect(
      resolveMailConfig(
        parseCore({
          MAIL_PROVIDER: "",
          SMTP_URL: "",
          SMTP_HOST: "  ",
          SMTP_PORT: "",
          SMTP_USER: "",
          SMTP_PASS: "",
          SMTP_SECURE: "",
          RESEND_API_KEY: "",
        }),
      ),
    ).toStrictEqual({ provider: "console", explicit: false });
  });
});

describe("resolveMailConfig: explicit MAIL_PROVIDER", () => {
  it("console with SMTP_HOST set → console, explicit", () => {
    expect(
      resolveMailConfig(
        parseCore({ MAIL_PROVIDER: "console", SMTP_HOST: "relay.internal" }),
      ),
    ).toStrictEqual({ provider: "console", explicit: true });
  });

  it("console with RESEND_API_KEY set → console, explicit", () => {
    expect(
      resolveMailConfig(
        parseCore({ MAIL_PROVIDER: "console", RESEND_API_KEY: "re_x" }),
      ),
    ).toStrictEqual({ provider: "console", explicit: true });
  });

  it("console with nothing else → console, explicit", () => {
    expect(
      resolveMailConfig(parseCore({ MAIL_PROVIDER: "console" })),
    ).toStrictEqual({ provider: "console", explicit: true });
  });

  it('" Resend " with RESEND_API_KEY and SMTP_URL → resend (explicit choice wins over detection)', () => {
    expect(
      resolveMailConfig(
        parseCore({
          MAIL_PROVIDER: " Resend ",
          RESEND_API_KEY: "re_x",
          SMTP_URL: "smtp://127.0.0.1:1025",
        }),
      ),
    ).toStrictEqual({ provider: "resend", apiKey: "re_x" });
  });

  it("resend with SMTP_HOST and RESEND_API_KEY → resend", () => {
    expect(
      resolveMailConfig(
        parseCore({
          MAIL_PROVIDER: "resend",
          SMTP_HOST: "relay.internal",
          RESEND_API_KEY: "re_x",
        }),
      ),
    ).toStrictEqual({ provider: "resend", apiKey: "re_x" });
  });

  it("smtp with SMTP_HOST and RESEND_API_KEY → smtp options", () => {
    expect(
      resolveMailConfig(
        parseCore({
          MAIL_PROVIDER: "smtp",
          SMTP_HOST: "relay.internal",
          RESEND_API_KEY: "re_x",
        }),
      ),
    ).toStrictEqual({
      provider: "smtp",
      transport: { host: "relay.internal", port: 587, secure: false },
    });
  });

  it("smtp with SMTP_URL → the URL string", () => {
    expect(
      resolveMailConfig(
        parseCore({ MAIL_PROVIDER: "smtp", SMTP_URL: "smtp://127.0.0.1:1025" }),
      ),
    ).toStrictEqual({ provider: "smtp", transport: "smtp://127.0.0.1:1025" });
  });

  it("works on a plain object, without parsing", () => {
    expect(
      resolveMailConfig({
        MAIL_PROVIDER: undefined,
        SMTP_URL: undefined,
        SMTP_HOST: "mx.example.org",
        SMTP_PORT: 25,
        SMTP_USER: "u",
        SMTP_PASS: "p",
        SMTP_SECURE: false,
        RESEND_API_KEY: undefined,
      }),
    ).toStrictEqual({
      provider: "smtp",
      transport: {
        host: "mx.example.org",
        port: 25,
        secure: false,
        auth: { user: "u", pass: "p" },
      },
    });
  });
});

describe("parseEnv: mail variables", () => {
  it("MAIL_PROVIDER unset → undefined", () => {
    expect(parseCore({}).MAIL_PROVIDER).toBeUndefined();
  });

  it.each(["", "   ", "\t"])("MAIL_PROVIDER %j → undefined", (value) => {
    expect(parseCore({ MAIL_PROVIDER: value }).MAIL_PROVIDER).toBeUndefined();
  });

  it.each([
    [" Resend ", "resend"],
    ["SMTP", "smtp"],
    ["\tConsole\n", "console"],
  ])("MAIL_PROVIDER %j → %j", (value, expected) => {
    expect(
      parseCore({
        MAIL_PROVIDER: value,
        SMTP_HOST: "relay.internal",
        RESEND_API_KEY: "re_x",
      }).MAIL_PROVIDER,
    ).toBe(expected);
  });

  test.prop([
    fc.constantFrom("smtp", "resend", "console"),
    fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }),
    fc.stringMatching(/^[ \t]{0,4}$/),
    fc.stringMatching(/^[ \t]{0,4}$/),
  ])(
    "any letter case and whitespace padding of a known provider parses to the provider and selects it",
    (provider, upper, before, after) => {
      const e = parseCore({
        MAIL_PROVIDER: `${before}${withCase(provider, upper)}${after}`,
        SMTP_HOST: "relay.internal",
        RESEND_API_KEY: "re_x",
      });
      expect(e.MAIL_PROVIDER).toBe(provider);
      expect(resolveMailConfig(e).provider).toBe(provider);
    },
  );

  test.prop([
    fc
      .stringMatching(/^[a-zA-Z_-]{1,12}$/)
      .filter(
        (value) => !["smtp", "resend", "console"].includes(value.toLowerCase()),
      ),
  ])("an unknown MAIL_PROVIDER is reported on MAIL_PROVIDER", (value) => {
    expect(issuesOf({ MAIL_PROVIDER: value }).map(({ name }) => name)).toEqual([
      "MAIL_PROVIDER",
    ]);
  });

  it('MAIL_PROVIDER "sendgrid" → one issue named MAIL_PROVIDER', () => {
    expect(
      issuesOf({ MAIL_PROVIDER: "sendgrid" }).map(({ name }) => name),
    ).toEqual(["MAIL_PROVIDER"]);
  });

  it("SMTP_PORT unset → 587", () => {
    expect(parseCore({}).SMTP_PORT).toBe(587);
  });

  it.each(["", "   ", "\t"])("SMTP_PORT %j → 587", (value) => {
    expect(parseCore({ SMTP_PORT: value }).SMTP_PORT).toBe(587);
  });

  it.each([
    ["1", 1],
    ["25", 25],
    ["465", 465],
    ["65535", 65535],
  ])("SMTP_PORT %j → %d", (value, expected) => {
    expect(
      parseCore({ SMTP_HOST: "relay.internal", SMTP_PORT: value }).SMTP_PORT,
    ).toBe(expected);
  });

  it.each(["0", "65536", "25.5", "abc", "-1", "99999"])(
    "SMTP_PORT %j → one issue named SMTP_PORT",
    (value) => {
      expect(
        issuesOf({ SMTP_HOST: "relay.internal", SMTP_PORT: value }).map(
          ({ name }) => name,
        ),
      ).toEqual(["SMTP_PORT"]);
    },
  );

  it("SMTP_SECURE unset → false", () => {
    expect(parseCore({}).SMTP_SECURE).toBe(false);
  });

  it.each([
    ["true", true],
    [" TRUE ", true],
    ["false", false],
    ["", false],
  ])("SMTP_SECURE %j → %j", (value, expected) => {
    expect(
      parseCore({ SMTP_HOST: "relay.internal", SMTP_SECURE: value })
        .SMTP_SECURE,
    ).toBe(expected);
  });

  it('SMTP_SECURE "yes" → one issue named SMTP_SECURE', () => {
    expect(
      issuesOf({ SMTP_HOST: "relay.internal", SMTP_SECURE: "yes" }).map(
        ({ name }) => name,
      ),
    ).toEqual(["SMTP_SECURE"]);
  });

  it("SMTP_HOST, SMTP_USER and SMTP_PASS keep their values unchanged", () => {
    const e = parseCore({
      SMTP_HOST: "relay.internal",
      SMTP_USER: "app",
      SMTP_PASS: " pw ",
    });
    expect(e.SMTP_HOST).toBe("relay.internal");
    expect(e.SMTP_USER).toBe("app");
    expect(e.SMTP_PASS).toBe(" pw ");
  });

  it("blank SMTP_HOST, SMTP_USER and SMTP_PASS → undefined", () => {
    const e = parseCore({ SMTP_HOST: " ", SMTP_USER: "", SMTP_PASS: "\t" });
    expect(e.SMTP_HOST).toBeUndefined();
    expect(e.SMTP_USER).toBeUndefined();
    expect(e.SMTP_PASS).toBeUndefined();
  });
});

describe("checkEnv: production mail rule", () => {
  it("production without any mail variable → one issue on MAIL_PROVIDER", () => {
    expect(
      checkEnv({ ...validCore, NODE_ENV: "production" }, []),
    ).toStrictEqual({
      ok: false,
      issues: [{ name: "MAIL_PROVIDER", message: NO_PROVIDER_IN_PRODUCTION }],
    });
  });

  it("production with blank mail variables → the same issue on MAIL_PROVIDER", () => {
    expect(
      issuesOf({
        NODE_ENV: "production",
        MAIL_PROVIDER: " ",
        SMTP_URL: "",
        SMTP_HOST: "",
        RESEND_API_KEY: "   ",
      }),
    ).toEqual([{ name: "MAIL_PROVIDER", message: NO_PROVIDER_IN_PRODUCTION }]);
  });

  it.each([
    ["MAIL_PROVIDER=console", { MAIL_PROVIDER: "console" }],
    ['MAIL_PROVIDER=" Console "', { MAIL_PROVIDER: " Console " }],
    ["only SMTP_HOST", { SMTP_HOST: "relay.internal" }],
    ["only SMTP_URL", { SMTP_URL: "smtp://127.0.0.1:1025" }],
    ["only RESEND_API_KEY", { RESEND_API_KEY: "re_live" }],
    [
      "MAIL_PROVIDER=smtp with SMTP_HOST",
      { MAIL_PROVIDER: "smtp", SMTP_HOST: "relay.internal" },
    ],
    [
      "MAIL_PROVIDER=resend with RESEND_API_KEY",
      { MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_live" },
    ],
  ])("production with %s → no issue", (_, source) => {
    expect(issuesOf({ NODE_ENV: "production", ...source })).toEqual([]);
  });

  it.each(["development", "test", undefined])(
    "NODE_ENV %j without any mail variable → no issue",
    (nodeEnv) => {
      expect(issuesOf({ NODE_ENV: nodeEnv })).toEqual([]);
    },
  );

  it("formatEnvReport for production without a provider → the exact startup report", () => {
    const result = checkEnv({ ...validCore, NODE_ENV: "production" }, []);
    expect(result.ok).toBe(false);
    expect(formatEnvReport(result.ok ? [] : result.issues)).toBe(
      "Invalid environment variables (1):\n- MAIL_PROVIDER: no mail provider configured for production: set SMTP_HOST, SMTP_URL or RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail",
    );
  });
});

describe("checkEnv: explicit provider requirements", () => {
  it("MAIL_PROVIDER=smtp without host or URL → issue on SMTP_HOST", () => {
    expect(issuesOf({ MAIL_PROVIDER: "smtp" })).toEqual([
      {
        name: "SMTP_HOST",
        message:
          'SMTP_HOST or SMTP_URL is required when MAIL_PROVIDER is "smtp"',
      },
    ]);
  });

  it('MAIL_PROVIDER=" SMTP " without host or URL → the same issue on SMTP_HOST', () => {
    expect(issuesOf({ MAIL_PROVIDER: " SMTP " })).toEqual([
      {
        name: "SMTP_HOST",
        message:
          'SMTP_HOST or SMTP_URL is required when MAIL_PROVIDER is "smtp"',
      },
    ]);
  });

  it.each([
    ["SMTP_HOST", { SMTP_HOST: "relay.internal" }],
    ["SMTP_URL", { SMTP_URL: "smtp://127.0.0.1:1025" }],
  ])("MAIL_PROVIDER=smtp with only %s → no issue", (_, source) => {
    expect(issuesOf({ MAIL_PROVIDER: "smtp", ...source })).toEqual([]);
  });

  it("MAIL_PROVIDER=resend without a key → issue on RESEND_API_KEY", () => {
    expect(issuesOf({ MAIL_PROVIDER: "resend" })).toEqual([
      {
        name: "RESEND_API_KEY",
        message: 'RESEND_API_KEY is required when MAIL_PROVIDER is "resend"',
      },
    ]);
  });

  it("MAIL_PROVIDER=resend with only SMTP_HOST → issue on RESEND_API_KEY", () => {
    expect(
      issuesOf({ MAIL_PROVIDER: "resend", SMTP_HOST: "relay.internal" }),
    ).toEqual([
      {
        name: "RESEND_API_KEY",
        message: 'RESEND_API_KEY is required when MAIL_PROVIDER is "resend"',
      },
    ]);
  });

  it("MAIL_PROVIDER=console without anything else → no issue", () => {
    expect(issuesOf({ MAIL_PROVIDER: "console" })).toEqual([]);
  });
});

describe("checkEnv: SMTP settings", () => {
  it("SMTP_HOST and SMTP_USER without SMTP_PASS → half-configured authentication on SMTP_USER", () => {
    expect(issuesOf({ SMTP_HOST: "relay.internal", SMTP_USER: "app" })).toEqual(
      [
        {
          name: "SMTP_USER",
          message:
            "SMTP authentication is half-configured: SMTP_USER, SMTP_PASS must all be set or all be omitted (missing: SMTP_PASS)",
        },
      ],
    );
  });

  it("SMTP_HOST and SMTP_PASS without SMTP_USER → half-configured authentication on SMTP_USER", () => {
    expect(issuesOf({ SMTP_HOST: "relay.internal", SMTP_PASS: "pw" })).toEqual([
      {
        name: "SMTP_USER",
        message:
          "SMTP authentication is half-configured: SMTP_USER, SMTP_PASS must all be set or all be omitted (missing: SMTP_USER)",
      },
    ]);
  });

  it("SMTP_HOST without credentials → no issue (unauthenticated relay)", () => {
    expect(issuesOf({ SMTP_HOST: "relay.internal" })).toEqual([]);
  });

  it("SMTP_URL alone → no issue: the default port and secure flag do not count as set", () => {
    expect(issuesOf({ SMTP_URL: "smtp://127.0.0.1:1025" })).toEqual([]);
  });

  it("SMTP_URL with blank split variables → no issue", () => {
    expect(
      issuesOf({
        SMTP_URL: "smtp://127.0.0.1:1025",
        SMTP_HOST: "",
        SMTP_PORT: "",
        SMTP_USER: "",
        SMTP_PASS: "",
        SMTP_SECURE: "",
      }),
    ).toEqual([]);
  });

  it.each(["development", "test", "production"])(
    "SMTP_URL and SMTP_HOST with NODE_ENV %j → one conflict issue on SMTP_HOST",
    (nodeEnv) => {
      expect(
        issuesOf({
          NODE_ENV: nodeEnv,
          SMTP_URL: "smtp://127.0.0.1:1025",
          SMTP_HOST: "relay.internal",
        }),
      ).toEqual([
        {
          name: "SMTP_HOST",
          message:
            "SMTP_URL is set: drop SMTP_HOST, or drop SMTP_URL and use SMTP_HOST",
        },
      ]);
    },
  );

  it("SMTP_URL and SMTP_PORT → one conflict issue on SMTP_PORT", () => {
    expect(
      issuesOf({ SMTP_URL: "smtp://127.0.0.1:1025", SMTP_PORT: "465" }),
    ).toEqual([
      {
        name: "SMTP_PORT",
        message:
          "SMTP_URL is set: drop SMTP_PORT, or drop SMTP_URL and use SMTP_PORT",
      },
    ]);
  });

  it("SMTP_URL and SMTP_SECURE → one conflict issue on SMTP_SECURE", () => {
    expect(
      issuesOf({ SMTP_URL: "smtp://127.0.0.1:1025", SMTP_SECURE: "true" }),
    ).toEqual([
      {
        name: "SMTP_SECURE",
        message:
          "SMTP_URL is set: drop SMTP_SECURE, or drop SMTP_URL and use SMTP_SECURE",
      },
    ]);
  });

  it("SMTP_URL with SMTP_USER and SMTP_PASS → one conflict issue on each", () => {
    const issues = issuesOf({
      SMTP_URL: "smtp://127.0.0.1:1025",
      SMTP_USER: "app",
      SMTP_PASS: "pw",
    });
    expect(issues).toHaveLength(2);
    expect(issues).toEqual(
      expect.arrayContaining([
        {
          name: "SMTP_USER",
          message:
            "SMTP_URL is set: drop SMTP_USER, or drop SMTP_URL and use SMTP_USER",
        },
        {
          name: "SMTP_PASS",
          message:
            "SMTP_URL is set: drop SMTP_PASS, or drop SMTP_URL and use SMTP_PASS",
        },
      ]),
    );
  });
});

describe("mailRules", () => {
  const providerOnly = z
    .object({
      MAIL_PROVIDER: z.string().optional(),
      RESEND_API_KEY: z.string().optional(),
    })
    .superRefine(mailRules);

  it("used as a refinement on its own, reports a missing Resend key for MAIL_PROVIDER=resend", () => {
    const result = providerOnly.safeParse({ MAIL_PROVIDER: "resend" });
    expect(result.error?.issues).toMatchObject([
      {
        path: ["RESEND_API_KEY"],
        message: 'RESEND_API_KEY is required when MAIL_PROVIDER is "resend"',
      },
    ]);
  });

  it("used as a refinement on its own, accepts MAIL_PROVIDER=resend with a key", () => {
    expect(
      providerOnly.safeParse({
        MAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_x",
      }).success,
    ).toBe(true);
  });
});
