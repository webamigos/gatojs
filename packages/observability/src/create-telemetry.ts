import {
  metrics,
  SpanStatusCode,
  trace,
  type Meter,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import { normalizeAttributes } from "./normalize-attributes";

export interface Telemetry {
  tracer: Tracer;
  meter: Meter;
  withSpan<T>(
    name: string,
    attributes: Record<string, unknown> | undefined,
    fn: (span: Span) => T | Promise<T>,
  ): Promise<T>;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export function createTelemetry(serviceName: string): Telemetry {
  const tracer = trace.getTracer(serviceName);
  const meter = metrics.getMeter(serviceName);

  function withSpan<T>(
    name: string,
    attributes: Record<string, unknown> | undefined,
    fn: (span: Span) => T | Promise<T>,
  ): Promise<T> {
    return tracer.startActiveSpan(
      name,
      { attributes: normalizeAttributes(attributes) },
      async (span) => {
        try {
          const result = await fn(span);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (thrown) {
          const error = asError(thrown);
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          throw thrown;
        } finally {
          span.end();
        }
      },
    );
  }

  return { tracer, meter, withSpan };
}
