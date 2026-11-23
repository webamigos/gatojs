import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createLogger } from "../index";

const exporter = new InMemoryLogRecordExporter();
const provider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(exporter)],
});

function spyOnConsole() {
  return {
    log: vi.spyOn(console, "log").mockImplementation(() => undefined),
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

async function finishedRecords() {
  await provider.forceFlush();
  return exporter.getFinishedLogRecords();
}

function stubDevelopmentWithoutEndpoint() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", undefined);
}

beforeAll(() => {
  logs.setGlobalLoggerProvider(provider);
});

afterAll(async () => {
  logs.disable();
  await provider.shutdown();
});

beforeEach(() => {
  exporter.reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createLogger: OpenTelemetry log records", () => {
  beforeEach(() => {
    spyOnConsole();
    stubDevelopmentWithoutEndpoint();
  });

  it("debug → record with severity DEBUG, the message as body and normalized attributes", async () => {
    createLogger("billing").debug("Cache warmed", { entries: 3 });

    const records = await finishedRecords();
    expect(records).toHaveLength(1);
    expect(records[0].severityNumber).toBe(SeverityNumber.DEBUG);
    expect(records[0].severityText).toBe("DEBUG");
    expect(records[0].body).toBe("Cache warmed");
    expect(records[0].attributes).toStrictEqual({ entries: 3 });
  });

  it("info → record with severity INFO", async () => {
    createLogger("billing").info("Invoice sent", { invoiceId: "inv_1" });

    const records = await finishedRecords();
    expect(records).toHaveLength(1);
    expect(records[0].severityNumber).toBe(SeverityNumber.INFO);
    expect(records[0].severityText).toBe("INFO");
    expect(records[0].body).toBe("Invoice sent");
    expect(records[0].attributes).toStrictEqual({ invoiceId: "inv_1" });
  });

  it("warn → record with severity WARN", async () => {
    createLogger("billing").warn("Retrying payment");

    const records = await finishedRecords();
    expect(records).toHaveLength(1);
    expect(records[0].severityNumber).toBe(SeverityNumber.WARN);
    expect(records[0].severityText).toBe("WARN");
    expect(records[0].body).toBe("Retrying payment");
  });

  it("error → record with severity ERROR", async () => {
    createLogger("billing").error("Payment failed");

    const records = await finishedRecords();
    expect(records).toHaveLength(1);
    expect(records[0].severityNumber).toBe(SeverityNumber.ERROR);
    expect(records[0].severityText).toBe("ERROR");
    expect(records[0].body).toBe("Payment failed");
  });

  it("record instrumentation scope is the scope passed to createLogger", async () => {
    createLogger("acme-app").info("Started");
    createLogger("other-scope").info("Started");

    const records = await finishedRecords();
    expect(records.map((record) => record.instrumentationScope.name)).toEqual([
      "acme-app",
      "other-scope",
    ]);
  });

  it("no attributes → record with empty attributes", async () => {
    createLogger("billing").info("Started");

    const records = await finishedRecords();
    expect(records[0].attributes).toStrictEqual({});
  });

  it("attributes are normalized: null skipped, Error split, invalid Date as text", async () => {
    class d extends Error {
      constructor() {
        super("User is not a member of the active organization");
        this.name = "NoOrganizationError";
      }
    }
    const error = new d();
    error.stack = "NoOrganizationError: boom\n    at handler (route.ts:1:1)";

    createLogger("billing").error("Operation failed", {
      err: error,
      organizationId: null,
      at: new Date("not a date"),
      attempt: 2,
    });

    const records = await finishedRecords();
    expect(records[0].attributes).toStrictEqual({
      "err.type": "NoOrganizationError",
      "err.message": "User is not a member of the active organization",
      "err.stacktrace":
        "NoOrganizationError: boom\n    at handler (route.ts:1:1)",
      at: "Invalid Date",
      attempt: 2,
    });
  });
});

describe("createLogger: console output outside production without an OTLP endpoint", () => {
  beforeEach(() => {
    stubDevelopmentWithoutEndpoint();
  });

  it("debug → console.log with the [DEBUG] prefix and the attributes object as-is", () => {
    const output = spyOnConsole();
    const attributes = { entries: 3 };

    createLogger("billing").debug("Cache warmed", attributes);

    expect(output.log).toHaveBeenCalledTimes(1);
    expect(output.log.mock.calls[0]).toHaveLength(2);
    expect(output.log.mock.calls[0][0]).toBe("[DEBUG] Cache warmed");
    expect(output.log.mock.calls[0][1]).toBe(attributes);
    expect(output.warn).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
  });

  it("info → console.log with the [INFO] prefix and the attributes object as-is", () => {
    const output = spyOnConsole();
    const attributes = { invoiceId: "inv_1", at: new Date("not a date") };

    createLogger("billing").info("Invoice sent", attributes);

    expect(output.log).toHaveBeenCalledTimes(1);
    expect(output.log.mock.calls[0]).toHaveLength(2);
    expect(output.log.mock.calls[0][0]).toBe("[INFO] Invoice sent");
    expect(output.log.mock.calls[0][1]).toBe(attributes);
    expect(output.warn).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
  });

  it("warn → console.warn with the [WARN] prefix", () => {
    const output = spyOnConsole();
    const attributes = { attempt: 2 };

    createLogger("billing").warn("Retrying payment", attributes);

    expect(output.warn).toHaveBeenCalledTimes(1);
    expect(output.warn.mock.calls[0]).toHaveLength(2);
    expect(output.warn.mock.calls[0][0]).toBe("[WARN] Retrying payment");
    expect(output.warn.mock.calls[0][1]).toBe(attributes);
    expect(output.log).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
  });

  it("error → console.error with the [ERROR] prefix", () => {
    const output = spyOnConsole();
    const attributes = { err: new Error("boom") };

    createLogger("billing").error("Payment failed", attributes);

    expect(output.error).toHaveBeenCalledTimes(1);
    expect(output.error.mock.calls[0]).toHaveLength(2);
    expect(output.error.mock.calls[0][0]).toBe("[ERROR] Payment failed");
    expect(output.error.mock.calls[0][1]).toBe(attributes);
    expect(output.log).not.toHaveBeenCalled();
    expect(output.warn).not.toHaveBeenCalled();
  });

  it("no attributes → only the prefixed message, no second argument", () => {
    const output = spyOnConsole();
    const logger = createLogger("billing");

    logger.debug("Debug only");
    logger.info("Info only");
    logger.warn("Warn only");
    logger.error("Error only");

    expect(output.log.mock.calls).toEqual([
      ["[DEBUG] Debug only"],
      ["[INFO] Info only"],
    ]);
    expect(output.log.mock.calls[0]).toHaveLength(1);
    expect(output.log.mock.calls[1]).toHaveLength(1);
    expect(output.warn.mock.calls).toEqual([["[WARN] Warn only"]]);
    expect(output.warn.mock.calls[0]).toHaveLength(1);
    expect(output.error.mock.calls).toEqual([["[ERROR] Error only"]]);
    expect(output.error.mock.calls[0]).toHaveLength(1);
  });

  it("empty OTLP endpoint counts as unset → console output", () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    const output = spyOnConsole();

    createLogger("billing").info("Started");

    expect(output.log.mock.calls).toEqual([["[INFO] Started"]]);
  });

  it("NODE_ENV=test without an endpoint → console output", () => {
    vi.stubEnv("NODE_ENV", "test");
    const output = spyOnConsole();

    createLogger("billing").warn("Careful");

    expect(output.warn.mock.calls).toEqual([["[WARN] Careful"]]);
  });
});

describe("createLogger: no console output", () => {
  it("OTLP endpoint set → nothing printed at any level", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318");
    const output = spyOnConsole();
    const logger = createLogger("billing");

    logger.debug("Debug", { a: 1 });
    logger.info("Info", { a: 1 });
    logger.warn("Warn", { a: 1 });
    logger.error("Error", { a: 1 });

    expect(output.log).not.toHaveBeenCalled();
    expect(output.warn).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
    expect(await finishedRecords()).toHaveLength(4);
  });

  it("NODE_ENV=production without an endpoint → nothing printed at any level", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", undefined);
    const output = spyOnConsole();
    const logger = createLogger("billing");

    logger.debug("Debug");
    logger.info("Info");
    logger.warn("Warn");
    logger.error("Error");

    expect(output.log).not.toHaveBeenCalled();
    expect(output.warn).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
    expect(await finishedRecords()).toHaveLength(4);
  });
});

describe("createLogger: environment is read when the logger is created", () => {
  it("created in development, called after switching to production → still prints", () => {
    stubDevelopmentWithoutEndpoint();
    const output = spyOnConsole();
    const logger = createLogger("billing");
    vi.stubEnv("NODE_ENV", "production");

    logger.info("Started");

    expect(output.log.mock.calls).toEqual([["[INFO] Started"]]);
  });

  it("created in production, called after switching to development → prints nothing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", undefined);
    const output = spyOnConsole();
    const logger = createLogger("billing");
    vi.stubEnv("NODE_ENV", "development");

    logger.info("Started");

    expect(output.log).not.toHaveBeenCalled();
  });

  it("created with an endpoint, called after removing it → prints nothing", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318");
    const output = spyOnConsole();
    const logger = createLogger("billing");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", undefined);

    logger.error("Failed");

    expect(output.error).not.toHaveBeenCalled();
  });
});
