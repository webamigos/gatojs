// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

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
