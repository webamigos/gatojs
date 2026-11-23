import { project } from "@/shared/config/project";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { verifyEnvOnStartup, processStartupIo } = await import("@gatojs/env");
  const { moduleEnvSchemas } = await import("@/modules.generated");
  verifyEnvOnStartup(process.env, processStartupIo, moduleEnvSchemas);

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return;
  }

  const normalizedEndpoint = endpoint.replace(/\/$/, "");

  const { OTLPLogExporter } =
    await import("@opentelemetry/exporter-logs-otlp-http");
  const { LoggerProvider, BatchLogRecordProcessor } =
    await import("@opentelemetry/sdk-logs");
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const { logs } = await import("@opentelemetry/api-logs");
  const { OTLPTraceExporter } =
    await import("@opentelemetry/exporter-trace-otlp-http");
  const { NodeTracerProvider, BatchSpanProcessor } =
    await import("@opentelemetry/sdk-trace-node");

  const resource = resourceFromAttributes({
    "service.name": process.env.OTEL_SERVICE_NAME?.trim() || project.slug,
    "service.version": process.env.GIT_COMMIT_SHA ?? "dev",
    "deployment.environment.name": process.env.NODE_ENV ?? "development",
  });

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({ url: `${normalizedEndpoint}/v1/logs` }),
      ),
    ],
  });

  logs.setGlobalLoggerProvider(loggerProvider);

  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${normalizedEndpoint}/v1/traces` }),
      ),
    ],
  });

  tracerProvider.register();
}
