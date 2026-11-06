import { project } from "@/shared/config/project";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

const apiLogger = logs.getLogger(project.slug);

function toAttrs(
  attrs?: Record<string, unknown>,
): Record<string, string | number | boolean> {
  if (!attrs) {
    return {};
  }

  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (value instanceof Error) {
      // WHY: production bundles minify class names; only a string literal assigned to name survives.
      result[`${key}.type`] =
        value.name && value.name !== "Error"
          ? value.name
          : value.constructor.name || "Error";
      result[`${key}.message`] = value.message;
      if (value.stack) {
        result[`${key}.stacktrace`] = value.stack;
      }
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result[key] = value;
    } else if (value instanceof Date) {
      result[key] = Number.isNaN(value.getTime())
        ? value.toString()
        : value.toISOString();
    } else {
      try {
        result[key] = JSON.stringify(value);
      } catch {
        result[key] = String(value);
      }
    }
  }
  return result;
}

const IS_DEV = process.env.NODE_ENV !== "production";
const HAS_OTEL = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

function emit(
  severity: SeverityNumber,
  severityText: string,
  message: string,
  attrs?: Record<string, unknown>,
) {
  apiLogger.emit({
    severityNumber: severity,
    severityText,
    body: message,
    attributes: toAttrs(attrs),
  });

  if (IS_DEV && !HAS_OTEL) {
    let fn = console.log;
    if (severity >= SeverityNumber.ERROR) {
      fn = console.error;
    } else if (severity >= SeverityNumber.WARN) {
      fn = console.warn;
    }
    fn(`[${severityText}] ${message}`, ...(attrs !== undefined ? [attrs] : []));
  }
}

export const logger = {
  debug: (message: string, attrs?: Record<string, unknown>) =>
    emit(SeverityNumber.DEBUG, "DEBUG", message, attrs),
  info: (message: string, attrs?: Record<string, unknown>) =>
    emit(SeverityNumber.INFO, "INFO", message, attrs),
  warn: (message: string, attrs?: Record<string, unknown>) =>
    emit(SeverityNumber.WARN, "WARN", message, attrs),
  error: (message: string, attrs?: Record<string, unknown>) =>
    emit(SeverityNumber.ERROR, "ERROR", message, attrs),
};
