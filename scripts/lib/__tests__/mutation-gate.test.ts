import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  checkMutationGate,
  mergeReports,
  mutantOriginal,
} from "../mutation-gate";

type Report = Parameters<typeof checkMutationGate>[0];
type Config = Parameters<typeof checkMutationGate>[1];
type Allowed = Config["allowed"][number];

type MutantFields = {
  id?: string;
  mutatorName?: string;
  replacement?: string;
  status?: string;
  start: [number, number];
  end: [number, number];
};

const CRITICAL_FILE = "src/shared/lib/auth/x.ts";
const OTHER_CRITICAL_FILE = "src/shared/lib/auth/y.ts";
const SOURCE = "const a = 1;\nreturn a > 0;";
const SHIFTED_SOURCE = 'import x from "y";\nconst a = 1;\nreturn a > 0;';
const TWO_CONDITIONS_SOURCE = "if (a > 0) {\n  run(b > 1);\n}";

function mutant(fields: MutantFields) {
  return {
    id: fields.id ?? "1",
    mutatorName: fields.mutatorName ?? "ConditionalExpression",
    replacement: fields.replacement ?? "true",
    status: fields.status ?? "Survived",
    location: {
      start: { line: fields.start[0], column: fields.start[1] },
      end: { line: fields.end[0], column: fields.end[1] },
    },
  };
}

function conditionAtLine2(fields: Partial<MutantFields> = {}) {
  return mutant({ start: [2, 8], end: [2, 13], ...fields });
}

type LiteralMutant = Omit<ReturnType<typeof mutant>, "replacement"> & {
  replacement?: string;
};

function withoutReplacement(literal: ReturnType<typeof mutant>): LiteralMutant {
  return {
    id: literal.id,
    mutatorName: literal.mutatorName,
    status: literal.status,
    location: literal.location,
  };
}

function report(
  files: Record<string, { source: string; mutants: LiteralMutant[] }>,
): Report {
  return { files } as Report;
}

function allowed(fields: Partial<Allowed> = {}): Allowed {
  return {
    file: CRITICAL_FILE,
    mutator: "ConditionalExpression",
    original: "a > 0",
    replacement: "true",
    reason: "warunek sprawdzany także przez middleware",
    ...fields,
  };
}

function config(fields: Partial<Config> = {}): Config {
  return {
    critical: ["src/shared/lib/auth/"],
    allowed: [],
    ...fields,
  };
}

describe("mutantOriginal", () => {
  it("wycina fragment z jednej linii, licząc kolumny od 1 z wyłącznym końcem", () => {
    expect(
      mutantOriginal("const a = 1;\nreturn a > 0;", {
        start: { line: 2, column: 8 },
        end: { line: 2, column: 13 },
      }),
    ).toBe("a > 0");
  });

  it("wycina fragment z wcięciem bez spacji wiodących ani znaku za końcem", () => {
    expect(
      mutantOriginal("x\n  { id: true },\ny", {
        start: { line: 2, column: 3 },
        end: { line: 2, column: 15 },
      }),
    ).toBe("{ id: true }");
  });

  it("wycina fragment obejmujący kilka linii razem ze znakami nowej linii", () => {
    expect(
      mutantOriginal("if (a) {\n  b();\n}", {
        start: { line: 1, column: 8 },
        end: { line: 3, column: 2 },
      }),
    ).toBe("{\n  b();\n}");
  });

  it("wycina fragment z pierwszej linii", () => {
    expect(
      mutantOriginal("return a > 0;\nx", {
        start: { line: 1, column: 8 },
        end: { line: 1, column: 13 },
      }),
    ).toBe("a > 0");
  });

  test.prop([
    fc.array(fc.stringMatching(/^[^\n]{0,10}$/), { maxLength: 4 }),
    fc.stringMatching(/^[^\n]{0,10}$/),
    fc.stringMatching(/^[^\n]{1,10}$/),
    fc.stringMatching(/^[^\n]{0,10}$/),
  ])(
    "zwraca dokładnie fragment umieszczony pod wskazaną linią i kolumnami",
    (linesBefore, before, fragment, after) => {
      const source = [...linesBefore, `${before}${fragment}${after}`, "z"].join(
        "\n",
      );
      const line = linesBefore.length + 1;
      const startColumn = before.length + 1;

      expect(
        mutantOriginal(source, {
          start: { line, column: startColumn },
          end: { line, column: startColumn + fragment.length },
        }),
      ).toBe(fragment);
    },
  );
});

describe("checkMutationGate", () => {
  it("dla pustego raportu nie zgłasza naruszeń ani nieaktualnych wpisów", () => {
    expect(
      checkMutationGate(report({}), config({ allowed: [allowed()] })),
    ).toEqual({ violations: [], stale: [] });
  });

  it("zgłasza przeżyłego mutanta w pliku krytycznym z plikiem, linią, mutatorem, oryginałem i zamiennikiem", () => {
    const result = checkMutationGate(
      report({
        [CRITICAL_FILE]: { source: SOURCE, mutants: [conditionAtLine2()] },
      }),
      config(),
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("src/shared/lib/auth/x.ts:2");
    expect(result.violations[0]).toContain("ConditionalExpression");
    expect(result.violations[0]).toContain("„a > 0”");
    expect(result.violations[0]).toContain("„true”");
    expect(result.violations[0]).toContain("Survived");
    expect(result.stale).toEqual([]);
  });

  it("zgłasza mutanta bez pokrycia testami (NoCoverage) w pliku krytycznym", () => {
    const result = checkMutationGate(
      report({
        [CRITICAL_FILE]: {
          source: SOURCE,
          mutants: [conditionAtLine2({ status: "NoCoverage" })],
        },
      }),
      config(),
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("NoCoverage");
  });

  it.each(["Killed", "Timeout", "CompileError", "RuntimeError", "Ignored"])(
    "nie zgłasza mutanta o statusie %s",
    (status) => {
      expect(
        checkMutationGate(
          report({
            [CRITICAL_FILE]: {
              source: SOURCE,
              mutants: [conditionAtLine2({ status })],
            },
          }),
          config(),
        ),
      ).toEqual({ violations: [], stale: [] });
    },
  );

  it("nie zgłasza przeżyłego mutanta w pliku spoza listy krytycznych", () => {
    expect(
      checkMutationGate(
        report({
          "src/features/notes/services/queries/list.ts": {
            source: SOURCE,
            mutants: [conditionAtLine2()],
          },
        }),
        config(),
      ),
    ).toEqual({ violations: [], stale: [] });
  });

  it("nie traktuje jako krytycznego pliku, którego ścieżka tylko zaczyna się podobnie do prefiksu", () => {
    expect(
      checkMutationGate(
        report({
          "src/shared/lib/authz.ts": {
            source: SOURCE,
            mutants: [conditionAtLine2()],
          },
        }),
        config(),
      ),
    ).toEqual({ violations: [], stale: [] });
  });

  it("nie traktuje jako krytycznego pliku, który zawiera prefiks w środku ścieżki", () => {
    expect(
      checkMutationGate(
        report({
          "packages/app/src/shared/lib/auth/x.ts": {
            source: SOURCE,
            mutants: [conditionAtLine2()],
          },
        }),
        config(),
      ),
    ).toEqual({ violations: [], stale: [] });
  });

  it("uznaje plik za krytyczny, gdy pasuje do któregokolwiek z kilku prefiksów", () => {
    const result = checkMutationGate(
      report({
        "src/shared/lib/permissions/check.ts": {
          source: SOURCE,
          mutants: [conditionAtLine2()],
        },
      }),
      config({
        critical: ["src/shared/lib/auth/", "src/shared/lib/permissions/"],
      }),
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain(
      "src/shared/lib/permissions/check.ts:2",
    );
  });

  it("nie zgłasza mutanta pokrytego wpisem z uzasadnieniem i nie uznaje wpisu za nieaktualny", () => {
    expect(
      checkMutationGate(
        report({
          [CRITICAL_FILE]: { source: SOURCE, mutants: [conditionAtLine2()] },
        }),
        config({ allowed: [allowed()] }),
      ),
    ).toEqual({ violations: [], stale: [] });
  });

  it("wpis z innym oryginałem nie pokrywa mutanta i jest nieaktualny", () => {
    const result = checkMutationGate(
      report({
        [CRITICAL_FILE]: { source: SOURCE, mutants: [conditionAtLine2()] },
      }),
      config({ allowed: [allowed({ original: "a >= 0" })] }),
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("„a > 0”");
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0]).toContain("a >= 0");
  });

  it("wpis z innym zamiennikiem nie pokrywa mutanta", () => {
    const result = checkMutationGate(
      report({
        [CRITICAL_FILE]: { source: SOURCE, mutants: [conditionAtLine2()] },
      }),
      config({ allowed: [allowed({ replacement: "false" })] }),
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("„true”");
    expect(result.stale).toHaveLength(1);
  });

  it("wpis z innym mutatorem nie pokrywa mutanta", () => {
    const result = checkMutationGate(
      report({
        [CRITICAL_FILE]: { source: SOURCE, mutants: [conditionAtLine2()] },
      }),
      config({ allowed: [allowed({ mutator: "EqualityOperator" })] }),
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("ConditionalExpression");
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0]).toContain("EqualityOperator");
  });

  it("wpis dla innego pliku nie pokrywa mutanta o tym samym mutatorze, oryginale i zamienniku", () => {
    const result = checkMutationGate(
      report({
        [CRITICAL_FILE]: { source: SOURCE, mutants: [conditionAtLine2()] },
        [OTHER_CRITICAL_FILE]: {
          source: SOURCE,
          mutants: [conditionAtLine2({ status: "Killed" })],
        },
      }),
      config({ allowed: [allowed({ file: OTHER_CRITICAL_FILE })] }),
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("src/shared/lib/auth/x.ts:2");
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0]).toContain(OTHER_CRITICAL_FILE);
  });

  it("wpis nadal pokrywa mutanta po przesunięciu kodu do innej linii", () => {
    expect(
      checkMutationGate(
        report({
          [CRITICAL_FILE]: {
            source: SHIFTED_SOURCE,
            mutants: [mutant({ start: [3, 8], end: [3, 13] })],
          },
        }),
        config({ allowed: [allowed()] }),
      ),
    ).toEqual({ violations: [], stale: [] });
  });

  it("wpis pokrywa tylko mutanta o swoim oryginale, a nie innego mutanta tego samego rodzaju", () => {
    const result = checkMutationGate(
      report({
        [CRITICAL_FILE]: {
          source: TWO_CONDITIONS_SOURCE,
          mutants: [
            mutant({ id: "1", start: [1, 5], end: [1, 10] }),
            mutant({ id: "2", start: [2, 7], end: [2, 12] }),
          ],
        },
      }),
      config({ allowed: [allowed({ original: "b > 1" })] }),
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("src/shared/lib/auth/x.ts:1");
    expect(result.violations[0]).toContain("„a > 0”");
    expect(result.stale).toEqual([]);
  });

  it("jeden wpis pokrywa kilka identycznych mutantów w tym samym pliku", () => {
    expect(
      checkMutationGate(
        report({
          [CRITICAL_FILE]: {
            source: "x(a > 0);\ny(a > 0);",
            mutants: [
              mutant({ id: "1", start: [1, 3], end: [1, 8] }),
              mutant({ id: "2", start: [2, 3], end: [2, 8] }),
            ],
          },
        }),
        config({ allowed: [allowed()] }),
      ),
    ).toEqual({ violations: [], stale: [] });
  });

  it("wpis dla pliku z raportu, którego mutant został zabity, jest nieaktualny z plikiem, mutatorem i oryginałem", () => {
    const result = checkMutationGate(
      report({
        [CRITICAL_FILE]: {
          source: SOURCE,
          mutants: [conditionAtLine2({ status: "Killed" })],
        },
      }),
      config({ allowed: [allowed()] }),
    );

    expect(result.violations).toEqual([]);
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0]).toContain(CRITICAL_FILE);
    expect(result.stale[0]).toContain("ConditionalExpression");
    expect(result.stale[0]).toContain("a > 0");
  });

  it("wpis dla pliku z raportu bez żadnych mutantów jest nieaktualny", () => {
    const result = checkMutationGate(
      report({ [CRITICAL_FILE]: { source: SOURCE, mutants: [] } }),
      config({ allowed: [allowed()] }),
    );

    expect(result.violations).toEqual([]);
    expect(result.stale).toHaveLength(1);
  });

  it("wpis dla pliku nieobecnego w raporcie nie jest ani naruszeniem, ani nieaktualny", () => {
    expect(
      checkMutationGate(
        report({
          [OTHER_CRITICAL_FILE]: {
            source: SOURCE,
            mutants: [conditionAtLine2({ status: "Killed" })],
          },
        }),
        config({ allowed: [allowed()] }),
      ),
    ).toEqual({ violations: [], stale: [] });
  });

  it.each(["", "   "])(
    "wpis z pustym uzasadnieniem (%j) jest naruszeniem",
    (reason) => {
      const result = checkMutationGate(
        report({
          [CRITICAL_FILE]: { source: SOURCE, mutants: [conditionAtLine2()] },
        }),
        config({ allowed: [allowed({ reason })] }),
      );

      expect(result.violations).toContain(
        "src/shared/lib/auth/x.ts ConditionalExpression „a > 0”: brak uzasadnienia",
      );
    },
  );
});

type ReportMutant = Report["files"][string]["mutants"][number];

function describeMutants(merged: Report, file: string): string[] {
  return merged.files[file].mutants
    .map(
      (m: ReportMutant) =>
        `${m.mutatorName} ${m.replacement} ${m.location.start.line}:${m.location.start.column}-${m.location.end.line}:${m.location.end.column} ${m.status}`,
    )
    .sort();
}

function singleFileReport(...mutants: LiteralMutant[]): Report {
  return report({ [CRITICAL_FILE]: { source: SOURCE, mutants } });
}

describe("mergeReports", () => {
  it("dla pustej listy raportów zwraca raport bez plików", () => {
    expect(mergeReports([])).toEqual({ files: {} });
  });

  it("zwraca bez zmian plik z jedynego raportu", () => {
    const merged = mergeReports([
      singleFileReport(
        conditionAtLine2({ id: "1" }),
        conditionAtLine2({ id: "2", replacement: "false", status: "Killed" }),
      ),
    ]);

    expect(merged.files[CRITICAL_FILE]).toEqual({
      source: "const a = 1;\nreturn a > 0;",
      mutants: [
        {
          id: "1",
          mutatorName: "ConditionalExpression",
          replacement: "true",
          status: "Survived",
          location: {
            start: { line: 2, column: 8 },
            end: { line: 2, column: 13 },
          },
        },
        {
          id: "2",
          mutatorName: "ConditionalExpression",
          replacement: "false",
          status: "Killed",
          location: {
            start: { line: 2, column: 8 },
            end: { line: 2, column: 13 },
          },
        },
      ],
    });
  });

  it("zachowuje bez zmian pliki obecne tylko w jednym z raportów", () => {
    const merged = mergeReports([
      report({
        [CRITICAL_FILE]: { source: SOURCE, mutants: [conditionAtLine2()] },
      }),
      report({
        [OTHER_CRITICAL_FILE]: {
          source: SHIFTED_SOURCE,
          mutants: [
            mutant({ status: "NoCoverage", start: [3, 8], end: [3, 13] }),
          ],
        },
      }),
    ]);

    expect(Object.keys(merged.files).sort()).toEqual([
      "src/shared/lib/auth/x.ts",
      "src/shared/lib/auth/y.ts",
    ]);
    expect(merged.files[CRITICAL_FILE]).toEqual({
      source: "const a = 1;\nreturn a > 0;",
      mutants: [
        {
          id: "1",
          mutatorName: "ConditionalExpression",
          replacement: "true",
          status: "Survived",
          location: {
            start: { line: 2, column: 8 },
            end: { line: 2, column: 13 },
          },
        },
      ],
    });
    expect(merged.files[OTHER_CRITICAL_FILE]).toEqual({
      source: 'import x from "y";\nconst a = 1;\nreturn a > 0;',
      mutants: [
        {
          id: "1",
          mutatorName: "ConditionalExpression",
          replacement: "true",
          status: "NoCoverage",
          location: {
            start: { line: 3, column: 8 },
            end: { line: 3, column: 13 },
          },
        },
      ],
    });
  });

  it("bierze source pliku z pierwszego raportu, który go zawiera", () => {
    const merged = mergeReports([
      report({
        [OTHER_CRITICAL_FILE]: { source: SOURCE, mutants: [] },
      }),
      report({
        [CRITICAL_FILE]: { source: "first();", mutants: [] },
      }),
      report({
        [CRITICAL_FILE]: { source: "second();", mutants: [] },
      }),
    ]);

    expect(merged.files[CRITICAL_FILE].source).toBe("first();");
  });

  it.each([
    [["Survived", "Killed"], "Killed"],
    [["Killed", "Survived"], "Killed"],
    [["Survived", "Killed", "Survived"], "Killed"],
    [["NoCoverage", "Killed", "NoCoverage"], "Killed"],
    [["Survived", "Timeout"], "Timeout"],
    [["Timeout", "NoCoverage"], "Timeout"],
  ])(
    "mutant o statusach %j w kolejnych raportach ma w wyniku status %s",
    (statuses, expected) => {
      const merged = mergeReports(
        statuses.map((status, index) =>
          singleFileReport(conditionAtLine2({ id: `r${index}`, status })),
        ),
      );

      expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
        `ConditionalExpression true 2:8-2:13 ${expected}`,
      ]);
    },
  );

  it.each([
    [["Survived", "NoCoverage"], "Survived"],
    [["NoCoverage", "Survived"], "Survived"],
    [["NoCoverage", "NoCoverage"], "NoCoverage"],
    [["Survived", "Survived"], "Survived"],
  ])(
    "mutant przeżyły we wszystkich raportach (%j) ma w wyniku status %s",
    (statuses, expected) => {
      const merged = mergeReports(
        statuses.map((status, index) =>
          singleFileReport(conditionAtLine2({ id: `r${index}`, status })),
        ),
      );

      expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
        `ConditionalExpression true 2:8-2:13 ${expected}`,
      ]);
    },
  );

  it("odróżnia mutanty w tym samym miejscu o innym zamienniku", () => {
    const merged = mergeReports([
      singleFileReport(conditionAtLine2({ id: "1", replacement: "true" })),
      singleFileReport(
        conditionAtLine2({ id: "1", replacement: "false", status: "Killed" }),
      ),
    ]);

    expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
      "ConditionalExpression false 2:8-2:13 Killed",
      "ConditionalExpression true 2:8-2:13 Survived",
    ]);
  });

  it("odróżnia mutanty w tym samym miejscu o innym mutatorze", () => {
    const merged = mergeReports([
      singleFileReport(conditionAtLine2({ id: "1" })),
      singleFileReport(
        conditionAtLine2({
          id: "1",
          mutatorName: "EqualityOperator",
          status: "Killed",
        }),
      ),
    ]);

    expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
      "ConditionalExpression true 2:8-2:13 Survived",
      "EqualityOperator true 2:8-2:13 Killed",
    ]);
  });

  it("odróżnia mutanty w tej samej linii o innej kolumnie początku", () => {
    const merged = mergeReports([
      singleFileReport(mutant({ id: "1", start: [2, 8], end: [2, 13] })),
      singleFileReport(
        mutant({ id: "1", start: [2, 12], end: [2, 13], status: "Killed" }),
      ),
    ]);

    expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
      "ConditionalExpression true 2:12-2:13 Killed",
      "ConditionalExpression true 2:8-2:13 Survived",
    ]);
  });

  it("odróżnia mutanty w tej samej linii o innej kolumnie końca", () => {
    const merged = mergeReports([
      singleFileReport(mutant({ id: "1", start: [2, 8], end: [2, 13] })),
      singleFileReport(
        mutant({ id: "1", start: [2, 8], end: [2, 9], status: "Killed" }),
      ),
    ]);

    expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
      "ConditionalExpression true 2:8-2:13 Survived",
      "ConditionalExpression true 2:8-2:9 Killed",
    ]);
  });

  it("odróżnia mutanty o tych samych kolumnach w innej linii końca", () => {
    const merged = mergeReports([
      singleFileReport(mutant({ id: "1", start: [1, 8], end: [3, 2] })),
      singleFileReport(
        mutant({ id: "1", start: [1, 8], end: [2, 2], status: "Killed" }),
      ),
    ]);

    expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
      "ConditionalExpression true 1:8-2:2 Killed",
      "ConditionalExpression true 1:8-3:2 Survived",
    ]);
  });

  it("łączy ten sam mutant z raportów o różnych identyfikatorach", () => {
    const merged = mergeReports([
      singleFileReport(conditionAtLine2({ id: "17" })),
      singleFileReport(conditionAtLine2({ id: "42", status: "Killed" })),
    ]);

    expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
      "ConditionalExpression true 2:8-2:13 Killed",
    ]);
  });

  it("zachowuje mutanty obecne tylko w pierwszym albo tylko w drugim raporcie pliku z ich statusem", () => {
    const merged = mergeReports([
      singleFileReport(
        conditionAtLine2({ id: "1" }),
        mutant({ id: "2", start: [1, 11], end: [1, 12], replacement: "0" }),
      ),
      singleFileReport(
        conditionAtLine2({ id: "1", status: "Killed" }),
        conditionAtLine2({
          id: "2",
          replacement: "false",
          status: "NoCoverage",
        }),
      ),
    ]);

    expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
      "ConditionalExpression 0 1:11-1:12 Survived",
      "ConditionalExpression false 2:8-2:13 NoCoverage",
      "ConditionalExpression true 2:8-2:13 Killed",
    ]);
  });

  it("bramka na połączonym raporcie nie zgłasza mutanta zabitego tylko przez testy integracyjne", () => {
    const merged = mergeReports([
      singleFileReport(conditionAtLine2({ id: "1" })),
      singleFileReport(conditionAtLine2({ id: "9", status: "Killed" })),
    ]);

    expect(checkMutationGate(merged, config())).toEqual({
      violations: [],
      stale: [],
    });
  });
});

describe("mutant bez pola replacement", () => {
  it("wpis z pustym zamiennikiem pokrywa mutanta bez pola replacement", () => {
    expect(
      checkMutationGate(
        report({
          [CRITICAL_FILE]: {
            source: SOURCE,
            mutants: [withoutReplacement(conditionAtLine2())],
          },
        }),
        config({ allowed: [allowed({ replacement: "" })] }),
      ),
    ).toEqual({ violations: [], stale: [] });
  });

  it("wpis z niepustym zamiennikiem nie pokrywa mutanta bez pola replacement", () => {
    const result = checkMutationGate(
      report({
        [CRITICAL_FILE]: {
          source: SOURCE,
          mutants: [withoutReplacement(conditionAtLine2())],
        },
      }),
      config({ allowed: [allowed({ replacement: "true" })] }),
    );

    expect(result.violations).toHaveLength(1);
    expect(result.stale).toHaveLength(1);
  });

  it("naruszenie dla mutanta bez pola replacement kończy się pustym zamiennikiem", () => {
    const result = checkMutationGate(
      report({
        [CRITICAL_FILE]: {
          source: SOURCE,
          mutants: [withoutReplacement(conditionAtLine2())],
        },
      }),
      config(),
    );

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("src/shared/lib/auth/x.ts:2");
    expect(result.violations[0].endsWith("→ „” (Survived)")).toBe(true);
  });

  it.each([
    ["brak pola, potem pusty napis", true],
    ["pusty napis, potem brak pola", false],
  ])(
    "mergeReports łączy mutanta bez pola replacement z mutantem o pustym zamienniku (%s)",
    (_order, missingFirst) => {
      const missing = withoutReplacement(conditionAtLine2({ id: "1" }));
      const empty = conditionAtLine2({
        id: "2",
        replacement: "",
        status: "Killed",
      });
      const reports = missingFirst
        ? [singleFileReport(missing), singleFileReport(empty)]
        : [singleFileReport(empty), singleFileReport(missing)];

      const merged = mergeReports(reports);

      expect(merged.files[CRITICAL_FILE].mutants).toHaveLength(1);
      expect(merged.files[CRITICAL_FILE].mutants[0].status).toBe("Killed");
    },
  );

  it("bramka na połączonym raporcie nie zgłasza mutanta bez pola replacement zabitego w drugim raporcie", () => {
    const merged = mergeReports([
      singleFileReport(withoutReplacement(conditionAtLine2({ id: "1" }))),
      singleFileReport(
        conditionAtLine2({ id: "2", replacement: "", status: "Killed" }),
      ),
    ]);

    expect(checkMutationGate(merged, config())).toEqual({
      violations: [],
      stale: [],
    });
  });
});

describe("mergeReports bez sklejania pól lokalizacji", () => {
  it.each([
    ["Survived", "Killed"],
    ["Killed", "Survived"],
  ])(
    "mutanty 1:12-21:3 (%s) i 11:2-21:3 (%s) pozostają osobne",
    (firstStatus, secondStatus) => {
      const merged = mergeReports([
        singleFileReport(
          mutant({
            id: "1",
            start: [1, 12],
            end: [21, 3],
            status: firstStatus,
          }),
        ),
        singleFileReport(
          mutant({
            id: "1",
            start: [11, 2],
            end: [21, 3],
            status: secondStatus,
          }),
        ),
      ]);

      expect(describeMutants(merged, CRITICAL_FILE)).toEqual(
        [
          `ConditionalExpression true 1:12-21:3 ${firstStatus}`,
          `ConditionalExpression true 11:2-21:3 ${secondStatus}`,
        ].sort(),
      );
    },
  );

  it("mutanty 1:12-21:3 i 11:2-21:3 z jednego raportu pozostają osobne po scaleniu z drugim", () => {
    const merged = mergeReports([
      singleFileReport(
        mutant({ id: "1", start: [1, 12], end: [21, 3] }),
        mutant({ id: "2", start: [11, 2], end: [21, 3], status: "NoCoverage" }),
      ),
      singleFileReport(
        mutant({ id: "7", start: [11, 2], end: [21, 3], status: "Killed" }),
      ),
    ]);

    expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
      "ConditionalExpression true 11:2-21:3 Killed",
      "ConditionalExpression true 1:12-21:3 Survived",
    ]);
  });

  it("nie skleja linii końca z kolumną końca", () => {
    const merged = mergeReports([
      singleFileReport(mutant({ id: "1", start: [1, 1], end: [2, 13] })),
      singleFileReport(
        mutant({ id: "1", start: [1, 1], end: [21, 3], status: "Killed" }),
      ),
    ]);

    expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
      "ConditionalExpression true 1:1-21:3 Killed",
      "ConditionalExpression true 1:1-2:13 Survived",
    ]);
  });

  it("nie skleja mutatora z zamiennikiem", () => {
    const merged = mergeReports([
      singleFileReport(
        conditionAtLine2({ id: "1", mutatorName: "Ab", replacement: "c" }),
      ),
      singleFileReport(
        conditionAtLine2({
          id: "1",
          mutatorName: "A",
          replacement: "bc",
          status: "Killed",
        }),
      ),
    ]);

    expect(describeMutants(merged, CRITICAL_FILE)).toEqual([
      "A bc 2:8-2:13 Killed",
      "Ab c 2:8-2:13 Survived",
    ]);
  });
});
