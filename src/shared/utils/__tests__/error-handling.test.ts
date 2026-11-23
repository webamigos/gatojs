// @vitest-environment node
import { logs } from "@opentelemetry/api-logs";
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { mockCurrentLocale } = vi.hoisted(() => ({
  mockCurrentLocale: vi.fn(),
}));

vi.mock("@/i18n/server-locale", () => ({
  currentLocale: () => mockCurrentLocale(),
}));

import { DomainError, handleCommandError } from "@/shared/utils/error-handling";

const exporter = new InMemoryLogRecordExporter();
const provider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(exporter)],
});

class KeyLimitError extends DomainError {}

async function handleKeyCreationError(error: unknown) {
  exporter.reset();
  const result = await handleCommandError(
    error,
    "Nie udało się utworzyć klucza API",
  );
  await provider.forceFlush();
  return { result, records: exporter.getFinishedLogRecords() };
}

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  logs.setGlobalLoggerProvider(provider);
});

beforeEach(() => {
  mockCurrentLocale.mockResolvedValue("pl");
});

afterAll(async () => {
  logs.disable();
  await provider.shutdown();
  vi.restoreAllMocks();
});

describe("DomainError", () => {
  it('ma name "DomainError", komunikat z konstruktora i jest instancją Error', () => {
    const error = new DomainError("Osiągnięto limit 10 aktywnych kluczy");

    expect(error.name).toBe("DomainError");
    expect(error.message).toBe("Osiągnięto limit 10 aktywnych kluczy");
    expect(error).toBeInstanceOf(Error);
  });

  it('podklasa bez własnego name ma name "DomainError", nie nazwę podklasy', () => {
    const error = new KeyLimitError("Osiągnięto limit 10 aktywnych kluczy");

    expect(error.name).toBe("DomainError");
  });
});

describe("handleCommandError — błąd domenowy w eksporcie OpenTelemetry", () => {
  it('DomainError → zwraca jego komunikat i oddaje jeden wpis WARN z domyślnym komunikatem i err.type "DomainError"', async () => {
    const { result, records } = await handleKeyCreationError(
      new DomainError("Osiągnięto limit 10 aktywnych kluczy"),
    );

    expect(result).toEqual({
      success: false,
      error: "Osiągnięto limit 10 aktywnych kluczy",
    });
    expect(records).toHaveLength(1);
    expect(records[0].severityText).toBe("WARN");
    expect(records[0].body).toBe("Nie udało się utworzyć klucza API");
    expect(records[0].attributes["err.type"]).toBe("DomainError");
  });

  it('podklasa DomainError bez własnego name → ten sam wpis WARN z err.type "DomainError", nie nazwą podklasy', async () => {
    const { result, records } = await handleKeyCreationError(
      new KeyLimitError("Osiągnięto limit 10 aktywnych kluczy"),
    );

    expect(result).toEqual({
      success: false,
      error: "Osiągnięto limit 10 aktywnych kluczy",
    });
    expect(records).toHaveLength(1);
    expect(records[0].severityText).toBe("WARN");
    expect(records[0].body).toBe("Nie udało się utworzyć klucza API");
    expect(records[0].attributes["err.type"]).toBe("DomainError");
  });
});

describe("DomainError z tłumaczeniem", () => {
  it("zachowuje komunikat z konstruktora i jest błędem domenowym", () => {
    const error = new DomainError("x", { key: "noPermission" });

    expect(error.message).toBe("x");
    expect(error.name).toBe("DomainError");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("handleCommandError — tłumaczenie w bieżącym języku", () => {
  it("DomainError z kluczem w en → tekst z errors po angielsku zamiast message", async () => {
    mockCurrentLocale.mockResolvedValue("en");

    const result = await handleCommandError(
      new DomainError("x", { key: "noPermission" }),
      "fallback",
    );

    expect(result).toEqual({
      success: false,
      error: "You don't have permission to do this",
    });
  });

  it("DomainError z kluczem w pl → tekst z errors po polsku", async () => {
    mockCurrentLocale.mockResolvedValue("pl");

    const result = await handleCommandError(
      new DomainError("x", { key: "noPermission" }),
      "fallback",
    );

    expect(result).toEqual({ success: false, error: "Brak uprawnień" });
  });

  it("DomainError z przestrzenią nazw modułu w en → tekst modułu", async () => {
    mockCurrentLocale.mockResolvedValue("en");

    const result = await handleCommandError(
      new DomainError("x", {
        key: "errors.keyNotFound",
        namespace: "api-keys",
      }),
      "fallback",
    );

    expect(result).toEqual({ success: false, error: "Key not found" });
  });

  it("DomainError z przestrzenią nazw modułu w pl → tekst modułu", async () => {
    mockCurrentLocale.mockResolvedValue("pl");

    const result = await handleCommandError(
      new DomainError("x", {
        key: "errors.noDeletePermission",
        namespace: "uploads",
      }),
      "fallback",
    );

    expect(result).toEqual({
      success: false,
      error: "Brak uprawnień do usunięcia pliku",
    });
  });

  it("DomainError z wartościami → wstawia je do tłumaczenia", async () => {
    mockCurrentLocale.mockResolvedValue("en");

    const result = await handleCommandError(
      new DomainError("x", {
        key: "defaultOrganizationName",
        namespace: "common",
        values: { name: "Ann" },
      }),
      "fallback",
    );

    expect(result).toEqual({ success: false, error: "Ann's organization" });
  });

  it("DomainError bez tłumaczenia w en → jego message bez zmian", async () => {
    mockCurrentLocale.mockResolvedValue("en");

    const result = await handleCommandError(
      new DomainError("plain"),
      "fallback",
    );

    expect(result).toEqual({ success: false, error: "plain" });
  });

  it("błąd spoza domeny w en → domyślny komunikat", async () => {
    mockCurrentLocale.mockResolvedValue("en");

    const result = await handleCommandError(new Error("db down"), "fallback");

    expect(result).toEqual({ success: false, error: "fallback" });
  });

  it("redirect Next.js jest rzucany dalej", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/sign-in;307;",
    });

    await expect(handleCommandError(redirect, "fallback")).rejects.toBe(
      redirect,
    );
  });

  it("obiekt z digest NEXT_REDIRECT, który nie jest Error, jest rzucany dalej w en", async () => {
    mockCurrentLocale.mockResolvedValue("en");
    const redirect = { digest: "NEXT_REDIRECT;push;/en/sign-in;303;" };

    await expect(handleCommandError(redirect, "fallback")).rejects.toBe(
      redirect,
    );
  });
});
