import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  composeProjectName,
  randomSuffix,
  readEnvValue,
  setEnvValues,
  wizardEnvValues,
} from "../env-file.js";
import type { MailAnswer } from "../questions.js";

const MAILPIT: MailAnswer = { provider: "smtp", localMailpit: true };

describe("setEnvValues", () => {
  it.each([
    ["A=1\nB=2\n", { B: "x" }, "A=1\nB=x\n"],
    ["A=1\n", { C: "3" }, "A=1\nC=3\n"],
    ["A=1", { C: "3" }, "A=1\nC=3\n"],
    ["BB=2\n# B=old\n", { B: "x" }, "BB=2\n# B=old\nB=x\n"],
    ["B=1\n", { B: "$&$1" }, "B=$&$1\n"],
    ["B=1\n", { B: "$`$'" }, "B=$`$'\n"],
    ["AB=1\nB=2\nBA=3\n", { B: "x" }, "AB=1\nB=x\nBA=3\n"],
    ["A=1\nB=2\n", { A: "a", B: "b" }, "A=a\nB=b\n"],
    ["A=1\n", { B: "b", C: "c" }, "A=1\nB=b\nC=c\n"],
    ["", { A: "1" }, "A=1\n"],
  ])("%j z %j daje %j", (text, values, expected) => {
    expect(setEnvValues(text, values)).toBe(expected);
  });

  const key = fc
    .stringMatching(/^[A-Z][A-Z0-9_]{0,8}$/)
    .filter((candidate) => candidate !== "TARGET");
  const value = fc.stringMatching(/^[a-z0-9/+=:.-]{0,12}$/);
  const line = fc.oneof(
    fc.tuple(key, value).map(([k, v]) => `${k}=${v}`),
    fc.stringMatching(/^# [A-Za-z0-9=_ ]{0,12}$/),
    fc.constant(""),
    fc.constant("TARGETX=keep"),
    fc.constant("# TARGET=comment"),
  );

  test.prop([
    fc.array(line, { maxLength: 12 }),
    fc.stringMatching(/^[A-Za-z0-9$&`'/+=-]{0,16}$/),
  ])(
    "dopisanie nowego klucza nie zmienia pozostałych linii",
    (lines, newValue) => {
      const text = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
      expect(setEnvValues(text, { TARGET: newValue })).toBe(
        `${text}TARGET=${newValue}\n`,
      );
    },
  );

  test.prop([
    fc.array(line, { maxLength: 6 }),
    fc.array(line, { maxLength: 6 }),
    fc.stringMatching(/^[A-Za-z0-9$&`'/+=-]{0,16}$/),
  ])(
    "zamiana istniejącego klucza zmienia tylko jego linię",
    (before, after, newValue) => {
      const text = `${[...before, "TARGET=old", ...after].join("\n")}\n`;
      const result = setEnvValues(text, { TARGET: newValue });
      expect(result).toBe(
        `${[...before, `TARGET=${newValue}`, ...after].join("\n")}\n`,
      );
      expect(readEnvValue(result, "TARGET")).toBe(newValue);
    },
  );
});

describe("readEnvValue", () => {
  it("czyta wartość klucza", () => {
    expect(readEnvValue("A=1\nB=two\n", "B")).toBe("two");
  });

  it("brak klucza daje null", () => {
    expect(readEnvValue("A=1\n", "B")).toBeNull();
  });

  it("klucz z tym samym przedrostkiem nie pasuje", () => {
    expect(readEnvValue("BB=2", "B")).toBeNull();
    expect(readEnvValue("AB=2\n", "B")).toBeNull();
  });

  it("zakomentowana linia nie pasuje", () => {
    expect(readEnvValue("# B=old\n", "B")).toBeNull();
  });

  it("pusta wartość to pusty napis", () => {
    expect(readEnvValue("ADMIN_EMAIL=\n", "ADMIN_EMAIL")).toBe("");
  });
});

describe("randomSuffix", () => {
  it("bajty mapuje na litery i cyfry modulo 36", () => {
    expect(randomSuffix(Uint8Array.from([0, 1, 2, 35, 36, 255]))).toBe(
      "abc9ad",
    );
  });

  it("25 i 26 to granica liter i cyfr", () => {
    expect(randomSuffix(Uint8Array.from([25, 26, 27, 34, 71, 72]))).toBe(
      "z0189a",
    );
  });

  test.prop([fc.uint8Array({ minLength: 6, maxLength: 6 })])(
    "dowolne 6 bajtów daje 6 znaków z [a-z0-9]",
    (bytes) => {
      expect(randomSuffix(bytes)).toMatch(/^[a-z0-9]{6}$/);
    },
  );
});

describe("composeProjectName", () => {
  it("łączy slug i przyrostek myślnikiem", () => {
    expect(composeProjectName("acme-shop", "abc9ad")).toBe("acme-shop-abc9ad");
  });
});

describe("wizardEnvValues", () => {
  it("bez COMPOSE_PROJECT_NAME i bez magazynu ustawia tylko nazwę projektu compose", () => {
    expect(
      wizardEnvValues({
        existing: "A=1\n",
        slug: "acme-shop",
        suffix: "abc9ad",
        storage: null,
        mail: MAILPIT,
      }),
    ).toStrictEqual({ COMPOSE_PROJECT_NAME: "acme-shop-abc9ad" });
  });

  it("istniejący COMPOSE_PROJECT_NAME nie jest generowany od nowa", () => {
    expect(
      wizardEnvValues({
        existing: "A=1\nCOMPOSE_PROJECT_NAME=old\n",
        slug: "acme-shop",
        suffix: "abc9ad",
        storage: null,
        mail: MAILPIT,
      }),
    ).toStrictEqual({});
  });

  it("klucz z tym samym przyrostkiem nie liczy się jako COMPOSE_PROJECT_NAME", () => {
    expect(
      wizardEnvValues({
        existing: "MY_COMPOSE_PROJECT_NAME=old\n",
        slug: "acme-shop",
        suffix: "abc9ad",
        storage: null,
        mail: MAILPIT,
      }),
    ).toStrictEqual({ COMPOSE_PROJECT_NAME: "acme-shop-abc9ad" });
  });

  it("magazyn lokalny dokłada STORAGE_PROVIDER=local", () => {
    expect(
      wizardEnvValues({
        existing: "",
        slug: "acme-shop",
        suffix: "abc9ad",
        storage: { provider: "local" },
        mail: MAILPIT,
      }),
    ).toStrictEqual({
      COMPOSE_PROJECT_NAME: "acme-shop-abc9ad",
      STORAGE_PROVIDER: "local",
    });
  });

  it("S3 dokłada dostawcę, endpoint i oba klucze z odpowiedzi", () => {
    expect(
      wizardEnvValues({
        existing: "COMPOSE_PROJECT_NAME=keep\n",
        slug: "acme-shop",
        suffix: "abc9ad",
        storage: {
          provider: "s3",
          endpoint: "https://s3.example.com",
          accessKeyId: "AK",
          secretAccessKey: "SK/+=",
          localMinio: false,
        },
        mail: MAILPIT,
      }),
    ).toStrictEqual({
      STORAGE_PROVIDER: "s3",
      S3_ENDPOINT: "https://s3.example.com",
      S3_ACCESS_KEY_ID: "AK",
      S3_SECRET_ACCESS_KEY: "SK/+=",
    });
  });
});

const ENV_EXAMPLE = [
  "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wa_app",
  "BETTER_AUTH_SECRET=change-me-to-a-random-string-of-at-least-32-chars",
  "APP_URL=http://localhost:3000",
  "RESEND_API_KEY=",
  "SMTP_URL=smtp://localhost:1025",
  "MAIL_PROVIDER=",
  "SMTP_HOST=",
  "SMTP_PORT=",
  "SMTP_USER=",
  "SMTP_PASS=",
  "SMTP_SECURE=",
  'EMAIL_FROM="WA App <noreply@example.com>"',
  "AUTH_PUBLIC_SIGNUP=false",
  "COMPOSE_PROJECT_NAME=wa-app-abc9ad",
  "",
].join("\n");

const RELAY: MailAnswer = {
  provider: "smtp",
  localMailpit: false,
  host: "relay.internal",
  port: 587,
  user: null,
  pass: null,
};
const RELAY_WITH_AUTH: MailAnswer = { ...RELAY, user: "app", pass: "pw" };
const RESEND: MailAnswer = { provider: "resend", apiKey: "re_x" };
const CONSOLE: MailAnswer = { provider: "console" };

function mailValues(mail: MailAnswer): Record<string, string> {
  return wizardEnvValues({
    existing: "COMPOSE_PROJECT_NAME=keep\n",
    slug: "acme-shop",
    suffix: "abc9ad",
    storage: null,
    mail,
  });
}

function smtpUrlLines(text: string): string[] {
  return text.split("\n").filter((line) => line.startsWith("SMTP_URL="));
}

describe("wizardEnvValues: mail", () => {
  it("local mailpit writes nothing", () => {
    expect(mailValues(MAILPIT)).toStrictEqual({});
  });

  it("an SMTP relay without a user blanks SMTP_URL and writes only host and port", () => {
    expect(mailValues(RELAY)).toStrictEqual({
      MAIL_PROVIDER: "smtp",
      SMTP_URL: "",
      SMTP_HOST: "relay.internal",
      SMTP_PORT: "587",
    });
  });

  it("an SMTP relay with a user also writes the user and the password", () => {
    expect(mailValues(RELAY_WITH_AUTH)).toStrictEqual({
      MAIL_PROVIDER: "smtp",
      SMTP_URL: "",
      SMTP_HOST: "relay.internal",
      SMTP_PORT: "587",
      SMTP_USER: "app",
      SMTP_PASS: "pw",
    });
  });

  it("writes the port as a decimal string", () => {
    expect(mailValues({ ...RELAY, port: 2525 })).toMatchObject({
      SMTP_PORT: "2525",
    });
  });

  it("resend writes the provider and the key and blanks SMTP_URL", () => {
    expect(mailValues(RESEND)).toStrictEqual({
      MAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_x",
      SMTP_URL: "",
    });
  });

  it("console writes the provider and blanks SMTP_URL", () => {
    expect(mailValues(CONSOLE)).toStrictEqual({
      MAIL_PROVIDER: "console",
      SMTP_URL: "",
    });
  });

  it("mail values come together with COMPOSE_PROJECT_NAME and storage", () => {
    expect(
      wizardEnvValues({
        existing: "",
        slug: "acme-shop",
        suffix: "abc9ad",
        storage: { provider: "local" },
        mail: CONSOLE,
      }),
    ).toStrictEqual({
      COMPOSE_PROJECT_NAME: "acme-shop-abc9ad",
      STORAGE_PROVIDER: "local",
      MAIL_PROVIDER: "console",
      SMTP_URL: "",
    });
  });

  const host = fc
    .stringMatching(/^[a-z][a-z0-9.-]{0,20}$/)
    .filter((value) => value !== "127.0.0.1");
  const credential = fc.stringMatching(/^[A-Za-z0-9_]{1,12}$/);
  const auth = fc.option(fc.tuple(credential, credential), { nil: null });
  const relay = fc
    .tuple(host, fc.integer({ min: 1, max: 65535 }), auth)
    .map(([relayHost, port, pair]): MailAnswer => ({
      provider: "smtp",
      localMailpit: false,
      host: relayHost,
      port,
      user: pair === null ? null : pair[0],
      pass: pair === null ? null : pair[1],
    }));
  const anyNonMailpit = fc.oneof(
    relay,
    fc
      .stringMatching(/^re_[A-Za-z0-9]{1,16}$/)
      .map((apiKey): MailAnswer => ({ provider: "resend", apiKey })),
    fc.constant(CONSOLE),
  );

  test.prop([anyNonMailpit])(
    "every answer other than local mailpit blanks SMTP_URL",
    (mail) => {
      expect(mailValues(mail).SMTP_URL).toBe("");
    },
  );

  test.prop([relay])(
    "SMTP_USER and SMTP_PASS appear only with a user",
    (mail) => {
      const values = mailValues(mail);
      const withUser =
        mail.provider === "smtp" && !mail.localMailpit && mail.user !== null;
      expect("SMTP_USER" in values).toBe(withUser);
      expect("SMTP_PASS" in values).toBe(withUser);
    },
  );

  test.prop([anyNonMailpit])(
    "applied to .env.example, leaves exactly one SMTP_URL line and it is empty",
    (mail) => {
      expect(smtpUrlLines(setEnvValues(ENV_EXAMPLE, mailValues(mail)))).toEqual(
        ["SMTP_URL="],
      );
    },
  );
});

describe("setEnvValues with the mail answers on .env.example", () => {
  it("local mailpit keeps SMTP_URL=smtp://localhost:1025 and the whole file", () => {
    const result = setEnvValues(ENV_EXAMPLE, mailValues(MAILPIT));
    expect(result).toBe(ENV_EXAMPLE);
    expect(smtpUrlLines(result)).toEqual(["SMTP_URL=smtp://localhost:1025"]);
  });

  it.each([
    ["relay", RELAY],
    ["relay with auth", RELAY_WITH_AUTH],
    ["resend", RESEND],
    ["console", CONSOLE],
  ])("%s leaves exactly one empty SMTP_URL line", (_name, mail) => {
    expect(smtpUrlLines(setEnvValues(ENV_EXAMPLE, mailValues(mail)))).toEqual([
      "SMTP_URL=",
    ]);
  });

  it("a relay with auth fills the split variables in place and appends nothing", () => {
    expect(setEnvValues(ENV_EXAMPLE, mailValues(RELAY_WITH_AUTH))).toBe(
      [
        "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wa_app",
        "BETTER_AUTH_SECRET=change-me-to-a-random-string-of-at-least-32-chars",
        "APP_URL=http://localhost:3000",
        "RESEND_API_KEY=",
        "SMTP_URL=",
        "MAIL_PROVIDER=smtp",
        "SMTP_HOST=relay.internal",
        "SMTP_PORT=587",
        "SMTP_USER=app",
        "SMTP_PASS=pw",
        "SMTP_SECURE=",
        'EMAIL_FROM="WA App <noreply@example.com>"',
        "AUTH_PUBLIC_SIGNUP=false",
        "COMPOSE_PROJECT_NAME=wa-app-abc9ad",
        "",
      ].join("\n"),
    );
  });

  it("a relay without auth leaves SMTP_USER and SMTP_PASS empty", () => {
    const lines = setEnvValues(ENV_EXAMPLE, mailValues(RELAY)).split("\n");
    expect(lines).toContain("SMTP_USER=");
    expect(lines).toContain("SMTP_PASS=");
    expect(lines).toContain("MAIL_PROVIDER=smtp");
  });

  it("resend fills RESEND_API_KEY in place", () => {
    const lines = setEnvValues(ENV_EXAMPLE, mailValues(RESEND)).split("\n");
    expect(lines.filter((line) => line.startsWith("RESEND_API_KEY="))).toEqual([
      "RESEND_API_KEY=re_x",
    ]);
    expect(lines).toContain("MAIL_PROVIDER=resend");
    expect(lines).toHaveLength(15);
  });
});
