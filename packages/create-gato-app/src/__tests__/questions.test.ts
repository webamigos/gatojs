import { describe, expect, it } from "vitest";
import type { CreateCliArgs } from "../args.js";
import type { KitModule } from "../kit-modules.js";
import {
  CancelledError,
  collectAnswers,
  displayName,
  LOCAL_MINIO_ENDPOINT,
  LOCAL_MINIO_KEY,
} from "../questions.js";
import { scriptedPrompter, silentPrompter, type PromptCall, type ScriptedAnswer } from "./fake-prompter.js";

const M_MODULES = "Modules (space to toggle, enter to confirm)";
const M_ENGLISH = "Add English? Polish is always included.";
const M_TITLE = "Display name";
const M_EMAIL = "First admin's email (empty to skip)";
const M_STORAGE = "File storage for uploads";
const M_ENDPOINT = "S3 endpoint (http://localhost:9000 = local MinIO started with Docker)";
const M_SETUP = "Start the database with Docker, run migrations and create the admin now?";

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
};

function args(overrides: Partial<CreateCliArgs>): CreateCliArgs {
  return { ...BASE, ...overrides };
}

function ask(overrides: Partial<CreateCliArgs>, script: ScriptedAnswer[]) {
  const { prompter, calls } = scriptedPrompter(script);
  return {
    calls,
    answers: collectAnswers({ args: args(overrides), slug: "acme-shop", modules: MODULES, prompter }),
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
  if (!validate) throw new Error(`prompt "${call.input.message}" has no validate`);
  return validate;
}

const TAKE_DEFAULT = (input: { defaultValue?: string }) => input.defaultValue;

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
      setup: true,
    });
    expect(calls).toEqual([]);
  });

  it("z uploads przyjmuje lokalny magazyn plików", async () => {
    const { answers } = ask({ yes: true, modules: ["uploads"] }, []);
    await expect(answers).resolves.toMatchObject({ modules: ["uploads"], storage: { provider: "local" } });
  });

  it("dokłada moduły wymagane przez wybrane", async () => {
    const { answers } = ask({ yes: true, modules: ["needs-demo"] }, []);
    await expect(answers).resolves.toMatchObject({ modules: ["demo", "needs-demo"] });
  });

  it("nieznany moduł z flagi odrzuca z listą dostępnych", async () => {
    const { answers } = ask({ yes: true, modules: ["nope"] }, []);
    await expect(answers).rejects.toThrow('Unknown module "nope". Available: api-keys, demo, needs-demo, uploads.');
  });

  it("--storage s3 bez endpointu oznacza lokalne MinIO z kluczami minioadmin", async () => {
    const { answers } = ask({ yes: true, modules: ["uploads"], storage: "s3" }, []);
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
    const { answers } = ask({ yes: true, modules: ["api-keys"], storage: "s3" }, []);
    await expect(answers).resolves.toMatchObject({ modules: ["api-keys"], storage: null });
  });

  it("flagi tytułu, języków i e-maila mają pierwszeństwo przed wartościami domyślnymi", async () => {
    const { answers } = ask({ yes: true, title: "Sklep", locales: ["pl"], adminEmail: "a@b.co" }, []);
    await expect(answers).resolves.toMatchObject({ title: "Sklep", locales: ["pl"], adminEmail: "a@b.co" });
  });

  it.each([
    [{ install: false, docker: false }],
    [{ docker: false }],
  ])("%j wyłącza konfigurację środowiska", async (overrides) => {
    const { answers, calls } = ask({ yes: true, ...overrides }, []);
    await expect(answers).resolves.toMatchObject({ setup: false });
    expect(calls).toEqual([]);
  });

  it("nie woła promptera nawet bez terminala", async () => {
    await expect(
      collectAnswers({ args: args({ yes: true, modules: ["uploads"] }), slug: "acme-shop", modules: MODULES, prompter: silentPrompter }),
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
    { method: "confirm", answer: true },
  ];

  it("pyta po kolei o moduły, angielski, nazwę, e-mail, magazyn i konfigurację", async () => {
    const { answers, calls } = ask({}, FULL_SCRIPT);
    await expect(answers).resolves.toStrictEqual({
      modules: ["uploads"],
      locales: ["pl", "en"],
      title: "Acme Shop",
      adminEmail: null,
      storage: { provider: "local" },
      setup: true,
    });
    expect(calls.map((call) => call.method)).toEqual([
      "multiselect",
      "confirm",
      "text",
      "text",
      "select",
      "confirm",
    ]);
    expect(messages(calls)).toEqual([M_MODULES, M_ENGLISH, M_TITLE, M_EMAIL, M_STORAGE, M_SETUP]);
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
    expect(storage.input.options?.map((option) => option.value)).toEqual(["local", "s3"]);
    expect(callFor(calls, M_SETUP).input.initialValue).toBe(true);
  });

  it("wybór modułu z wymaganiami dokłada wymagany moduł", async () => {
    const { answers } = ask({}, [
      { method: "multiselect", answer: ["needs-demo"] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ modules: ["demo", "needs-demo"], storage: null });
  });

  it("bez uploads nie pyta o magazyn plików", async () => {
    const { answers, calls } = ask({}, [
      { method: "multiselect", answer: ["api-keys"] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      { method: "confirm", answer: false },
    ]);
    await expect(answers).resolves.toMatchObject({ storage: null, setup: false });
    expect(messages(calls)).not.toContain(M_STORAGE);
  });

  it("odpowiedź nie na angielski zostawia tylko polski", async () => {
    const { answers } = ask({}, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: false },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
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
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ title: "Sklep Acme", adminEmail: "a@b.co" });
  });

  it("walidacja tytułu i e-maila zwraca komunikaty walidatorów", async () => {
    const { answers, calls } = ask({}, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme" },
      { method: "text", answer: "" },
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
      expect(validate("a b")).toMatch(/: no spaces, quotes, backslashes, #, \$ or backticks$/);
      expect(validate("a$b")).toMatch(/: no spaces, quotes, backslashes, #, \$ or backticks$/);
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
    expect(messages(calls)).toEqual([M_MODULES, M_ENGLISH, M_TITLE, M_EMAIL, M_STORAGE, M_ENDPOINT, M_SETUP]);
  });

  it("anulowanie w prompterze odrzuca CancelledError", async () => {
    const { answers } = ask({}, [{ method: "multiselect", answer: new CancelledError("cancelled") }]);
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
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ title: "Sklep" });
    expect(messages(calls)).toEqual([M_MODULES, M_ENGLISH, M_EMAIL, M_SETUP]);
  });

  it('--modules "" pomija wybór modułów i magazyn', async () => {
    const { answers, calls } = ask({ modules: [] }, [
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ modules: [], storage: null });
    expect(messages(calls)).toEqual([M_ENGLISH, M_TITLE, M_EMAIL, M_SETUP]);
  });

  it("--modules z wymaganiami dokłada je także bez --yes", async () => {
    const { answers } = ask({ modules: ["needs-demo"] }, [
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ modules: ["demo", "needs-demo"] });
  });

  it("--locales pl pomija pytanie o angielski", async () => {
    const { answers, calls } = ask({ locales: ["pl"] }, [
      { method: "multiselect", answer: [] },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ locales: ["pl"] });
    expect(messages(calls)).toEqual([M_MODULES, M_TITLE, M_EMAIL, M_SETUP]);
  });

  it("--locales pl,en pomija pytanie o angielski", async () => {
    const { answers, calls } = ask({ locales: ["pl", "en"] }, [
      { method: "multiselect", answer: [] },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
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
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ adminEmail: "a@b.co" });
    expect(messages(calls)).toEqual([M_MODULES, M_ENGLISH, M_TITLE, M_SETUP]);
  });

  it("--storage local pomija wybór magazynu", async () => {
    const { answers, calls } = ask({ storage: "local" }, [
      { method: "multiselect", answer: ["uploads"] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
      { method: "confirm", answer: true },
    ]);
    await expect(answers).resolves.toMatchObject({ storage: { provider: "local" } });
    expect(messages(calls)).toEqual([M_MODULES, M_ENGLISH, M_TITLE, M_EMAIL, M_SETUP]);
  });

  it("--storage s3 z --s3-endpoint pyta tylko o brakujące klucze", async () => {
    const { answers, calls } = ask(
      { modules: ["uploads"], storage: "s3", s3Endpoint: "https://s3.example.com" },
      [
        { method: "confirm", answer: true },
        { method: "text", answer: "Acme Shop" },
        { method: "text", answer: "" },
        { method: "text", answer: "AK" },
        { method: "password", answer: "SK" },
        { method: "confirm", answer: true },
      ],
    );
    await expect(answers).resolves.toMatchObject({
      storage: { provider: "s3", endpoint: "https://s3.example.com", accessKeyId: "AK", secretAccessKey: "SK", localMinio: false },
    });
    expect(messages(calls)).not.toContain(M_STORAGE);
    expect(messages(calls)).not.toContain(M_ENDPOINT);
  });

  it.each([
    [{ install: false, docker: false }],
    [{ docker: false }],
  ])("%j daje setup false bez pytania o konfigurację", async (overrides) => {
    const { answers, calls } = ask(overrides, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
    ]);
    await expect(answers).resolves.toMatchObject({ setup: false });
    expect(messages(calls)).not.toContain(M_SETUP);
  });

  it("--setup daje setup true bez pytania o konfigurację", async () => {
    const { answers, calls } = ask({ setup: true }, [
      { method: "multiselect", answer: [] },
      { method: "confirm", answer: true },
      { method: "text", answer: "Acme Shop" },
      { method: "text", answer: "" },
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
      { method: "confirm", answer: false },
    ]);
    await expect(answers).resolves.toMatchObject({ setup: false });
  });

  it("wszystkie flagi razem zostawiają tylko pytanie o konfigurację", async () => {
    const { answers, calls } = ask(
      { modules: ["uploads"], locales: ["pl"], title: "Sklep", adminEmail: "a@b.co", storage: "local" },
      [{ method: "confirm", answer: true }],
    );
    await expect(answers).resolves.toStrictEqual({
      modules: ["uploads"],
      locales: ["pl"],
      title: "Sklep",
      adminEmail: "a@b.co",
      storage: { provider: "local" },
      setup: true,
    });
    expect(messages(calls)).toEqual([M_SETUP]);
  });
});
