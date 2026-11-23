import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { normalizeAttributes } from "./normalize-attributes";

export type LogAttributes = Record<string, unknown>;

export type LogMethod = (message: string, attributes?: LogAttributes) => void;

export interface Logger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

function consoleMethodFor(severity: SeverityNumber) {
  if (severity >= SeverityNumber.ERROR) {
    return console.error;
  }
  if (severity >= SeverityNumber.WARN) {
    return console.warn;
  }
  return console.log;
}

export function createLogger(scope: string): Logger {
  const otelLogger = logs.getLogger(scope);
  const isDev = process.env.NODE_ENV !== "production";
  const hasOtlpEndpoint = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const printsToConsole = isDev && !hasOtlpEndpoint;

  function emit(
    severity: SeverityNumber,
    severityText: string,
    message: string,
    attributes?: LogAttributes,
  ) {
    otelLogger.emit({
      severityNumber: severity,
      severityText,
      body: message,
      attributes: normalizeAttributes(attributes),
    });

    if (printsToConsole) {
      consoleMethodFor(severity)(
        `[${severityText}] ${message}`,
        ...(attributes !== undefined ? [attributes] : []),
      );
    }
  }

  return {
    debug: (message, attributes) =>
      emit(SeverityNumber.DEBUG, "DEBUG", message, attributes),
    info: (message, attributes) =>
      emit(SeverityNumber.INFO, "INFO", message, attributes),
    warn: (message, attributes) =>
      emit(SeverityNumber.WARN, "WARN", message, attributes),
    error: (message, attributes) =>
      emit(SeverityNumber.ERROR, "ERROR", message, attributes),
  };
}
