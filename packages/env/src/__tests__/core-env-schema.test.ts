import { describe, expect, it } from "vitest";
import {
  checkEnv,
  coreEnvSchema,
  EXAMPLE_BETTER_AUTH_SECRET,
  parseEnv,
} from "../index";

const validCore = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
  BETTER_AUTH_SECRET: "s".repeat(32),
  APP_URL: "http://localhost:3000",
  EMAIL_FROM: "WA App <noreply@example.com>",
};

function parseCore(source: Record<string, string | undefined>) {
  return parseEnv(source, []);
}

describe("coreEnvSchema", () => {
  it("parses the minimal core configuration on its own, without module schemas", () => {
    expect(coreEnvSchema.parse(validCore)).toMatchObject({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
      AUTH_PUBLIC_SIGNUP: false,
      MULTI_ORG: false,
      ADMIN_IMPERSONATION: false,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });
  });
});

describe("parseEnv: core flags", () => {
  it("flags default to false", () => {
    const e = parseCore({ ...validCore });
    expect(e.AUTH_PUBLIC_SIGNUP).toBe(false);
    expect(e.MULTI_ORG).toBe(false);
  });

  it.each(["AUTH_PUBLIC_SIGNUP", "MULTI_ORG"] as const)(
    "%s empty → false",
    (name) => {
      expect(parseCore({ ...validCore, [name]: "" })[name]).toBe(false);
    },
  );

  it.each([
    ["AUTH_PUBLIC_SIGNUP", "true"],
    ["AUTH_PUBLIC_SIGNUP", "TRUE"],
    ["AUTH_PUBLIC_SIGNUP", "True"],
    ["AUTH_PUBLIC_SIGNUP", " true "],
    ["MULTI_ORG", "true"],
    ["MULTI_ORG", "TRUE"],
    ["MULTI_ORG", "True"],
    ["MULTI_ORG", " true "],
  ] as const)("%s=%j → true", (name, value) => {
    expect(parseCore({ ...validCore, [name]: value })[name]).toBe(true);
  });

  it.each([
    ["AUTH_PUBLIC_SIGNUP", "false"],
    ["AUTH_PUBLIC_SIGNUP", "FALSE"],
    ["AUTH_PUBLIC_SIGNUP", " false"],
    ["MULTI_ORG", "false"],
    ["MULTI_ORG", "FALSE"],
    ["MULTI_ORG", " false"],
  ] as const)("%s=%j → false", (name, value) => {
    expect(parseCore({ ...validCore, [name]: value })[name]).toBe(false);
  });

  it.each([
    ["AUTH_PUBLIC_SIGNUP", "1"],
    ["AUTH_PUBLIC_SIGNUP", "0"],
    ["AUTH_PUBLIC_SIGNUP", "yes"],
    ["AUTH_PUBLIC_SIGNUP", "no"],
    ["AUTH_PUBLIC_SIGNUP", "on"],
    ["AUTH_PUBLIC_SIGNUP", "tru"],
    ["MULTI_ORG", "1"],
    ["MULTI_ORG", "0"],
    ["MULTI_ORG", "yes"],
    ["MULTI_ORG", "no"],
    ["MULTI_ORG", "on"],
    ["MULTI_ORG", "tru"],
  ] as const)("%s=%j → error naming the variable", (name, value) => {
    expect(() => parseCore({ ...validCore, [name]: value })).toThrow(
      new RegExp(name),
    );
  });

  it("ADMIN_IMPERSONATION missing → false", () => {
    expect(parseCore({ ...validCore }).ADMIN_IMPERSONATION).toBe(false);
  });

  it("ADMIN_IMPERSONATION empty → false", () => {
    expect(
      parseCore({ ...validCore, ADMIN_IMPERSONATION: "" }).ADMIN_IMPERSONATION,
    ).toBe(false);
  });

  it.each(["true", "TRUE", " true "])(
    "ADMIN_IMPERSONATION=%j → true",
    (value) => {
      expect(
        parseCore({ ...validCore, ADMIN_IMPERSONATION: value })
          .ADMIN_IMPERSONATION,
      ).toBe(true);
    },
  );

  it.each(["false", "FALSE", " false"])(
    "ADMIN_IMPERSONATION=%j → false",
    (value) => {
      expect(
        parseCore({ ...validCore, ADMIN_IMPERSONATION: value })
          .ADMIN_IMPERSONATION,
      ).toBe(false);
    },
  );

  it.each(["1", "0", "yes", "on", "tru"])(
    "ADMIN_IMPERSONATION=%j → error naming the variable",
    (value) => {
      expect(() =>
        parseCore({ ...validCore, ADMIN_IMPERSONATION: value }),
      ).toThrow(/ADMIN_IMPERSONATION/);
    },
  );

  it("ADMIN_IMPERSONATION does not change AUTH_PUBLIC_SIGNUP nor MULTI_ORG", () => {
    const e = parseCore({ ...validCore, ADMIN_IMPERSONATION: "true" });
    expect(e.AUTH_PUBLIC_SIGNUP).toBe(false);
    expect(e.MULTI_ORG).toBe(false);
  });
});

describe("parseEnv: APP_URL and BETTER_AUTH_SECRET", () => {
  it.each([
    "http://localhost:3000",
    "https://app.example.com",
    "https://app.example.com/",
  ])("APP_URL %j is accepted unchanged", (value) => {
    expect(parseCore({ ...validCore, APP_URL: value }).APP_URL).toBe(value);
  });

  it.each([
    "localhost:3000",
    "app.example.com",
    "ftp://example.com",
    "/relative",
    "http//x",
    "git+https://example.com",
    "httpx://example.com",
  ])("APP_URL %j → error naming the variable", (value) => {
    expect(() => parseCore({ ...validCore, APP_URL: value })).toThrow(
      /APP_URL/,
    );
  });

  it("an invalid APP_URL keeps zod's default URL message", () => {
    expect(checkEnv({ ...validCore, APP_URL: "localhost:3000" }, [])).toEqual({
      ok: false,
      issues: [{ name: "APP_URL", message: "Invalid URL" }],
    });
  });

  it.each([
    ["32 spaces", " ".repeat(32)],
    ["31 characters padded with spaces to 40", "a".repeat(31) + " ".repeat(9)],
  ])(
    "BETTER_AUTH_SECRET %s → error naming the variable (length after trim)",
    (_, value) => {
      expect(() =>
        parseCore({ ...validCore, BETTER_AUTH_SECRET: value }),
      ).toThrow(/BETTER_AUTH_SECRET/);
    },
  );

  it("a short BETTER_AUTH_SECRET reports the D48 message", () => {
    expect(
      checkEnv({ ...validCore, BETTER_AUTH_SECRET: "s".repeat(31) }, []),
    ).toEqual({
      ok: false,
      issues: [
        {
          name: "BETTER_AUTH_SECRET",
          message: "at least 32 characters, no leading or trailing spaces",
        },
      ],
    });
  });

  it("a 32-character BETTER_AUTH_SECRET is accepted unchanged", () => {
    expect(
      parseCore({ ...validCore, BETTER_AUTH_SECRET: "s".repeat(32) })
        .BETTER_AUTH_SECRET,
    ).toBe("s".repeat(32));
  });

  it("BETTER_AUTH_SECRET with surrounding spaces is not trimmed", () => {
    expect(
      parseCore({ ...validCore, BETTER_AUTH_SECRET: ` ${"s".repeat(32)} ` })
        .BETTER_AUTH_SECRET,
    ).toBe(` ${"s".repeat(32)} `);
  });

  it("BETTER_AUTH_SECRET shorter than 32 characters → error naming the variable", () => {
    expect(() =>
      parseCore({ ...validCore, BETTER_AUTH_SECRET: "s".repeat(31) }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("production with the .env.example BETTER_AUTH_SECRET and MAIL_PROVIDER=console → the D48 message on that variable", () => {
    expect(
      checkEnv(
        {
          ...validCore,
          NODE_ENV: "production",
          MAIL_PROVIDER: "console",
          BETTER_AUTH_SECRET: EXAMPLE_BETTER_AUTH_SECRET,
        },
        [],
      ),
    ).toEqual({
      ok: false,
      issues: [
        {
          name: "BETTER_AUTH_SECRET",
          message: "must not be the .env.example value in production",
        },
      ],
    });
  });

  it("production with the .env.example BETTER_AUTH_SECRET → the D48 message on that variable", () => {
    expect(
      checkEnv(
        {
          ...validCore,
          NODE_ENV: "production",
          RESEND_API_KEY: "re_live",
          BETTER_AUTH_SECRET: EXAMPLE_BETTER_AUTH_SECRET,
        },
        [],
      ),
    ).toEqual({
      ok: false,
      issues: [
        {
          name: "BETTER_AUTH_SECRET",
          message: "must not be the .env.example value in production",
        },
      ],
    });
  });

  it("the placeholder BETTER_AUTH_SECRET is allowed outside production", () => {
    expect(
      parseCore({
        ...validCore,
        BETTER_AUTH_SECRET: EXAMPLE_BETTER_AUTH_SECRET,
      }).BETTER_AUTH_SECRET,
    ).toBe(EXAMPLE_BETTER_AUTH_SECRET);
  });

  it("the placeholder constant keeps its literal value", () => {
    expect(EXAMPLE_BETTER_AUTH_SECRET).toBe(
      "change-me-to-a-random-string-of-at-least-32-chars",
    );
  });
});

describe("parseEnv: required variables", () => {
  it("missing DATABASE_URL → error naming the variable", () => {
    expect(() => parseCore({ ...validCore, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("missing APP_URL → error naming the variable", () => {
    expect(() => parseCore({ ...validCore, APP_URL: undefined })).toThrow(
      /APP_URL/,
    );
  });

  it("missing EMAIL_FROM → error naming the variable", () => {
    expect(() => parseCore({ ...validCore, EMAIL_FROM: undefined })).toThrow(
      /EMAIL_FROM/,
    );
  });
});

describe("parseEnv: optional variables and production rules", () => {
  it("production without any mail provider → error naming MAIL_PROVIDER", () => {
    expect(() => parseCore({ ...validCore, NODE_ENV: "production" })).toThrow(
      /MAIL_PROVIDER/,
    );
  });

  it("production with only SMTP_HOST passes without RESEND_API_KEY", () => {
    expect(
      parseCore({
        ...validCore,
        NODE_ENV: "production",
        SMTP_HOST: "relay.internal",
      }).RESEND_API_KEY,
    ).toBeUndefined();
  });

  it("optional variables with a value keep it unchanged", () => {
    const e = parseCore({
      ...validCore,
      SMTP_URL: "smtp://localhost:1025",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "hunter2",
      LOG_LEVEL: "debug",
    });
    expect(e.SMTP_URL).toBe("smtp://localhost:1025");
    expect(e.ADMIN_EMAIL).toBe("admin@example.com");
    expect(e.ADMIN_PASSWORD).toBe("hunter2");
    expect(e.LOG_LEVEL).toBe("debug");
  });

  it("an optional variable with surrounding spaces is not trimmed", () => {
    expect(parseCore({ ...validCore, LOG_LEVEL: " debug " }).LOG_LEVEL).toBe(
      " debug ",
    );
  });

  it("a valid production configuration passes", () => {
    const e = parseCore({
      ...validCore,
      NODE_ENV: "production",
      RESEND_API_KEY: "re_live",
      BETTER_AUTH_SECRET: "p".repeat(48),
    });
    expect(e.NODE_ENV).toBe("production");
    expect(e.RESEND_API_KEY).toBe("re_live");
    expect(e.BETTER_AUTH_SECRET).toBe("p".repeat(48));
  });

  it("empty optional variables count as missing", () => {
    const e = parseCore({
      ...validCore,
      RESEND_API_KEY: "",
      SMTP_URL: "",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
      LOG_LEVEL: "",
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
      MAIL_PROVIDER: "",
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASS: "",
    });
    expect(e.RESEND_API_KEY).toBeUndefined();
    expect(e.SMTP_URL).toBeUndefined();
    expect(e.ADMIN_EMAIL).toBeUndefined();
    expect(e.ADMIN_PASSWORD).toBeUndefined();
    expect(e.LOG_LEVEL).toBeUndefined();
    expect(e.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(e.MAIL_PROVIDER).toBeUndefined();
    expect(e.SMTP_HOST).toBeUndefined();
    expect(e.SMTP_USER).toBeUndefined();
    expect(e.SMTP_PASS).toBeUndefined();
  });

  it("whitespace-only optional variables count as missing", () => {
    const e = parseCore({
      ...validCore,
      RESEND_API_KEY: "   ",
      SMTP_URL: "\t",
      ADMIN_EMAIL: " \n ",
      ADMIN_PASSWORD: "  ",
      LOG_LEVEL: " ",
      OTEL_EXPORTER_OTLP_ENDPOINT: "   ",
      MAIL_PROVIDER: "  ",
      SMTP_HOST: "\t",
      SMTP_USER: " ",
      SMTP_PASS: " \n ",
    });
    expect(e.RESEND_API_KEY).toBeUndefined();
    expect(e.SMTP_URL).toBeUndefined();
    expect(e.ADMIN_EMAIL).toBeUndefined();
    expect(e.ADMIN_PASSWORD).toBeUndefined();
    expect(e.LOG_LEVEL).toBeUndefined();
    expect(e.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(e.MAIL_PROVIDER).toBeUndefined();
    expect(e.SMTP_HOST).toBeUndefined();
    expect(e.SMTP_USER).toBeUndefined();
    expect(e.SMTP_PASS).toBeUndefined();
  });

  it("production with an empty RESEND_API_KEY → error naming MAIL_PROVIDER", () => {
    expect(() =>
      parseCore({ ...validCore, NODE_ENV: "production", RESEND_API_KEY: "" }),
    ).toThrow(/MAIL_PROVIDER/);
  });

  it("production with a whitespace-only RESEND_API_KEY → the production mail rule on MAIL_PROVIDER", () => {
    expect(
      checkEnv(
        { ...validCore, NODE_ENV: "production", RESEND_API_KEY: "   " },
        [],
      ),
    ).toEqual({
      ok: false,
      issues: [
        {
          name: "MAIL_PROVIDER",
          message:
            "no mail provider configured for production: set SMTP_HOST, SMTP_URL or RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail",
        },
      ],
    });
  });
});

describe("parseEnv: OTEL_EXPORTER_OTLP_ENDPOINT", () => {
  it("a scheme-less endpoint is rejected with an issue on that variable", () => {
    expect(
      checkEnv(
        { ...validCore, OTEL_EXPORTER_OTLP_ENDPOINT: "localhost:4318" },
        [],
      ),
    ).toEqual({
      ok: false,
      issues: [{ name: "OTEL_EXPORTER_OTLP_ENDPOINT", message: "Invalid URL" }],
    });
  });

  it.each(["ftp://collector:4318", "grpc://collector:4317", "collector"])(
    "endpoint %j is rejected",
    (value) => {
      expect(() =>
        parseCore({ ...validCore, OTEL_EXPORTER_OTLP_ENDPOINT: value }),
      ).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/);
    },
  );

  it.each(["http://localhost:4318", "https://otel.example.com/"])(
    "endpoint %j is accepted unchanged",
    (value) => {
      expect(
        parseCore({ ...validCore, OTEL_EXPORTER_OTLP_ENDPOINT: value })
          .OTEL_EXPORTER_OTLP_ENDPOINT,
      ).toBe(value);
    },
  );

  it("a missing endpoint stays undefined", () => {
    expect(parseCore(validCore).OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
  });
});
