import { fc, test } from "@fast-check/vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  TestSequencer,
  TestSequencerConstructor,
  TestSpecification,
  Vitest,
} from "vitest/node";
import { makeTempDir, removeTempDirs } from "./helpers.js";

const sequencerUrl = new URL("../../vitest.sequencer.ts", import.meta.url).href;
const vitestConfigUrl = new URL("../../vitest.config.ts", import.meta.url).href;
const setupFileUrl = new URL("../../vitest.setup.ts", import.meta.url).href;

const abcFiles = {
  "c.test.ts": "x".repeat(300),
  "a.test.ts": "x".repeat(100),
  "b.test.ts": "x".repeat(200),
};

type SequencerModule = {
  SmallestFileFirstSequencer: TestSequencerConstructor;
};

const loadSequencerModule = (): Promise<SequencerModule> =>
  import(sequencerUrl);

const newSequencer = async (): Promise<TestSequencer> => {
  const { SmallestFileFirstSequencer } = await loadSequencerModule();
  return new SmallestFileFirstSequencer({} as Vitest);
};

const writeTestFiles = async (
  contents: Record<string, string>,
): Promise<string> => {
  const dir = await makeTempDir("wa-kit-sequencer-");
  for (const [name, content] of Object.entries(contents)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), content);
  }
  return dir;
};

const specIn = (dir: string, name: string) =>
  ({ moduleId: join(dir, name) }) as TestSpecification;

const sortedNames = async (
  sequencer: TestSequencer,
  dir: string,
  names: string[],
): Promise<string[]> => {
  const sorted = await sequencer.sort(names.map((name) => specIn(dir, name)));
  return sorted.map((spec) => relative(dir, spec.moduleId));
};

const loadConfigInWorker = async (worker: string | undefined) => {
  vi.stubEnv("STRYKER_MUTATOR_WORKER", worker);
  vi.resetModules();
  const { default: config } = await import(vitestConfigUrl);
  return config;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(removeTempDirs);

describe("SmallestFileFirstSequencer.sort", () => {
  it("układa pliki od najmniejszego: c 300 B, a 100 B, b 200 B dają a, b, c", async () => {
    const dir = await writeTestFiles(abcFiles);

    expect(
      await sortedNames(await newSequencer(), dir, [
        "c.test.ts",
        "a.test.ts",
        "b.test.ts",
      ]),
    ).toEqual(["a.test.ts", "b.test.ts", "c.test.ts"]);
  });

  it("rozmiar rozstrzyga przed ścieżką: a 500 B i z 50 B dają z, a", async () => {
    const dir = await writeTestFiles({
      "a.test.ts": "x".repeat(500),
      "z.test.ts": "x".repeat(50),
    });

    expect(
      await sortedNames(await newSequencer(), dir, ["a.test.ts", "z.test.ts"]),
    ).toEqual(["z.test.ts", "a.test.ts"]);
  });

  it("porównuje rozmiary jako liczby, nie napisy: big 1000 B i small 200 B dają small, big", async () => {
    const dir = await writeTestFiles({
      "big.test.ts": "x".repeat(1000),
      "small.test.ts": "x".repeat(200),
    });

    expect(
      await sortedNames(await newSequencer(), dir, [
        "big.test.ts",
        "small.test.ts",
      ]),
    ).toEqual(["small.test.ts", "big.test.ts"]);
  });

  it("liczy rozmiar w bajtach, nie w znakach: a ze 100 znakami ą (200 B) idzie po b 150 B", async () => {
    const dir = await writeTestFiles({
      "a.test.ts": "ą".repeat(100),
      "b.test.ts": "x".repeat(150),
    });

    expect(
      await sortedNames(await newSequencer(), dir, ["a.test.ts", "b.test.ts"]),
    ).toEqual(["b.test.ts", "a.test.ts"]);
  });

  it("przy równym rozmiarze rozstrzyga ścieżka rosnąco: z i m po 150 B dają m, z", async () => {
    const dir = await writeTestFiles({
      "z.test.ts": "x".repeat(150),
      "m.test.ts": "x".repeat(150),
    });

    expect(
      await sortedNames(await newSequencer(), dir, ["z.test.ts", "m.test.ts"]),
    ).toEqual(["m.test.ts", "z.test.ts"]);
  });

  it("remis rozstrzyga porządek punktów kodowych, nie locale: a i Z po 120 B dają Z, a", async () => {
    const dir = await writeTestFiles({
      "a.test.ts": "x".repeat(120),
      "Z.test.ts": "x".repeat(120),
    });

    expect(
      await sortedNames(await newSequencer(), dir, ["a.test.ts", "Z.test.ts"]),
    ).toEqual(["Z.test.ts", "a.test.ts"]);
  });

  it("remis rozstrzyga cała ścieżka, nie sama nazwa pliku: b/a i a/z po 100 B dają a/z, b/a", async () => {
    const dir = await writeTestFiles({
      "b/a.test.ts": "x".repeat(100),
      "a/z.test.ts": "x".repeat(100),
    });

    expect(
      await sortedNames(await newSequencer(), dir, [
        "b/a.test.ts",
        "a/z.test.ts",
      ]),
    ).toEqual(["a/z.test.ts", "b/a.test.ts"]);
  });

  it("nie zmienia tablicy wejściowej i zwraca nową tablicę", async () => {
    const dir = await writeTestFiles(abcFiles);
    const input = [
      specIn(dir, "c.test.ts"),
      specIn(dir, "a.test.ts"),
      specIn(dir, "b.test.ts"),
    ];

    const sorted = await (await newSequencer()).sort(input);

    expect(input.map((spec) => relative(dir, spec.moduleId))).toEqual([
      "c.test.ts",
      "a.test.ts",
      "b.test.ts",
    ]);
    expect(sorted).not.toBe(input);
  });

  it("zwraca te same obiekty specyfikacji, które dostał, nie ich kopie", async () => {
    const dir = await writeTestFiles(abcFiles);
    const c = specIn(dir, "c.test.ts");
    const a = specIn(dir, "a.test.ts");
    const b = specIn(dir, "b.test.ts");

    const sorted = await (await newSequencer()).sort([c, a, b]);

    expect(sorted).toHaveLength(3);
    expect(sorted[0]).toBe(a);
    expect(sorted[1]).toBe(b);
    expect(sorted[2]).toBe(c);
  });

  it("pusta lista daje pustą listę", async () => {
    expect(await (await newSequencer()).sort([])).toEqual([]);
  });

  describe("kolejność zależy tylko od zbioru plików, nie od kolejności wejścia ani wcześniejszych wywołań", () => {
    let sequencer: TestSequencer;
    let distinctSizesDir: string;
    let equalSizesDir: string;

    beforeAll(async () => {
      sequencer = await newSequencer();
      distinctSizesDir = await writeTestFiles(abcFiles);
      equalSizesDir = await writeTestFiles({
        "b.test.ts": "x".repeat(150),
        "m.test.ts": "x".repeat(150),
        "Z.test.ts": "x".repeat(150),
        "a.test.ts": "x".repeat(150),
      });
    });

    test.prop([
      fc.shuffledSubarray(["c.test.ts", "a.test.ts", "b.test.ts"], {
        minLength: 3,
      }),
    ])(
      "dowolna kolejność plików a 100 B, b 200 B, c 300 B daje zawsze a, b, c",
      async (names) => {
        expect(await sortedNames(sequencer, distinctSizesDir, names)).toEqual([
          "a.test.ts",
          "b.test.ts",
          "c.test.ts",
        ]);
      },
    );

    test.prop([
      fc.shuffledSubarray(
        ["b.test.ts", "m.test.ts", "Z.test.ts", "a.test.ts"],
        {
          minLength: 4,
        },
      ),
    ])(
      "pliki b, m, Z, a po 150 B w dowolnej kolejności dają zawsze Z, a, b, m",
      async (names) => {
        expect(await sortedNames(sequencer, equalSizesDir, names)).toEqual([
          "Z.test.ts",
          "a.test.ts",
          "b.test.ts",
          "m.test.ts",
        ]);
      },
    );
  });
});

describe("vitest.config.ts", () => {
  it.each(["0", "3"])(
    "w procesie Strykera %s sekwencerem Vitest jest SmallestFileFirstSequencer",
    async (worker) => {
      const config = await loadConfigInWorker(worker);

      expect(config.test.sequence?.sequencer).toBeTypeOf("function");
      const { SmallestFileFirstSequencer } = await loadSequencerModule();
      expect(config.test.sequence.sequencer).toBe(SmallestFileFirstSequencer);
    },
  );

  it("bez STRYKER_MUTATOR_WORKER nie ustawia sekwencera, więc npm test zostaje przy domyślnym sekwencerze Vitest", async () => {
    const config = await loadConfigInWorker(undefined);

    expect(config.test.sequence?.sequencer).toBeUndefined();
  });

  it("w procesie Strykera dalej ładuje vitest.setup.ts przed każdym plikiem testów", async () => {
    const config = await loadConfigInWorker("0");
    const setupFiles: string[] = [config.test.setupFiles ?? []].flat();

    expect(
      setupFiles.map((file) => new URL(file, vitestConfigUrl).href),
    ).toContain(setupFileUrl);
  });
});
