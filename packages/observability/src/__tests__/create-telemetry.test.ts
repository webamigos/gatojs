import { context, metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  AggregationTemporality,
  MeterProvider,
  MetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTelemetry } from "../index";

class CollectingMetricReader extends MetricReader {
  constructor() {
    super({
      aggregationTemporalitySelector: () => AggregationTemporality.CUMULATIVE,
    });
  }

  protected onForceFlush(): Promise<void> {
    return Promise.resolve();
  }

  protected onShutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const spanExporter = new InMemorySpanExporter();
const tracerProvider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spanExporter)],
});
const contextManager = new AsyncLocalStorageContextManager();
const metricReader = new CollectingMetricReader();
const meterProvider = new MeterProvider({ readers: [metricReader] });

function finishedSpans() {
  return spanExporter.getFinishedSpans();
}

function onlyFinishedSpan() {
  const spans = finishedSpans();
  expect(spans).toHaveLength(1);
  return spans[0];
}

beforeAll(() => {
  context.setGlobalContextManager(contextManager.enable());
  trace.setGlobalTracerProvider(tracerProvider);
  metrics.setGlobalMeterProvider(meterProvider);
});

afterAll(async () => {
  trace.disable();
  context.disable();
  metrics.disable();
  await tracerProvider.shutdown();
  await meterProvider.shutdown();
});

beforeEach(() => {
  spanExporter.reset();
});

describe("createTelemetry: tracer and meter", () => {
  it("tracer creates spans in the instrumentation scope named after the service", () => {
    const { tracer } = createTelemetry("billing-service");

    tracer.startSpan("manual").end();

    expect(onlyFinishedSpan().instrumentationScope.name).toBe(
      "billing-service",
    );
  });

  it("meter records instruments in the scope named after the service", async () => {
    const { meter } = createTelemetry("metrics-service");

    meter.createCounter("invoices_sent").add(3);

    const { resourceMetrics } = await metricReader.collect();
    const scope = resourceMetrics.scopeMetrics.find(
      (scopeMetrics) => scopeMetrics.scope.name === "metrics-service",
    );
    expect(scope?.metrics.map((metric) => metric.descriptor.name)).toEqual([
      "invoices_sent",
    ]);
  });
});

describe("createTelemetry: withSpan on success", () => {
  it("synchronous fn → returns its value, span named after name, status OK, span ended", async () => {
    const { withSpan } = createTelemetry("billing-service");

    const result = await withSpan("invoice.send", undefined, () => "sent");

    expect(result).toBe("sent");
    const span = onlyFinishedSpan();
    expect(span.name).toBe("invoice.send");
    expect(span.status).toEqual({ code: SpanStatusCode.OK });
    expect(span.ended).toBe(true);
    expect(span.events).toEqual([]);
  });

  it("asynchronous fn → returns the resolved value, status OK, span ended", async () => {
    const { withSpan } = createTelemetry("billing-service");
    const value = { id: "inv_1" };

    const result = await withSpan("invoice.load", undefined, async () => {
      await Promise.resolve();
      return value;
    });

    expect(result).toBe(value);
    const span = onlyFinishedSpan();
    expect(span.name).toBe("invoice.load");
    expect(span.status).toEqual({ code: SpanStatusCode.OK });
    expect(span.ended).toBe(true);
  });

  it("span is in the scope named after the service", async () => {
    const { withSpan } = createTelemetry("billing-service");

    await withSpan("invoice.send", undefined, () => undefined);

    expect(onlyFinishedSpan().instrumentationScope.name).toBe(
      "billing-service",
    );
  });

  it("attributes are normalized onto the span", async () => {
    const { withSpan } = createTelemetry("billing-service");

    await withSpan(
      "invoice.send",
      {
        invoiceId: "inv_1",
        amount: 120,
        draft: false,
        organizationId: null,
        userId: undefined,
        dueAt: new Date("2026-12-01T00:00:00.000Z"),
        sentAt: new Date("not a date"),
        filter: { status: "open" },
      },
      () => undefined,
    );

    expect(onlyFinishedSpan().attributes).toStrictEqual({
      invoiceId: "inv_1",
      amount: 120,
      draft: false,
      dueAt: "2026-12-01T00:00:00.000Z",
      sentAt: "Invalid Date",
      filter: '{"status":"open"}',
    });
  });

  it("no attributes → span without attributes", async () => {
    const { withSpan } = createTelemetry("billing-service");

    await withSpan("invoice.send", undefined, () => undefined);

    expect(onlyFinishedSpan().attributes).toStrictEqual({});
  });

  it("fn receives the span, which is the active span while fn runs", async () => {
    const { withSpan } = createTelemetry("billing-service");
    let received:
      { spanId: string; activeSpanId: string | undefined } | undefined;

    await withSpan("invoice.send", undefined, async (span) => {
      await Promise.resolve();
      received = {
        spanId: span.spanContext().spanId,
        activeSpanId: trace.getActiveSpan()?.spanContext().spanId,
      };
    });

    const finished = onlyFinishedSpan();
    expect(received).toEqual({
      spanId: finished.spanContext().spanId,
      activeSpanId: finished.spanContext().spanId,
    });
  });

  it("span is still recording inside fn and ends only after fn resolves", async () => {
    const { withSpan } = createTelemetry("billing-service");
    let recordingInside: boolean | undefined;
    let finishedInside: number | undefined;

    await withSpan("invoice.send", undefined, async (span) => {
      await Promise.resolve();
      recordingInside = span.isRecording();
      finishedInside = finishedSpans().length;
    });

    expect(recordingInside).toBe(true);
    expect(finishedInside).toBe(0);
    expect(finishedSpans()).toHaveLength(1);
  });

  it("nested withSpan → inner span's parent is the outer span", async () => {
    const { withSpan } = createTelemetry("billing-service");

    await withSpan("outer", undefined, () =>
      withSpan("inner", undefined, () => "done"),
    );

    const spans = finishedSpans();
    const outer = spans.find((span) => span.name === "outer");
    const inner = spans.find((span) => span.name === "inner");
    expect(spans).toHaveLength(2);
    expect(inner?.parentSpanContext?.spanId).toBe(outer?.spanContext().spanId);
    expect(inner?.spanContext().traceId).toBe(outer?.spanContext().traceId);
    expect(outer?.parentSpanContext).toBeUndefined();
  });

  it("consecutive withSpan calls → separate root spans", async () => {
    const { withSpan } = createTelemetry("billing-service");

    await withSpan("first", undefined, () => undefined);
    await withSpan("second", undefined, () => undefined);

    const spans = finishedSpans();
    expect(spans.map((span) => span.name)).toEqual(["first", "second"]);
    expect(spans[1].parentSpanContext).toBeUndefined();
  });
});

describe("createTelemetry: withSpan on failure", () => {
  it("fn rejects → rethrows the same error, status ERROR with the message, exception recorded, span ended", async () => {
    const { withSpan } = createTelemetry("billing-service");
    const error = new TypeError("card declined");

    await expect(
      withSpan("payment.charge", undefined, async () => {
        await Promise.resolve();
        throw error;
      }),
    ).rejects.toBe(error);

    const span = onlyFinishedSpan();
    expect(span.ended).toBe(true);
    expect(span.status).toEqual({
      code: SpanStatusCode.ERROR,
      message: "card declined",
    });
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe("exception");
    expect(span.events[0].attributes?.["exception.message"]).toBe(
      "card declined",
    );
    expect(span.events[0].attributes?.["exception.type"]).toBe("TypeError");
  });

  it("fn throws synchronously → the returned promise rejects with the same error and the span ends", async () => {
    const { withSpan } = createTelemetry("billing-service");
    const error = new Error("sync failure");

    await expect(
      withSpan("payment.charge", undefined, () => {
        throw error;
      }),
    ).rejects.toBe(error);

    const span = onlyFinishedSpan();
    expect(span.ended).toBe(true);
    expect(span.status).toEqual({
      code: SpanStatusCode.ERROR,
      message: "sync failure",
    });
    expect(span.events.map((event) => event.name)).toEqual(["exception"]);
  });

  it("thrown string → rethrown unchanged, recorded as an Error with that message", async () => {
    const { withSpan } = createTelemetry("billing-service");

    await expect(
      withSpan("payment.charge", undefined, () => {
        throw "boom";
      }),
    ).rejects.toBe("boom");

    const span = onlyFinishedSpan();
    expect(span.ended).toBe(true);
    expect(span.status).toEqual({
      code: SpanStatusCode.ERROR,
      message: "boom",
    });
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe("exception");
    expect(span.events[0].attributes?.["exception.message"]).toBe("boom");
    expect(span.events[0].attributes?.["exception.type"]).toBe("Error");
  });

  it("rejected number → rethrown unchanged, recorded as an Error with its string form", async () => {
    const { withSpan } = createTelemetry("billing-service");

    await expect(
      withSpan("payment.charge", undefined, () => Promise.reject(42)),
    ).rejects.toBe(42);

    const span = onlyFinishedSpan();
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: "42" });
    expect(span.events[0].attributes?.["exception.message"]).toBe("42");
    expect(span.events[0].attributes?.["exception.type"]).toBe("Error");
  });

  it("failure in the inner span → both spans end, only the inner one records the exception when the outer one handles it", async () => {
    const { withSpan } = createTelemetry("billing-service");
    const error = new Error("inner failure");

    const result = await withSpan("outer", undefined, async () => {
      await withSpan("inner", undefined, () => {
        throw error;
      }).catch((caught: unknown) => caught);
      return "recovered";
    });

    expect(result).toBe("recovered");
    const spans = finishedSpans();
    const outer = spans.find((span) => span.name === "outer");
    const inner = spans.find((span) => span.name === "inner");
    expect(inner?.status).toEqual({
      code: SpanStatusCode.ERROR,
      message: "inner failure",
    });
    expect(outer?.status).toEqual({ code: SpanStatusCode.OK });
    expect(outer?.events).toEqual([]);
  });
});
