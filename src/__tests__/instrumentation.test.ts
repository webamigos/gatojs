// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { logs } from "@opentelemetry/api-logs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

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

describe("register: walidacja env przy starcie", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    logs.disable();
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
      expect(report).toMatch(/^Nieprawidłowe zmienne środowiskowe \(4\):\n/);
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
        /^Nieprawidłowe zmienne środowiskowe \(1\):\n- API_KEY_PEPPER: /,
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
});
