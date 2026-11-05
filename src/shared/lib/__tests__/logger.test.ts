// @vitest-environment node
import { fc, test } from "@fast-check/vitest";
import { logs } from "@opentelemetry/api-logs";
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { logger } from "@/shared/lib/logger";

const exporter = new InMemoryLogRecordExporter();
const provider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(exporter)],
});

async function logErrorAttributes(err: unknown) {
  exporter.reset();
  logger.error("Operacja nie powiodła się", { err });
  await provider.forceFlush();
  const records = exporter.getFinishedLogRecords();
  expect(records).toHaveLength(1);
  return records[0].attributes;
}

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  logs.setGlobalLoggerProvider(provider);
});

afterAll(async () => {
  logs.disable();
  await provider.shutdown();
  vi.restoreAllMocks();
});

describe("logger.error — atrybuty err.* wpisu OpenTelemetry", () => {
  it("klasa zminifikowana do d z name ustawionym w konstruktorze → err.type to name, err.message to komunikat", async () => {
    class d extends Error {
      constructor() {
        super("Użytkownik nie należy do aktywnej organizacji");
        this.name = "NoOrganizationError";
      }
    }

    const attributes = await logErrorAttributes(new d());

    expect(attributes["err.type"]).toBe("NoOrganizationError");
    expect(attributes["err.message"]).toBe(
      "Użytkownik nie należy do aktywnej organizacji",
    );
  });

  it('klasa bez własnego name (dziedziczy "Error") → err.type to nazwa klasy', async () => {
    class DomainError extends Error {}

    const attributes = await logErrorAttributes(
      new DomainError("Nie znaleziono zasobu"),
    );

    expect(attributes["err.type"]).toBe("DomainError");
  });

  it('zwykły Error → err.type "Error"', async () => {
    const attributes = await logErrorAttributes(new Error("boom"));

    expect(attributes["err.type"]).toBe("Error");
  });

  it('TypeError → err.type "TypeError"', async () => {
    const attributes = await logErrorAttributes(new TypeError("bad input"));

    expect(attributes["err.type"]).toBe("TypeError");
  });

  it("name ustawione na pusty napis → err.type to nazwa klasy", async () => {
    class EmptyNameError extends Error {
      constructor() {
        super("Błąd z pustą nazwą");
        this.name = "";
      }
    }

    const attributes = await logErrorAttributes(new EmptyNameError());

    expect(attributes["err.type"]).toBe("EmptyNameError");
  });

  it('klasa anonimowa bez własnego name → err.type "Error", nie pusty napis', async () => {
    const AnonymousError = (() => class extends Error {})();
    expect(AnonymousError.name).toBe("");

    const attributes = await logErrorAttributes(
      new AnonymousError("Błąd klasy anonimowej"),
    );

    expect(attributes["err.type"]).toBe("Error");
  });

  it("err.stacktrace to stack przekazanego błędu", async () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at handler (src/app/api/route.ts:12:5)";

    const attributes = await logErrorAttributes(error);

    expect(attributes["err.stacktrace"]).toBe(
      "Error: boom\n    at handler (src/app/api/route.ts:12:5)",
    );
  });

  test.prop([
    fc.stringMatching(/^[A-Za-z]\w{0,40}$/).filter((name) => name !== "Error"),
  ])(
    'dowolne niepuste name różne od "Error" → err.type to name, nie nazwa klasy',
    async (name) => {
      const error = new Error("Operacja odrzucona");
      error.name = name;

      const attributes = await logErrorAttributes(error);

      expect(attributes["err.type"]).toBe(name);
    },
  );

  test.prop([fc.stringMatching(/^[A-Za-z]\w{0,40}$/)])(
    "klasa o dowolnej nazwie bez własnego name → err.type to nazwa klasy",
    async (className) => {
      const NamedError = { [className]: class extends Error {} }[className];

      const attributes = await logErrorAttributes(
        new NamedError("Operacja odrzucona"),
      );

      expect(attributes["err.type"]).toBe(className);
    },
  );
});
