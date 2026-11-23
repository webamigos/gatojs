// @vitest-environment node
import { logs } from "@opentelemetry/api-logs";
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { project } from "@/shared/config/project";
import { logger } from "@/shared/lib/logger";

const exporter = new InMemoryLogRecordExporter();
const provider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(exporter)],
});

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  logs.setGlobalLoggerProvider(provider);
});

afterAll(async () => {
  logs.disable();
  await provider.shutdown();
  vi.restoreAllMocks();
});

describe("app logger", () => {
  it("emits records in the scope named after the project slug", async () => {
    logger.info("Application started", { port: 3000 });
    await provider.forceFlush();

    const records = exporter.getFinishedLogRecords();
    expect(records).toHaveLength(1);
    expect(records[0].instrumentationScope.name).toBe(project.slug);
    expect(records[0].body).toBe("Application started");
    expect(records[0].attributes).toStrictEqual({ port: 3000 });
  });
});
