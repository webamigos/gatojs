// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { context, propagation, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

const exporterConfigs = vi.hoisted(() => ({
  logs: [] as unknown[],
  traces: [] as unknown[],
}));

vi.mock("@opentelemetry/exporter-logs-otlp-http", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@opentelemetry/exporter-logs-otlp-http")
    >();
  class RecordingLogExporter extends actual.OTLPLogExporter {
    constructor(...args: ConstructorParameters<typeof actual.OTLPLogExporter>) {
      super(...args);
      exporterConfigs.logs.push(args[0]);
    }

    override export(
      _items: unknown,
      resultCallback: (result: ExportResult) => void,
    ): void {
      resultCallback({ code: ExportResultCode.SUCCESS });
    }
  }
  return { ...actual, OTLPLogExporter: RecordingLogExporter };
});

vi.mock("@opentelemetry/exporter-trace-otlp-http", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@opentelemetry/exporter-trace-otlp-http")
    >();
  class RecordingTraceExporter extends actual.OTLPTraceExporter {
    constructor(
      ...args: ConstructorParameters<typeof actual.OTLPTraceExporter>
    ) {
      super(...args);
      exporterConfigs.traces.push(args[0]);
    }

    override export(
      _items: unknown,
      resultCallback: (result: ExportResult) => void,
    ): void {
      resultCallback({ code: ExportResultCode.SUCCESS });
    }
  }
  return { ...actual, OTLPTraceExporter: RecordingTraceExporter };
});

function isModuleInstalled(name: string): boolean {
  const state = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), ".wa/kit.json"), "utf8"),
  ) as {
    modules: Record<string, unknown>;
  };
  return name in state.modules;
}

const processExitCalled = new Error("process.exit");

function spyOnStartupOutput() {
  return {
    exit: vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

function isSpanRecording(): boolean {
  const span = trace.getTracer("x").startSpan("probe");
  const recording = span.isRecording();
  span.end();
  return recording;
}

describe("register: walidacja env przy starcie", () => {
  beforeEach(() => {
    exporterConfigs.logs.length = 0;
    exporterConfigs.traces.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    logs.disable();
    trace.disable();
    context.disable();
    propagation.disable();
  });

  it("runtime nodejs z błędnym env i bez OTel → raport na console.error i process.exit(1)", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    const output = spyOnStartupOutput();

    await register();

    expect(output.exit).toHaveBeenCalledWith(1);
    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining("- DATABASE_URL: "),
    );
  });

  it("runtime nodejs z błędnym env i z OTel → raport i process.exit(1), zanim skonfiguruje eksport logów", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318");
    const output = spyOnStartupOutput();
    output.exit.mockImplementation(() => {
      throw processExitCalled;
    });
    const loggerProviderBefore = logs.getLoggerProvider();

    await expect(register()).rejects.toBe(processExitCalled);

    expect(output.exit).toHaveBeenCalledWith(1);
    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining("- DATABASE_URL: "),
    );
    expect(logs.getLoggerProvider()).toBe(loggerProviderBefore);
    expect(exporterConfigs.logs).toEqual([]);
    expect(exporterConfigs.traces).toEqual([]);
    expect(isSpanRecording()).toBe(false);
  });

  it("runtime nodejs przy NODE_ENV=production → sprawdza env i kończy proces kodem 1", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    const output = spyOnStartupOutput();

    await register();

    expect(output.exit).toHaveBeenCalledWith(1);
    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining("- DATABASE_URL: "),
    );
  });

  function stubValidCoreEnv() {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", undefined);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://postgres:postgres@localhost:5432/wa",
    );
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("EMAIL_FROM", "WA App <noreply@example.com>");
    vi.stubEnv("AUTH_PUBLIC_SIGNUP", "");
    vi.stubEnv("MULTI_ORG", "");
    vi.stubEnv("ADMIN_IMPERSONATION", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    vi.stubEnv("API_KEY_PEPPER", "p".repeat(32));
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("STORAGE_LOCAL_PATH", undefined);
    vi.stubEnv("ENCRYPTION_PROVIDER", undefined);
    vi.stubEnv("ENCRYPTION_MASTER_KEY", "ab".repeat(32));
  }

  it.skipIf(!isModuleInstalled("uploads"))(
    "nodejs runtime with a valid core env but STORAGE_PROVIDER=s3 and no S3_* variables → module issues in the report and process.exit(1)",
    async () => {
      stubValidCoreEnv();
      vi.stubEnv("STORAGE_PROVIDER", "s3");
      vi.stubEnv("S3_ENDPOINT", undefined);
      vi.stubEnv("S3_ACCESS_KEY_ID", undefined);
      vi.stubEnv("S3_SECRET_ACCESS_KEY", undefined);
      vi.stubEnv("S3_BUCKET", undefined);
      const output = spyOnStartupOutput();

      await register();

      expect(output.exit.mock.calls).toEqual([[1]]);
      expect(output.error).toHaveBeenCalledTimes(1);
      const [report] = output.error.mock.calls[0];
      expect(report).toMatch(/^Invalid environment variables \(4\):\n/);
      expect(report).toContain("\n- S3_ENDPOINT: ");
      expect(report).toContain("\n- S3_ACCESS_KEY_ID: ");
      expect(report).toContain("\n- S3_SECRET_ACCESS_KEY: ");
      expect(report).toContain("\n- S3_BUCKET: ");
    },
  );

  it.skipIf(!isModuleInstalled("api-keys"))(
    "nodejs runtime with a valid core env but no API_KEY_PEPPER → a single API_KEY_PEPPER issue and process.exit(1)",
    async () => {
      stubValidCoreEnv();
      vi.stubEnv("API_KEY_PEPPER", undefined);
      const output = spyOnStartupOutput();

      await register();

      expect(output.exit.mock.calls).toEqual([[1]]);
      expect(output.error).toHaveBeenCalledTimes(1);
      expect(output.error.mock.calls[0][0]).toMatch(
        /^Invalid environment variables \(1\):\n- API_KEY_PEPPER: /,
      );
    },
  );

  it.skipIf(!isModuleInstalled("encryption"))(
    "nodejs runtime with a valid core env but no ENCRYPTION_MASTER_KEY → a single ENCRYPTION_MASTER_KEY issue and process.exit(1)",
    async () => {
      stubValidCoreEnv();
      vi.stubEnv("ENCRYPTION_MASTER_KEY", undefined);
      const output = spyOnStartupOutput();

      await register();

      expect(output.exit.mock.calls).toEqual([[1]]);
      expect(output.error).toHaveBeenCalledTimes(1);
      expect(output.error.mock.calls[0][0]).toMatch(
        /^Invalid environment variables \(1\):\n- ENCRYPTION_MASTER_KEY: /,
      );
    },
  );

  it.skipIf(!isModuleInstalled("encryption"))(
    "nodejs runtime with an ENCRYPTION_MASTER_KEY of the wrong length → the report names ENCRYPTION_MASTER_KEY and process.exit(1)",
    async () => {
      stubValidCoreEnv();
      vi.stubEnv("ENCRYPTION_MASTER_KEY", "ab".repeat(16));
      const output = spyOnStartupOutput();

      await register();

      expect(output.exit.mock.calls).toEqual([[1]]);
      expect(output.error.mock.calls[0][0]).toMatch(
        /^Invalid environment variables \(1\):\n- ENCRYPTION_MASTER_KEY: .*32 bytes/,
      );
    },
  );

  it("nodejs runtime with a valid core and module env → no report and no exit", async () => {
    stubValidCoreEnv();
    const output = spyOnStartupOutput();

    await register();

    expect(output.exit).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
  });

  it("runtime edge → bez sprawdzenia, raportu i wyjścia", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    const output = spyOnStartupOutput();

    await register();

    expect(output.exit).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
  });

  it("faza next build w runtime nodejs → bez sprawdzenia, raportu i wyjścia", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    const output = spyOnStartupOutput();

    await register();

    expect(output.exit).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
  });

  it("valid env without an OTLP endpoint → no log or trace exporter and no global tracer provider", async () => {
    stubValidCoreEnv();
    const output = spyOnStartupOutput();
    const loggerProviderBefore = logs.getLoggerProvider();

    await register();

    expect(output.exit).not.toHaveBeenCalled();
    expect(exporterConfigs.logs).toEqual([]);
    expect(exporterConfigs.traces).toEqual([]);
    expect(logs.getLoggerProvider()).toBe(loggerProviderBefore);
    expect(isSpanRecording()).toBe(false);
  });

  it("valid env with the OTLP endpoint unset → no log or trace exporter", async () => {
    stubValidCoreEnv();
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", undefined);
    const output = spyOnStartupOutput();

    await register();

    expect(output.exit).not.toHaveBeenCalled();
    expect(exporterConfigs.logs).toEqual([]);
    expect(exporterConfigs.traces).toEqual([]);
    expect(isSpanRecording()).toBe(false);
  });

  it("OTLP endpoint with a trailing slash → one log exporter at /v1/logs and one trace exporter at /v1/traces, without a double slash", async () => {
    stubValidCoreEnv();
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318/");
    const output = spyOnStartupOutput();

    await register();

    expect(output.exit).not.toHaveBeenCalled();
    expect(exporterConfigs.logs).toEqual([
      { url: "http://127.0.0.1:4318/v1/logs" },
    ]);
    expect(exporterConfigs.traces).toEqual([
      { url: "http://127.0.0.1:4318/v1/traces" },
    ]);
  });

  it("OTLP endpoint without a trailing slash → exporters at <endpoint>/v1/logs and <endpoint>/v1/traces", async () => {
    stubValidCoreEnv();
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector.internal:4318");
    const output = spyOnStartupOutput();

    await register();

    expect(output.exit).not.toHaveBeenCalled();
    expect(exporterConfigs.logs).toEqual([
      { url: "http://collector.internal:4318/v1/logs" },
    ]);
    expect(exporterConfigs.traces).toEqual([
      { url: "http://collector.internal:4318/v1/traces" },
    ]);
  });

  it("OTLP endpoint set → global tracer provider registered, spans are recorded", async () => {
    stubValidCoreEnv();
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318");
    spyOnStartupOutput();

    await register();

    expect(isSpanRecording()).toBe(true);
  });

  it("OTLP endpoint set → spans carry service.name from OTEL_SERVICE_NAME and service.version from GIT_COMMIT_SHA", async () => {
    stubValidCoreEnv();
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318");
    vi.stubEnv("OTEL_SERVICE_NAME", "billing-api");
    vi.stubEnv("GIT_COMMIT_SHA", "abc123");
    spyOnStartupOutput();

    await register();

    const span = trace.getTracer("x").startSpan("probe");
    span.end();
    const { resource } = span as unknown as ReadableSpan;
    expect(resource.attributes["service.name"]).toBe("billing-api");
    expect(resource.attributes["service.version"]).toBe("abc123");
  });

  it("edge runtime with an OTLP endpoint → no exporters", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318");
    spyOnStartupOutput();

    await register();

    expect(exporterConfigs.logs).toEqual([]);
    expect(exporterConfigs.traces).toEqual([]);
  });
});
