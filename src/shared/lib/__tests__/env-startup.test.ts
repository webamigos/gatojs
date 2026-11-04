import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  checkEnv,
  formatEnvReport,
  parseEnv,
  verifyEnvOnStartup,
} from "@/shared/lib/env";

vi.mock("@/modules.generated", async () => {
  const { z: zod } = await import("zod");
  return {
    moduleEnvSchemas: [
      zod
        .object({ DEMO_TOKEN: zod.string().min(1) })
        .transform(({ DEMO_TOKEN }) => ({ DEMO_TOKEN })),
    ],
  };
});

const validCore = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
  BETTER_AUTH_SECRET: "s".repeat(32),
  APP_URL: "http://localhost:3000",
  EMAIL_FROM: "WA App <noreply@example.com>",
  DEMO_TOKEN: "t",
};

const brokenEnv = { ...validCore, DATABASE_URL: undefined, DEMO_TOKEN: "" };

function createIo() {
  return {
    error: vi.fn<(message: string) => void>(),
    exit: vi.fn<(code: number) => void>(),
  };
}

describe("checkEnv", () => {
  it("poprawne zmienne rdzenia i modułu → ok z odczytanym env", () => {
    expect(checkEnv(validCore)).toMatchObject({
      ok: true,
      env: {
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
      },
    });
  });

  it("zbiera problemy rdzenia i modułu naraz, a nie tylko pierwszy", () => {
    const result = checkEnv(brokenEnv);

    expect(result).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        { name: "DATABASE_URL", message: expect.any(String) },
        { name: "DEMO_TOKEN", message: expect.any(String) },
      ]),
    });
    expect(result).toHaveProperty("issues.length", 2);
  });
});

describe("checkEnv: nazwa problemu zgłoszonego przez schemat modułu", () => {
  async function importEnvWithModuleSchema(schema: z.ZodType) {
    vi.resetModules();
    vi.doMock("@/modules.generated", () => ({ moduleEnvSchemas: [schema] }));
    return import("@/shared/lib/env");
  }

  it("problem bez ścieżki, dotyczący całego env, ma nazwę (env) i komunikat schematu", async () => {
    const env = await importEnvWithModuleSchema(
      z.object({}).refine(() => false, { message: "konflikt zmiennych" }),
    );

    expect(env.checkEnv(validCore)).toEqual({
      ok: false,
      issues: [{ name: "(env)", message: "konflikt zmiennych" }],
    });
  });

  it("problem z zagnieżdżoną ścieżką ma nazwę z segmentami połączonymi kropką", async () => {
    const env = await importEnvWithModuleSchema(
      z.object({}).superRefine((_, ctx) => {
        ctx.addIssue({
          code: "custom",
          message: "zła para kluczy",
          path: ["S3", "BUCKET"],
        });
      }),
    );

    expect(env.checkEnv(validCore)).toEqual({
      ok: false,
      issues: [{ name: "S3.BUCKET", message: "zła para kluczy" }],
    });
  });

  it("dwa problemy tej samej zmiennej zostają dwoma problemami", async () => {
    const env = await importEnvWithModuleSchema(
      z.object({}).superRefine((_, ctx) => {
        ctx.addIssue({
          code: "custom",
          message: "za krótki",
          path: ["DEMO_TOKEN"],
        });
        ctx.addIssue({
          code: "custom",
          message: "zły prefiks",
          path: ["DEMO_TOKEN"],
        });
      }),
    );

    const result = env.checkEnv(validCore);

    expect(result).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        { name: "DEMO_TOKEN", message: "za krótki" },
        { name: "DEMO_TOKEN", message: "zły prefiks" },
      ]),
    });
    expect(result).toHaveProperty("issues.length", 2);
  });
});

describe("formatEnvReport", () => {
  it("nagłówek z liczbą problemów, potem linia na każdy problem", () => {
    expect(
      formatEnvReport([
        { name: "DATABASE_URL", message: "brak" },
        { name: "DEMO_TOKEN", message: "pusty" },
      ]),
    ).toBe(
      "Nieprawidłowe zmienne środowiskowe (2):\n- DATABASE_URL: brak\n- DEMO_TOKEN: pusty",
    );
  });

  it("problem całego env wypisuje pod nazwą (env)", () => {
    expect(formatEnvReport([{ name: "(env)", message: "x" }])).toBe(
      "Nieprawidłowe zmienne środowiskowe (1):\n- (env): x",
    );
  });

  test.prop([
    fc.array(
      fc.record({
        name: fc.oneof(
          fc.constant("(env)"),
          fc.stringMatching(/^[A-Z][A-Z0-9_.]{0,15}$/),
        ),
        message: fc
          .string({ unit: "grapheme" })
          .filter((message) => !message.includes("\n")),
      }),
      { maxLength: 20 },
    ),
  ])(
    "raport odczytany z powrotem daje liczbę problemów w nagłówku i problemy w kolejności wejścia",
    (issues) => {
      const [header, ...problemLines] = formatEnvReport(issues).split("\n");
      const readBack = problemLines.map((line) => {
        const [, name, message] = /^- ([^:]+): ([\s\S]*)$/.exec(line) ?? [];
        return { name, message };
      });

      expect(header).toBe(
        `Nieprawidłowe zmienne środowiskowe (${issues.length}):`,
      );
      expect(readBack).toEqual(issues);
    },
  );
});

describe("parseEnv", () => {
  it("brak zmiennej rzuca jednoliniowy błąd z nazwą zmiennej po dwukropku", () => {
    expect(() => parseEnv({ ...validCore, DATABASE_URL: undefined })).toThrow(
      /^Nieprawidłowe zmienne środowiskowe: DATABASE_URL: /,
    );
  });

  it("kilka problemów łączy w jednej linii średnikiem, każdy jako nazwa: komunikat", () => {
    expect(() => parseEnv(brokenEnv)).toThrow(
      /^Nieprawidłowe zmienne środowiskowe: (DATABASE_URL: .+; DEMO_TOKEN: .+|DEMO_TOKEN: .+; DATABASE_URL: .+)$/,
    );
  });
});

describe("verifyEnvOnStartup", () => {
  it("poprawne zmienne → nic nie wypisuje i nie kończy procesu", () => {
    const io = createIo();

    verifyEnvOnStartup(validCore, io);

    expect(io.error).not.toHaveBeenCalled();
    expect(io.exit).not.toHaveBeenCalled();
  });

  it("błędne zmienne → jeden raport z nagłówkiem i linią na każdy problem", () => {
    const io = createIo();

    verifyEnvOnStartup(brokenEnv, io);

    expect(io.error).toHaveBeenCalledTimes(1);
    const [report] = io.error.mock.calls[0];
    expect(report).toMatch(/^Nieprawidłowe zmienne środowiskowe \(2\):\n/);
    expect(report).toContain("\n- DATABASE_URL: ");
    expect(report).toContain("\n- DEMO_TOKEN: ");
  });

  it("błędne zmienne → kończy proces raz, kodem 1", () => {
    const io = createIo();

    verifyEnvOnStartup(brokenEnv, io);

    expect(io.exit).toHaveBeenCalledTimes(1);
    expect(io.exit).toHaveBeenCalledWith(1);
  });

  it("błędne zmienne → raport trafia na wyjście błędów przed zakończeniem procesu", () => {
    const io = createIo();

    verifyEnvOnStartup(brokenEnv, io);

    expect(io.error.mock.invocationCallOrder[0]).toBeLessThan(
      io.exit.mock.invocationCallOrder[0],
    );
  });

  it("faza next build → bez sprawdzenia, raportu i wyjścia", () => {
    const io = createIo();

    verifyEnvOnStartup({ NEXT_PHASE: "phase-production-build" }, io);

    expect(io.error).not.toHaveBeenCalled();
    expect(io.exit).not.toHaveBeenCalled();
  });

  it("faza serwera produkcyjnego nie zwalnia ze sprawdzenia", () => {
    const io = createIo();

    verifyEnvOnStartup(
      {
        ...validCore,
        DATABASE_URL: undefined,
        NEXT_PHASE: "phase-production-server",
      },
      io,
    );

    expect(io.exit).toHaveBeenCalledTimes(1);
    expect(io.exit).toHaveBeenCalledWith(1);
  });

  it("produkcja bez RESEND_API_KEY → raport z regułą produkcyjną i wyjście kodem 1", () => {
    const io = createIo();

    verifyEnvOnStartup({ ...validCore, NODE_ENV: "production" }, io);

    expect(io.error.mock.calls).toEqual([
      [
        "Nieprawidłowe zmienne środowiskowe (1):\n- RESEND_API_KEY: wymagana w produkcji",
      ],
    ]);
    expect(io.exit.mock.calls).toEqual([[1]]);
  });

  it("poprawna konfiguracja produkcyjna → nic nie wypisuje i nie kończy procesu", () => {
    const io = createIo();

    verifyEnvOnStartup(
      {
        ...validCore,
        NODE_ENV: "production",
        RESEND_API_KEY: "re_live",
        BETTER_AUTH_SECRET: "p".repeat(48),
      },
      io,
    );

    expect(io.error).not.toHaveBeenCalled();
    expect(io.exit).not.toHaveBeenCalled();
  });

  it("nie zapamiętuje wyniku: każde wywołanie sprawdza podane zmienne od nowa", () => {
    const io = createIo();

    verifyEnvOnStartup(validCore, io);
    verifyEnvOnStartup(brokenEnv, io);
    verifyEnvOnStartup(brokenEnv, io);

    expect(io.error).toHaveBeenCalledTimes(2);
    expect(io.exit.mock.calls).toEqual([[1], [1]]);
  });
});
