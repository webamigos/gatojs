// @vitest-environment node
import { logs } from "@opentelemetry/api-logs";
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DomainError, handleCommandError } from "@/shared/utils/error-handling";

const exporter = new InMemoryLogRecordExporter();
const provider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(exporter)],
});

class KeyLimitError extends DomainError {}

async function handleKeyCreationError(error: unknown) {
  exporter.reset();
  const result = handleCommandError(error, "Nie udało się utworzyć klucza API");
  await provider.forceFlush();
  return { result, records: exporter.getFinishedLogRecords() };
}

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  logs.setGlobalLoggerProvider(provider);
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
