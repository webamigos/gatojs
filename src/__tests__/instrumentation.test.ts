// @vitest-environment node
import { logs } from "@opentelemetry/api-logs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

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
