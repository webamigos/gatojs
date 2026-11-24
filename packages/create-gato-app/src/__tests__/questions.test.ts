import { describe, expect, it } from "vitest";
import type { CreateCliArgs } from "../args.js";
import type { KitModule } from "../kit-modules.js";
import {
  CancelledError,
  collectAnswers,
  displayName,
  LOCAL_MAILPIT_HOST,
  LOCAL_MINIO_ENDPOINT,
  LOCAL_MINIO_KEY,
} from "../questions.js";
import {
  scriptedPrompter,
  silentPrompter,
  type PromptCall,
  type ScriptedAnswer,
} from "./fake-prompter.js";

const M_MODULES = "Modules (space to toggle, enter to confirm)";
const M_ENGLISH = "Add English? Polish is always included.";
const M_TITLE = "Display name";
const M_EMAIL = "First admin's email (empty to skip)";
const M_STORAGE = "File storage for uploads";
const M_ENDPOINT =
  "S3 endpoint (http://localhost:9000 = local MinIO started with Docker)";
const M_SETUP =
  "Start the database with Docker, run migrations and create the admin now?";

const TITLE_MESSAGE =
  "Title: use 1-60 characters without quotes, backslashes, <, >, $, backticks or control characters";
const EMAIL_MESSAGE = "Admin email: expected an address like admin@example.com";

const MODULES: KitModule[] = [
  { name: "api-keys", description: "API keys", requires: [] },
  { name: "demo", description: "Demo", requires: [] },
  { name: "needs-demo", description: "Needs demo", requires: ["demo"] },
  { name: "uploads", description: "Files", requires: [] },
];

const BASE: CreateCliArgs = {
  kind: "create",
  target: "acme-shop",
  kitVersion: null,
  kitPath: null,
  modules: null,
  locales: null,
  title: null,
  adminEmail: null,
  yes: false,
  setup: false,
  install: true,
  docker: true,
  git: true,
  cliSource: null,
  storage: null,
  s3Endpoint: null,
  s3AccessKeyId: null,
  s3SecretAccessKey: null,
  mailProvider: null,
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpPass: null,
  resendApiKey: null,
};

function args(overrides: Partial<CreateCliArgs>): CreateCliArgs {
  return { ...BASE, ...overrides };
}

function ask(overrides: Partial<CreateCliArgs>, script: ScriptedAnswer[]) {
  const { prompter, calls } = scriptedPrompter(script);
  return {
    calls,
    answers: collectAnswers({
      args: args(overrides),
      slug: "acme-shop",
      modules: MODULES,
      prompter,
    }),
  };
}

function messages(calls: PromptCall[]): string[] {
  return calls.map((call) => call.input.message);
}

function callFor(calls: PromptCall[], message: string): PromptCall {
  const call = calls.find((candidate) => candidate.input.message === message);
  if (!call) throw new Error(`no prompt "${message}"`);
  return call;
}

function validatorOf(call: PromptCall): (value: string) => string | undefined {
  const validate = call.input.validate;
  if (!validate)
    throw new Error(`prompt "${call.input.message}" has no validate`);
  return validate;
}

const TAKE_DEFAULT = (input: { defaultValue?: string }) => input.defaultValue;

const M_MAIL: string = expect.any(String);
const MAIL_CONSOLE: ScriptedAnswer = { method: "select", answer: "console" };
const MAILPIT = { provider: "smtp", localMailpit: true };

describe("displayName", () => {
  it.each([
    ["acme-shop", "Acme Shop"],
    ["my-app", "My App"],
    ["crm", "Crm"],
    ["a1-b2-c3", "A1 B2 C3"],
  ])("%s daje %s", (slug, expected) => {
    expect(displayName(slug)).toBe(expected);
  });
});

describe("collectAnswers z --yes", () => {
  it("bez innych flag przyjmuje wartości domyślne i o nic nie pyta", async () => {
    const { answers, calls } = ask({ yes: true }, []);
    await expect(answers).resolves.toStrictEqual({
      modules: [],
      locales: ["pl", "en"],
      title: "Acme Shop",
      adminEmail: null,
      storage: null,
      mail: MAILPIT,
      setup: true,
    });
    expect(calls).toEqual([]);
  });

  it("z uploads przyjmuje lokalny magazyn plików", async () => {
    const { answers } = ask({ yes: true, modules: ["uploads"] }, []);
    await expect(answers).resolves.toMatchObject({
      modules: ["uploads"],
      storage: { provider: "local" },
    });
  });

  it("dokłada moduły wymagane przez wybrane", async () => {
    const { answers } = ask({ yes: true, modules: ["needs-demo"] }, []);
    await expect(answers).resolves.toMatchObject({
      modules: ["demo", "needs-demo"],
    });
  });

  it("nieznany moduł z flagi odrzuca z listą dostępnych", async () => {
    const { answers } = ask({ yes: true, modules: ["nope"] }, []);
    await expect(answers).rejects.toThrow(
      'Unknown module "nope". Available: api-keys, demo, needs-demo, uploads.',
    );
  });

  it("--storage s3 bez endpointu oznacza lokalne MinIO z kluczami minioadmin", async () => {
    const { answers } = ask(
      { yes: true, modules: ["uploads"], storage: "s3" },
      [],
    );
    await expect(answers).resolves.toMatchObject({
      storage: {
        provider: "s3",
        endpoint: "http://localhost:9000",
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
        localMinio: true,
      },
    });
    expect(LOCAL_MINIO_ENDPOINT).toBe("http://localhost:9000");
    expect(LOCAL_MINIO_KEY).toBe("minioadmin");
  });

  it("--storage s3 z zewnętrznym endpointem i kluczami zachowuje podane wartości", async () => {
    const { answers } = ask(
      {
        yes: true,
        modules: ["uploads"],
        storage: "s3",
        s3Endpoint: "https://s3.example.com",
        s3AccessKeyId: "AK",
        s3SecretAccessKey: "SK",
      },
      [],
    );
    await expect(answers).resolves.toMatchObject({
      storage: {
        provider: "s3",
        endpoint: "https://s3.example.com",
        accessKeyId: "AK",
        secretAccessKey: "SK",
        localMinio: false,
      },
    });
  });

  it("--storage s3 bez modułu uploads nie ustawia magazynu", async () => {
    const { answers } = ask(
      { yes: true, modules: ["api-keys"], storage: "s3" },
      [],
    );
    await expect(answers).resolves.toMatchObject({
      modules: ["api-keys"],
      storage: null,
    });
  });

  it("flagi tytułu, języków i e-maila mają pierwszeństwo przed wartościami domyślnymi", async () => {
    const { answers } = ask(
      { yes: true, title: "Sklep", locales: ["pl"], adminEmail: "a@b.co" },
      [],
    );
    await expect(answers).resolves.toMatchObject({
      title: "Sklep",
      locales: ["pl"],
      adminEmail: "a@b.co",
    });
  });

  it.each([[{ install: false, docker: false }], [{ docker: false }]])(
    "%j wyłącza konfigurację środowiska",
    async (overrides) => {
      const { answers, calls } = ask({ yes: true, ...overrides }, []);
      await expect(answers).resolves.toMatchObject({ setup: false });
      expect(calls).toEqual([]);
    },
  );

  it("nie woła promptera nawet bez terminala", async () => {
    await expect(
      collectAnswers({
        args: args({ yes: true, modules: ["uploads"] }),
        slug: "acme-shop",
        modules: MODULES,
        prompter: silentPrompter,
      }),
    ).resolves.toMatchObject({ storage: { provider: "local" } });
  });
});

describe("collectAnswers interaktywnie", () => {
  const FULL_SCRIPT: ScriptedAnswer[] = [
    { method: "multiselect", answer: ["uploads"] },
    { method: "confirm", answer: true },
    { method: "text", answer: TAKE_DEFAULT },
    { method: "text", answer: "" },
    { method: "select", answer: "local" },
    { method: "select", answer: "smtp" },
    { method: "text", answer: TAKE_DEFAULT },
    { method: "confirm", answer: true },
  ];

  it("asks modules, English, name, email, storage, mail and setup in this order", async () => {
    const { answers, calls } = ask({}, FULL_SCRIPT);
    await expect(answers).resolves.toStrictEqual({
      modules: ["uploads"],
      locales: ["pl", "en"],
      title: "Acme Shop",
      adminEmail: null,
      storage: { provider: "local" },
      mail: MAILPIT,
      setup: true,
    });
    expect(calls.map((call) => call.method)).toEqual([
      "multiselect",
      "confirm",
      "text",
      "text",
      "select",
      "select",
      "text",
      "confirm",
    ]);
    expect(messages(calls)).toEqual([
      M_MODULES,
      M_ENGLISH,
      M_TITLE,
      M_EMAIL,
      M_STORAGE,
      M_MAIL,
      M_MAIL,
      M_SETUP,
    ]);
    expect(calls[5]?.input.options?.map((option) => option.value)).toEqual([
      "smtp",
      "resend",
      "console",
    ]);
  });

  it("lista modułów pokazuje każdy moduł z opisem i nic nie zaznacza", async () => {
    const { answers, calls } = ask({}, FULL_SCRIPT);
    await answers;
    const multiselect = callFor(calls, M_MODULES);
    expect(multiselect.input.options).toEqual([
      { value: "api-keys", label: "api-keys", hint: "API keys" },
      { value: "demo", label: "demo", hint: "Demo" },
      { value: "needs-demo", label: "needs-demo", hint: "Needs demo" },
      { value: "uploads", label: "uploads", hint: "Files" },
    ]);
    expect(multiselect.input.initialValues).toEqual([]);
  });

  it("pytania mają domyślne wartości ze specyfikacji", async () => {
    const { answers, calls } = ask({}, FULL_SCRIPT);
    await answers;
    expect(callFor(calls, M_ENGLISH).input.initialValue).toBe(true);
    expect(callFor(calls, M_TITLE).input.defaultValue).toBe("Acme Shop");
    expect(callFor(calls, M_EMAIL).input.defaultValue).toBe("");
    const storage = callFor(calls, M_STORAGE);
    expect(storage.input.initialValue).toBe("local");
    expect(storage.input.options?.map((option) => option.value)).toEqual([
      "local",
      "s3",
    ]);
    expect(callFor(calls, M_SETUP).input.initialValue).toBe(true);
  });

  it("wybór modułu z wymaganiami dokłada wymagany moduł", async () => {
    const { answers } = ask({}, [
      { method: "multiselect", answer: ["needs-demo"] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({
      modules: ["demo", "needs-demo"],
      storage: null,
    });
  });

  it("bez uploads nie pyta o magazyn plików", async () => {
    const { answers, calls } = ask({}, [
      { method: "multiselect", answer: ["api-keys"] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: false },
    ]);
    await expect(answers).resolves.toMatchObject({
      storage: null,
      setup: false,
    });
    expect(messages(calls)).not.toContain(M_STORAGE);
  });

  it("odpowiedź nie na angielski zostawia tylko polski", async () => {
    const { answers } = ask({}, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: false },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ locales: ["pl"] });
  });

  it("wpisany tytuł jest przycięty, a wpisany e-mail zachowany", async () => {
    const { answers } = ask({}, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "  Sklep Acme  " },
      { method: "text", answer: "a@b.co" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({
      title: "Sklep Acme",
      adminEmail: "a@b.co",
    });
  });

  it("walidacja tytułu i e-maila zwraca komunikaty walidatorów", async () => {
    const { answers, calls } = ask({}, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await answers;
    const title = validatorOf(callFor(calls, M_TITLE));
    expect(title('A"B')).toBe(TITLE_MESSAGE);
    expect(title("Acme")).toBeUndefined();
    const email = validatorOf(callFor(calls, M_EMAIL));
    expect(email("")).toBeUndefined();
    expect(email("a@b.co")).toBeUndefined();
    expect(email("nope")).toBe(EMAIL_MESSAGE);
  });

  it("S3 z zewnętrznym endpointem pyta o klucz tekstem i o sekret hasłem", async () => {
    const { answers, calls } = ask({}, [
      { method: "multiselect", answer: ["uploads"] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      { method: "select", answer: "s3" },
      { method: "text", answer: "https://s3.example.com" },
      { method: "text", answer: "AK" },
      { method: "password", answer: "SK" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({
      storage: {
        provider: "s3",
        endpoint: "https://s3.example.com",
        accessKeyId: "AK",
        secretAccessKey: "SK",
        localMinio: false,
      },
    });
    expect(calls.map((call) => call.method)).toEqual([
      "multiselect",
      "confirm",
      "text",
      "text",
      "select",
      "text",
      "text",
      "password",
      "select",
      "confirm",
    ]);
    const endpoint = callFor(calls, M_ENDPOINT);
    expect(endpoint.input.defaultValue).toBe("http://localhost:9000");
    const endpointValidate = validatorOf(endpoint);
    expect(endpointValidate("ftp://x")).toEqual(expect.any(String));
    expect(endpointValidate("not a url")).toEqual(expect.any(String));
    expect(endpointValidate("https://s3.example.com")).toBeUndefined();
    expect(endpointValidate("http://localhost:9000")).toBeUndefined();
    for (const keyCall of [calls[6], calls[7]]) {
      if (!keyCall) throw new Error("missing key prompt");
      const validate = validatorOf(keyCall);
      expect(validate("AK/12+=")).toBeUndefined();
      expect(validate("a b")).toMatch(
        /: no spaces, quotes, backslashes, #, \$ or backticks$/,
      );
      expect(validate("a$b")).toMatch(
        /: no spaces, quotes, backslashes, #, \$ or backticks$/,
      );
      expect(validate("")).toMatch(/: required$/);
    }
  });

  it("S3 z endpointem lokalnego MinIO nie pyta o klucze", async () => {
    const { answers, calls } = ask({}, [
      { method: "multiselect", answer: ["uploads"] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      { method: "select", answer: "s3" },
      { method: "text", answer: TAKE_DEFAULT },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({
      storage: {
        provider: "s3",
        endpoint: "http://localhost:9000",
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
        localMinio: true,
      },
    });
    expect(calls.map((call) => call.method)).not.toContain("password");
    expect(messages(calls)).toEqual([
      M_MODULES,
      M_ENGLISH,
      M_TITLE,
      M_EMAIL,
      M_STORAGE,
      M_ENDPOINT,
      M_MAIL,
      M_SETUP,
    ]);
  });

  it("anulowanie w prompterze odrzuca CancelledError", async () => {
    const { answers } = ask({}, [
      { method: "multiselect", answer: new CancelledError("cancelled") },
    ]);
    await expect(answers).rejects.toBeInstanceOf(CancelledError);
  });

  it("anulowanie w środku pytań też odrzuca CancelledError", async () => {
    const { answers } = ask({}, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: new CancelledError("cancelled") },
    ]);
    await expect(answers).rejects.toBeInstanceOf(CancelledError);
  });
});

describe("collectAnswers: flagi pomijają swoje pytania", () => {
  it("--title pomija pytanie o nazwę", async () => {
    const { answers, calls } = ask({ title: "Sklep" }, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ title: "Sklep" });
    expect(messages(calls)).toEqual([
      M_MODULES,
      M_ENGLISH,
      M_EMAIL,
      M_MAIL,
      M_SETUP,
    ]);
  });

  it('--modules "" pomija wybór modułów i magazyn', async () => {
    const { answers, calls } = ask({ modules: [] }, [
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({
      modules: [],
      storage: null,
    });
    expect(messages(calls)).toEqual([
      M_ENGLISH,
      M_TITLE,
      M_EMAIL,
      M_MAIL,
      M_SETUP,
    ]);
  });

  it("--modules z wymaganiami dokłada je także bez --yes", async () => {
    const { answers } = ask({ modules: ["needs-demo"] }, [
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({
      modules: ["demo", "needs-demo"],
    });
  });

  it("--locales pl pomija pytanie o angielski", async () => {
    const { answers, calls } = ask({ locales: ["pl"] }, [
      { method: "multiselect", answer: [] },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ locales: ["pl"] });
    expect(messages(calls)).toEqual([
      M_MODULES,
      M_TITLE,
      M_EMAIL,
      M_MAIL,
      M_SETUP,
    ]);
  });

  it("--locales pl,en pomija pytanie o angielski", async () => {
    const { answers, calls } = ask({ locales: ["pl", "en"] }, [
      { method: "multiselect", answer: [] },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ locales: ["pl", "en"] });
    expect(messages(calls)).not.toContain(M_ENGLISH);
  });

  it("--admin-email pomija pytanie o e-mail", async () => {
    const { answers, calls } = ask({ adminEmail: "a@b.co" }, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ adminEmail: "a@b.co" });
    expect(messages(calls)).toEqual([
      M_MODULES,
      M_ENGLISH,
      M_TITLE,
      M_MAIL,
      M_SETUP,
    ]);
  });

  it("--storage local pomija wybór magazynu", async () => {
    const { answers, calls } = ask({ storage: "local" }, [
      { method: "multiselect", answer: ["uploads"] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({
      storage: { provider: "local" },
    });
    expect(messages(calls)).toEqual([
      M_MODULES,
      M_ENGLISH,
      M_TITLE,
      M_EMAIL,
      M_MAIL,
      M_SETUP,
    ]);
  });

  it("--storage s3 z --s3-endpoint pyta tylko o brakujące klucze", async () => {
    const { answers, calls } = ask(
      {
        modules: ["uploads"],
        storage: "s3",
        s3Endpoint: "https://s3.example.com",
      },
      [
        { method: "confirm", answer: true },
        { method: "text", answer: "Acme Shop" },
        { method: "text", answer: "" },
        { method: "text", answer: "AK" },
        { method: "password", answer: "SK" },
        MAIL_CONSOLE,
        { method: "confirm", answer: true },
      ],
    );
    await expect(answers).resolves.toMatchObject({
      storage: {
        provider: "s3",
        endpoint: "https://s3.example.com",
        accessKeyId: "AK",
        secretAccessKey: "SK",
        localMinio: false,
      },
    });
    expect(messages(calls)).not.toContain(M_STORAGE);
    expect(messages(calls)).not.toContain(M_ENDPOINT);
  });

  it.each([[{ install: false, docker: false }], [{ docker: false }]])(
    "%j daje setup false bez pytania o konfigurację",
    async (overrides) => {
      const { answers, calls } = ask(overrides, [
        { method: "multiselect", answer: [] },
        { method: "confirm", answer: true },
        { method: "text", answer: "Acme Shop" },
        { method: "text", answer: "" },
        MAIL_CONSOLE,
      ]);
      await expect(answers).resolves.toMatchObject({ setup: false });
      expect(messages(calls)).not.toContain(M_SETUP);
    },
  );

  it("--setup daje setup true bez pytania o konfigurację", async () => {
    const { answers, calls } = ask({ setup: true }, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
    ]);
    await expect(answers).resolves.toMatchObject({ setup: true });
    expect(messages(calls)).not.toContain(M_SETUP);
  });

  it("odpowiedź nie na konfigurację daje setup false", async () => {
    const { answers } = ask({}, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: false },
    ]);
    await expect(answers).resolves.toMatchObject({ setup: false });
  });

  it("wszystkie flagi razem zostawiają tylko pytanie o konfigurację", async () => {
    const { answers, calls } = ask(
      {
        modules: ["uploads"],
        locales: ["pl"],
        title: "Sklep",
        adminEmail: "a@b.co",
        storage: "local",
        mailProvider: "console",
      },
      [{ method: "confirm", answer: true }],
    );
    await expect(answers).resolves.toStrictEqual({
      modules: ["uploads"],
      locales: ["pl"],
      title: "Sklep",
      adminEmail: "a@b.co",
      storage: { provider: "local" },
      mail: { provider: "console" },
      setup: true,
    });
    expect(messages(calls)).toEqual([M_SETUP]);
  });
});

describe("collectAnswers: przycinanie i puste odpowiedzi", () => {
  it("wpisany e-mail ze spacjami jest przycięty, a walidator przyjmuje spacje wokół", async () => {
    const { answers, calls } = ask({}, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: " a@b.co " },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ adminEmail: "a@b.co" });
    const email = validatorOf(callFor(calls, M_EMAIL));
    expect(email("   ")).toBeUndefined();
    expect(email(" a@b.co ")).toBeUndefined();
  });

  it("e-mail ze samych spacji oznacza brak administratora", async () => {
    const { answers } = ask({}, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "   " },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ adminEmail: null });
  });

  const S3_PREFIX: ScriptedAnswer[] = [
    { method: "multiselect", answer: ["uploads"] },
    { method: "confirm", answer: true },
    { method: "text", answer: "Acme Shop" },
    { method: "text", answer: "" },
    { method: "select", answer: "s3" },
  ];

  it("walidator endpointu przyjmuje pusty napis i odrzuca doklejone ciągi", async () => {
    const { answers, calls } = ask({}, [
      ...S3_PREFIX,
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await answers;
    const endpoint = validatorOf(callFor(calls, M_ENDPOINT));
    expect(endpoint("")).toBeUndefined();
    expect(endpoint("   ")).toBeUndefined();
    expect(endpoint(" https://s3.example.com ")).toBeUndefined();
    for (const value of ["https://x y", "https://x\nA=1", "see https://x"]) {
      expect(endpoint(value)).toEqual(expect.any(String));
    }
  });

  it("wpisany endpoint ze spacjami jest przycięty, a klucz ma pustą wartość domyślną", async () => {
    const { answers, calls } = ask({}, [
      ...S3_PREFIX,
      { method: "text", answer: " https://s3.example.com " },
      { method: "text", answer: "AK" },
      { method: "password", answer: "SK" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({
      storage: {
        provider: "s3",
        endpoint: "https://s3.example.com",
        localMinio: false,
      },
    });
    expect(calls[6]?.method).toBe("text");
    expect(calls[6]?.input.defaultValue).toBe("");
  });

  it("endpoint ze samych spacji oznacza lokalne MinIO bez pytań o klucze", async () => {
    const { answers, calls } = ask({}, [
      ...S3_PREFIX,
      { method: "text", answer: "   " },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({
      storage: {
        provider: "s3",
        endpoint: "http://localhost:9000",
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
        localMinio: true,
      },
    });
    expect(calls.map((call) => call.method)).not.toContain("password");
  });

  it("kit bez modułów nie pyta o moduły", async () => {
    const { prompter, calls } = scriptedPrompter([
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      MAIL_CONSOLE,
      { method: "confirm", answer: true },
    ]);
    await expect(
      collectAnswers({
        args: args({}),
        slug: "acme-shop",
        modules: [],
        prompter,
      }),
    ).resolves.toMatchObject({ modules: [], storage: null });
    expect(messages(calls)).not.toContain(M_MODULES);
  });
});

const QUIET: Partial<CreateCliArgs> = {
  modules: [],
  locales: ["pl"],
  title: "Acme",
  adminEmail: "a@b.co",
  setup: true,
};

function mailSelect(calls: PromptCall[]): PromptCall {
  const call = calls.find(
    (candidate) =>
      candidate.method === "select" &&
      candidate.input.options?.some((option) => option.value === "resend"),
  );
  if (!call) throw new Error("no mail provider prompt");
  return call;
}

function textWithDefault(
  calls: PromptCall[],
  defaultValue: string,
): PromptCall {
  const call = calls.find(
    (candidate) =>
      candidate.method === "text" &&
      candidate.input.defaultValue === defaultValue,
  );
  if (!call) throw new Error(`no text prompt with default "${defaultValue}"`);
  return call;
}

function smtpUserCall(calls: PromptCall[]): PromptCall {
  const call = calls.find(
    (candidate) =>
      candidate.method === "text" &&
      candidate.input.message.startsWith("SMTP user"),
  );
  if (!call) throw new Error("no SMTP user prompt");
  expect(call.input.defaultValue).toBe("");
  return call;
}

async function mailOf(answers: Promise<{ mail: unknown }>): Promise<unknown> {
  return (await answers).mail;
}

describe("collectAnswers: mail with --yes", () => {
  it("the local mailpit host is 127.0.0.1", () => {
    expect(LOCAL_MAILPIT_HOST).toBe("127.0.0.1");
  });

  it("without mail flags takes local mailpit and asks nothing", async () => {
    const { answers, calls } = ask({ yes: true }, []);
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: true,
    });
    expect(calls).toEqual([]);
  });

  it("does not call the prompter even without a terminal", async () => {
    await expect(
      collectAnswers({
        args: args({ yes: true }),
        slug: "acme-shop",
        modules: MODULES,
        prompter: silentPrompter,
      }),
    ).resolves.toMatchObject({
      mail: { provider: "smtp", localMailpit: true },
    });
  });

  it("--mail-provider console gives the console answer", async () => {
    const { answers, calls } = ask({ yes: true, mailProvider: "console" }, []);
    expect(await mailOf(answers)).toStrictEqual({ provider: "console" });
    expect(calls).toEqual([]);
  });

  it("--mail-provider resend with a key gives the resend answer", async () => {
    const { answers, calls } = ask(
      { yes: true, mailProvider: "resend", resendApiKey: "re_x" },
      [],
    );
    expect(await mailOf(answers)).toStrictEqual({
      provider: "resend",
      apiKey: "re_x",
    });
    expect(calls).toEqual([]);
  });

  it("--mail-provider smtp with a relay host defaults the port to 587 and has no credentials", async () => {
    const { answers, calls } = ask(
      { yes: true, mailProvider: "smtp", smtpHost: "relay.internal" },
      [],
    );
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: false,
      host: "relay.internal",
      port: 587,
      user: null,
      pass: null,
    });
    expect(calls).toEqual([]);
  });

  it("--mail-provider smtp with every relay flag keeps them all", async () => {
    const { answers, calls } = ask(
      {
        yes: true,
        mailProvider: "smtp",
        smtpHost: "relay.internal",
        smtpPort: 2525,
        smtpUser: "app",
        smtpPass: "pw",
      },
      [],
    );
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: false,
      host: "relay.internal",
      port: 2525,
      user: "app",
      pass: "pw",
    });
    expect(calls).toEqual([]);
  });

  it("--mail-provider smtp without a host means local mailpit", async () => {
    const { answers, calls } = ask({ yes: true, mailProvider: "smtp" }, []);
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: true,
    });
    expect(calls).toEqual([]);
  });

  it("--smtp-host 127.0.0.1 means local mailpit", async () => {
    const { answers } = ask(
      { yes: true, mailProvider: "smtp", smtpHost: "127.0.0.1" },
      [],
    );
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: true,
    });
  });
});

describe("collectAnswers: mail asked interactively", () => {
  it("offers smtp, resend and console with smtp as the default", async () => {
    const { answers, calls } = ask(QUIET, [MAIL_CONSOLE]);
    await answers;
    const select = mailSelect(calls);
    expect(select.input.options?.map((option) => option.value)).toEqual([
      "smtp",
      "resend",
      "console",
    ]);
    expect(select.input.initialValue).toBe("smtp");
  });

  it("smtp with the default host is local mailpit and asks no port, user or password", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: TAKE_DEFAULT },
    ]);
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: true,
    });
    expect(calls.map((call) => call.method)).toEqual(["select", "text"]);
    expect(calls[1]?.input.defaultValue).toBe("127.0.0.1");
  });

  it("smtp with a typed 127.0.0.1 host is local mailpit", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "127.0.0.1" },
    ]);
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: true,
    });
    expect(calls).toHaveLength(2);
  });

  it("a relay host asks the port with default 587 and the user with an empty default", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: TAKE_DEFAULT },
      { method: "text", answer: TAKE_DEFAULT },
    ]);
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: false,
      host: "relay.internal",
      port: 587,
      user: null,
      pass: null,
    });
    expect(calls.map((call) => call.method)).toEqual([
      "select",
      "text",
      "text",
      "text",
    ]);
    expect(calls[2]?.input.defaultValue).toBe("587");
    expect(calls[3]?.input.defaultValue).toBe("");
  });

  it("an empty user asks no password", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: "2525" },
      { method: "text", answer: "" },
    ]);
    expect(await mailOf(answers)).toMatchObject({
      port: 2525,
      user: null,
      pass: null,
    });
    expect(calls.map((call) => call.method)).not.toContain("password");
  });

  it("a user asks the password and keeps both", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: "587" },
      { method: "text", answer: "app" },
      { method: "password", answer: "pw" },
    ]);
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: false,
      host: "relay.internal",
      port: 587,
      user: "app",
      pass: "pw",
    });
    expect(calls.map((call) => call.method)).toEqual([
      "select",
      "text",
      "text",
      "text",
      "password",
    ]);
  });

  it("the port prompt rejects values outside 1-65535", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: "587" },
      { method: "text", answer: "" },
    ]);
    await answers;
    const port = validatorOf(textWithDefault(calls, "587"));
    for (const value of ["70000", "0", "65536", "abc", "25.5"]) {
      expect(port(value)).toEqual(expect.any(String));
    }
    for (const value of ["1", "2525", "65535", "", " 2525 "]) {
      expect(port(value)).toBeUndefined();
    }
    expect(port("70000")).toBe("SMTP port: expected a port 1-65535");
  });

  it("a port typed with spaces is trimmed", async () => {
    const { answers } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: " 2525 " },
      { method: "text", answer: "" },
    ]);
    expect(await mailOf(answers)).toMatchObject({ port: 2525 });
  });

  it("the host and user prompts accept empty input and reject values unsafe in .env", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: "587" },
      { method: "text", answer: "app" },
      { method: "password", answer: "pw" },
    ]);
    await answers;
    const host = validatorOf(textWithDefault(calls, "127.0.0.1"));
    const user = validatorOf(smtpUserCall(calls));
    for (const validate of [host, user]) {
      expect(validate("")).toBeUndefined();
      expect(validate("   ")).toBeUndefined();
      expect(validate("relay x")).toMatch(
        /: no spaces, quotes, backslashes, #, \$ or backticks$/,
      );
      expect(validate("a\nB=1")).toMatch(
        /: no spaces, quotes, backslashes, #, \$ or backticks$/,
      );
    }
  });

  it("the password prompt requires a value safe in .env", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: "587" },
      { method: "text", answer: "app" },
      { method: "password", answer: "pw" },
    ]);
    await answers;
    const password = validatorOf(callFor(calls, "SMTP password"));
    expect(password("")).toMatch(/: required$/);
    expect(password("p w")).toMatch(
      /: no spaces, quotes, backslashes, #, \$ or backticks$/,
    );
    expect(password("pw")).toBeUndefined();
  });

  it("the host and user prompts accept a safe value surrounded by spaces", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: "587" },
      { method: "text", answer: "app" },
      { method: "password", answer: "pw" },
    ]);
    await answers;
    const host = validatorOf(textWithDefault(calls, "127.0.0.1"));
    const user = validatorOf(smtpUserCall(calls));
    expect(host("  relay.internal  ")).toBeUndefined();
    expect(user("  app  ")).toBeUndefined();
  });

  it("the port prompt accepts only spaces and the answer falls back to 587", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: "   " },
      { method: "text", answer: "" },
    ]);
    expect(await mailOf(answers)).toMatchObject({ port: 587 });
    const port = validatorOf(textWithDefault(calls, "587"));
    expect(port("   ")).toBeUndefined();
  });

  it("a host typed with spaces is trimmed", async () => {
    const { answers } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "  relay.internal  " },
      { method: "text", answer: "587" },
      { method: "text", answer: "" },
    ]);
    expect(await mailOf(answers)).toMatchObject({
      localMailpit: false,
      host: "relay.internal",
    });
  });

  it("127.0.0.1 typed with spaces is local mailpit and asks nothing more", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: " 127.0.0.1 " },
    ]);
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: true,
    });
    expect(calls).toHaveLength(2);
  });

  it("a user typed with spaces is trimmed and the password is asked", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: "587" },
      { method: "text", answer: "  app  " },
      { method: "password", answer: "pw" },
    ]);
    expect(await mailOf(answers)).toMatchObject({ user: "app", pass: "pw" });
    expect(calls.map((call) => call.method)).toContain("password");
  });

  it("a user of only spaces means no authentication and no password question", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "smtp" },
      { method: "text", answer: "relay.internal" },
      { method: "text", answer: "587" },
      { method: "text", answer: "   " },
    ]);
    expect(await mailOf(answers)).toMatchObject({ user: null, pass: null });
    expect(calls.map((call) => call.method)).not.toContain("password");
  });

  it("resend asks the key as a password and keeps it", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "resend" },
      { method: "password", answer: "re_x" },
    ]);
    expect(await mailOf(answers)).toStrictEqual({
      provider: "resend",
      apiKey: "re_x",
    });
    expect(calls.map((call) => call.method)).toEqual(["select", "password"]);
  });

  it("the resend key prompt rejects values unsafe in .env", async () => {
    const { answers, calls } = ask(QUIET, [
      { method: "select", answer: "resend" },
      { method: "password", answer: "re_x" },
    ]);
    await answers;
    const key = calls[1];
    if (!key) throw new Error("missing key prompt");
    const validate = validatorOf(key);
    expect(validate("re_x")).toBeUndefined();
    expect(validate("")).toMatch(/: required$/);
    expect(validate("re x")).toMatch(
      /: no spaces, quotes, backslashes, #, \$ or backticks$/,
    );
    expect(validate("re\nMAIL_PROVIDER=x")).toMatch(
      /: no spaces, quotes, backslashes, #, \$ or backticks$/,
    );
    expect(validate("re$x")).toMatch(
      /: no spaces, quotes, backslashes, #, \$ or backticks$/,
    );
  });

  it("console asks nothing more", async () => {
    const { answers, calls } = ask(QUIET, [MAIL_CONSOLE]);
    expect(await mailOf(answers)).toStrictEqual({ provider: "console" });
    expect(calls.map((call) => call.method)).toEqual(["select"]);
  });

  it("mail is asked even when Docker is skipped", async () => {
    const { answers, calls } = ask({ ...QUIET, setup: false, docker: false }, [
      MAIL_CONSOLE,
    ]);
    expect(await mailOf(answers)).toStrictEqual({ provider: "console" });
    expect(calls).toHaveLength(1);
  });
});

describe("collectAnswers: mail flags skip their questions", () => {
  it("--mail-provider console asks no mail question", async () => {
    const { answers, calls } = ask({ ...QUIET, mailProvider: "console" }, []);
    expect(await mailOf(answers)).toStrictEqual({ provider: "console" });
    expect(calls).toEqual([]);
  });

  it("--mail-provider smtp asks the host but not the provider", async () => {
    const { answers, calls } = ask({ ...QUIET, mailProvider: "smtp" }, [
      { method: "text", answer: TAKE_DEFAULT },
    ]);
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: true,
    });
    expect(calls.map((call) => call.method)).toEqual(["text"]);
  });

  it("--smtp-host and --smtp-port leave only the user question", async () => {
    const { answers, calls } = ask(
      {
        ...QUIET,
        mailProvider: "smtp",
        smtpHost: "relay.internal",
        smtpPort: 2525,
      },
      [{ method: "text", answer: "" }],
    );
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: false,
      host: "relay.internal",
      port: 2525,
      user: null,
      pass: null,
    });
    expect(calls.map((call) => call.method)).toEqual(["text"]);
    expect(calls[0]?.input.defaultValue).toBe("");
  });

  it("--smtp-user without --smtp-pass asks only the port and the password", async () => {
    const { answers, calls } = ask(
      {
        ...QUIET,
        mailProvider: "smtp",
        smtpHost: "relay.internal",
        smtpUser: "app",
      },
      [
        { method: "text", answer: TAKE_DEFAULT },
        { method: "password", answer: "pw" },
      ],
    );
    expect(await mailOf(answers)).toStrictEqual({
      provider: "smtp",
      localMailpit: false,
      host: "relay.internal",
      port: 587,
      user: "app",
      pass: "pw",
    });
    expect(calls.map((call) => call.method)).toEqual(["text", "password"]);
  });

  it("--mail-provider resend without a key asks only the key", async () => {
    const { answers, calls } = ask({ ...QUIET, mailProvider: "resend" }, [
      { method: "password", answer: "re_y" },
    ]);
    expect(await mailOf(answers)).toStrictEqual({
      provider: "resend",
      apiKey: "re_y",
    });
    expect(calls.map((call) => call.method)).toEqual(["password"]);
  });

  it("--mail-provider resend with a key asks nothing", async () => {
    const { answers, calls } = ask(
      { ...QUIET, mailProvider: "resend", resendApiKey: "re_x" },
      [],
    );
    expect(await mailOf(answers)).toStrictEqual({
      provider: "resend",
      apiKey: "re_x",
    });
    expect(calls).toEqual([]);
  });
});
