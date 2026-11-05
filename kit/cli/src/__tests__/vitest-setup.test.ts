import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setupFileUrl = new URL("../../vitest.setup.ts", import.meta.url).href;
const vitestConfigUrl = new URL("../../vitest.config.ts", import.meta.url).href;

let globalConfigBeforeTest = fc.readConfigureGlobal();

const seedAfterLoadingSetup = async (worker: string | undefined) => {
  fc.resetConfigureGlobal();
  vi.stubEnv("STRYKER_MUTATOR_WORKER", worker);
  vi.resetModules();
  await import(setupFileUrl);
  return fc.readConfigureGlobal().seed;
};

beforeEach(() => {
  globalConfigBeforeTest = fc.readConfigureGlobal();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  fc.configureGlobal(globalConfigBeforeTest);
});

describe("vitest.setup.ts", () => {
  it("Vitest ładuje plik ustawień przed każdym plikiem testów", async () => {
    const { default: config } = await import(vitestConfigUrl);
    const setupFiles: string[] = [config.test.setupFiles ?? []].flat();

    expect(
      setupFiles.map((file) => new URL(file, vitestConfigUrl).href),
    ).toContain(setupFileUrl);
  });

  it("w procesie Strykera 0 ustawia seed fast-check będący liczbą całkowitą", async () => {
    expect(await seedAfterLoadingSetup("0")).toSatisfy(Number.isInteger);
  });

  it("procesy Strykera 0 i 3 startujące w innym czasie dostają ten sam seed", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const seedInWorker0 = await seedAfterLoadingSetup("0");
    vi.setSystemTime(new Date("2031-07-15T12:34:56.789Z"));
    const seedInWorker3 = await seedAfterLoadingSetup("3");

    expect(seedInWorker0).toSatisfy(Number.isInteger);
    expect(seedInWorker3).toBe(seedInWorker0);
  });

  it("ponowne załadowanie w procesie Strykera 1 daje ten sam seed", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const seedOnFirstLoad = await seedAfterLoadingSetup("1");
    vi.setSystemTime(new Date("2031-07-15T12:34:56.789Z"));
    const seedOnSecondLoad = await seedAfterLoadingSetup("1");

    expect(seedOnFirstLoad).toSatisfy(Number.isInteger);
    expect(seedOnSecondLoad).toBe(seedOnFirstLoad);
  });

  it("bez STRYKER_MUTATOR_WORKER nie ustawia seeda, więc fast-check losuje go przy każdym przebiegu", async () => {
    expect(await seedAfterLoadingSetup(undefined)).toBeUndefined();
  });
});
