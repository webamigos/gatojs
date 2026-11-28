import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ModuleEntry } from "@/shared/lib/modules/gato-config";
import {
  createJobRegistry,
  JobRegistryError,
  type JobMap,
  type JobRegistryInput,
  type ScheduleMap,
  type ScheduleOverride,
} from "@/shared/lib/jobs";

const KEY_LINE = "key must match ^[a-z0-9-]+\\.[a-z0-9-]+$";

function systemJob(extra: Record<string, unknown> = {}) {
  return {
    scope: "system",
    payload: z.object({ olderThanDays: z.number() }),
    run: () => undefined,
    ...extra,
  };
}

function organizationJob(extra: Record<string, unknown> = {}) {
  return {
    scope: "organization",
    payload: z.object({ invoiceId: z.string() }),
    run: () => undefined,
    ...extra,
  };
}

function jobs(
  module: string,
  map: Record<string, unknown>,
): ModuleEntry<JobMap> {
  return { module, value: map as unknown as JobMap };
}

function schedules(
  module: string,
  map: Record<string, unknown>,
): ModuleEntry<ScheduleMap> {
  return { module, value: map as unknown as ScheduleMap };
}

const AUDIT_JOBS = jobs("audit-logs", {
  "audit-logs.prune": systemJob(),
  "audit-logs.digest": organizationJob(),
});

function dailySchedule(extra: Record<string, unknown> = {}) {
  return schedules("audit-logs", {
    "audit-logs.prune-daily": {
      job: "audit-logs.prune",
      cron: "0 3 * * *",
      enabledByDefault: true,
      ...extra,
    },
  });
}

function digestSchedule(extra: Record<string, unknown> = {}) {
  return schedules("audit-logs", {
    "audit-logs.digest-weekly": {
      job: "audit-logs.digest",
      cron: "0 8 * * 1",
      timezone: "organization",
      enabledByDefault: false,
      ...extra,
    },
  });
}

function registryError(input: JobRegistryInput): JobRegistryError {
  try {
    createJobRegistry(input);
  } catch (error) {
    expect(error).toBeInstanceOf(JobRegistryError);
    return error as JobRegistryError;
  }
  throw new Error("createJobRegistry did not throw");
}

function problemsOf(input: JobRegistryInput): readonly string[] {
  return registryError(input).problems;
}

function jobProblems(map: Record<string, unknown>): readonly string[] {
  return problemsOf({ jobs: [jobs("audit-logs", map)], schedules: [] });
}

function overrides(
  map: Record<string, ScheduleOverride | null>,
): JobRegistryInput["overrides"] {
  return map;
}

describe("createJobRegistry: poprawne wejście", () => {
  it("puste listy jobów i harmonogramów nie zgłaszają błędu", () => {
    expect(() => createJobRegistry({ jobs: [], schedules: [] })).not.toThrow();
  });

  it("job i harmonogram z kluczami modułu, cron 0 3 * * * i jobem systemowym przechodzą", () => {
    expect(() =>
      createJobRegistry({ jobs: [AUDIT_JOBS], schedules: [dailySchedule()] }),
    ).not.toThrow();
  });

  it.each(["Europe/Warsaw", "UTC"])(
    "strefa %s na harmonogramie joba systemowego przechodzi",
    (timezone) => {
      expect(() =>
        createJobRegistry({
          jobs: [AUDIT_JOBS],
          schedules: [dailySchedule({ timezone })],
        }),
      ).not.toThrow();
    },
  );

  it("strefa organization na harmonogramie joba organizacyjnego przechodzi", () => {
    expect(() =>
      createJobRegistry({ jobs: [AUDIT_JOBS], schedules: [digestSchedule()] }),
    ).not.toThrow();
  });

  it("lockDurationMs 5000 jest przyjęte", () => {
    expect(() =>
      createJobRegistry({
        jobs: [
          jobs("audit-logs", {
            "audit-logs.prune": systemJob({ lockDurationMs: 5000 }),
          }),
        ],
        schedules: [],
      }),
    ).not.toThrow();
  });

  it("attempts, concurrency i globalConcurrency równe 1 lub 3 są przyjęte", () => {
    expect(() =>
      createJobRegistry({
        jobs: [
          jobs("audit-logs", {
            "audit-logs.prune": systemJob({
              attempts: 1,
              concurrency: 1,
              globalConcurrency: 1,
            }),
            "audit-logs.digest": organizationJob({
              attempts: 3,
              concurrency: 3,
              globalConcurrency: 3,
            }),
          }),
        ],
        schedules: [],
      }),
    ).not.toThrow();
  });

  it("payload ze zwykłymi kluczami przechodzi", () => {
    expect(() =>
      createJobRegistry({
        jobs: [
          jobs("audit-logs", {
            "audit-logs.prune": systemJob({
              payload: z.object({
                invoiceId: z.string(),
                name: z.string(),
                olderThanDays: z.number(),
              }),
            }),
          }),
        ],
        schedules: [],
      }),
    ).not.toThrow();
  });

  it("override null dla zadeklarowanego harmonogramu przechodzi", () => {
    expect(() =>
      createJobRegistry({
        jobs: [AUDIT_JOBS],
        schedules: [dailySchedule()],
        overrides: overrides({ "audit-logs.prune-daily": null }),
      }),
    ).not.toThrow();
  });

  it("override timezone UTC na harmonogramie joba systemowego przechodzi", () => {
    expect(() =>
      createJobRegistry({
        jobs: [AUDIT_JOBS],
        schedules: [dailySchedule()],
        overrides: overrides({
          "audit-logs.prune-daily": { timezone: "UTC", cron: "30 4 * * *" },
        }),
      }),
    ).not.toThrow();
  });

  it("cron z białymi znakami na brzegach jest przyjęty", () => {
    expect(() =>
      createJobRegistry({
        jobs: [AUDIT_JOBS],
        schedules: [dailySchedule({ cron: "  0 3 * * *  " })],
      }),
    ).not.toThrow();
  });
});

describe("createJobRegistry: klucze jobów", () => {
  it("klucz notes.prune w module audit-logs nie należy do modułu", () => {
    expect(jobProblems({ "notes.prune": systemJob() })).toEqual([
      "- notes.prune: job key is not owned by module audit-logs",
    ]);
  });

  it("klucz audit-logs-extra.prune w module audit-logs nie należy do modułu", () => {
    expect(jobProblems({ "audit-logs-extra.prune": systemJob() })).toEqual([
      "- audit-logs-extra.prune: job key is not owned by module audit-logs",
    ]);
  });

  it("klucz audit-logs.Prune nie pasuje do wzorca klucza", () => {
    expect(jobProblems({ "audit-logs.Prune": systemJob() })).toEqual([
      `- audit-logs.Prune: ${KEY_LINE}`,
    ]);
  });

  it("klucz z podkreślnikiem nie pasuje do wzorca klucza", () => {
    expect(jobProblems({ "audit-logs.prune_old": systemJob() })).toContain(
      `- audit-logs.prune_old: ${KEY_LINE}`,
    );
  });

  it("ten sam klucz w dwóch wpisach modułu daje jedną linię declared twice", () => {
    expect(
      problemsOf({
        jobs: [
          jobs("audit-logs", { "audit-logs.prune": systemJob() }),
          jobs("audit-logs", { "audit-logs.prune": systemJob() }),
        ],
        schedules: [],
      }),
    ).toEqual(["- audit-logs.prune: declared twice"]);
  });

  it("ten sam klucz w trzech wpisach nadal daje jedną linię declared twice", () => {
    expect(
      problemsOf({
        jobs: [
          jobs("audit-logs", { "audit-logs.prune": systemJob() }),
          jobs("audit-logs", { "audit-logs.prune": systemJob() }),
          jobs("audit-logs", { "audit-logs.prune": systemJob() }),
        ],
        schedules: [],
      }),
    ).toEqual(["- audit-logs.prune: declared twice"]);
  });
});

describe("createJobRegistry: payload joba", () => {
  it.each([
    ["z.string()", z.string()],
    ["z.object({}).transform()", z.object({}).transform((value) => value)],
    ["z.object({}).passthrough()", z.object({}).passthrough()],
    ["z.object({}).loose()", z.object({}).loose()],
    ["z.object({}).strict()", z.object({}).strict()],
    ["z.object({}).catchall(z.string())", z.object({}).catchall(z.string())],
  ])("payload %s nie jest z.object() w trybie strip", (_label, payload) => {
    expect(jobProblems({ "audit-logs.prune": systemJob({ payload }) })).toEqual(
      ["- audit-logs.prune: payload must be a strip-mode z.object()"],
    );
  });

  it.each([
    ["organizationId", z.object({ organizationId: z.string() })],
    ["actorUserId", z.object({ actorUserId: z.string() })],
    ["serviceMode", z.object({ serviceMode: z.boolean() })],
    ["cause", z.object({ cause: z.string() })],
  ])("payload z kluczem %s deklaruje klucz zarezerwowany", (key, payload) => {
    expect(jobProblems({ "audit-logs.prune": systemJob({ payload }) })).toEqual(
      [`- audit-logs.prune: payload declares reserved key ${key}`],
    );
  });

  it.each([
    ["organizationId", z.object({ organizationId: z.string().optional() })],
    ["actorUserId", z.object({ actorUserId: z.string().optional() })],
    ["serviceMode", z.object({ serviceMode: z.boolean().optional() })],
    ["cause", z.object({ cause: z.string().optional() })],
  ])(
    "payload z opcjonalnym kluczem %s też deklaruje klucz zarezerwowany",
    (key, payload) => {
      expect(
        jobProblems({ "audit-logs.prune": systemJob({ payload }) }),
      ).toEqual([`- audit-logs.prune: payload declares reserved key ${key}`]);
    },
  );

  it.each([
    "apiToken",
    "ApiToken",
    "PASSWORD",
    "sessionId",
    "api_key",
    "apikey",
    "clientSecret",
    "authorization",
    "Cookie",
  ])("klucz payloadu %s wygląda na wrażliwy", (key) => {
    expect(
      jobProblems({
        "audit-logs.prune": systemJob({
          payload: z.object({ [key]: z.string() }),
        }),
      }),
    ).toEqual([`- audit-logs.prune: payload key ${key} looks sensitive`]);
  });

  it("klucz zarezerwowany i wrażliwy w jednym payloadzie dają obie linie posortowane", () => {
    expect(
      jobProblems({
        "audit-logs.prune": systemJob({
          payload: z.object({ apiToken: z.string(), cause: z.string() }),
        }),
      }),
    ).toEqual([
      "- audit-logs.prune: payload declares reserved key cause",
      "- audit-logs.prune: payload key apiToken looks sensitive",
    ]);
  });
});

describe("createJobRegistry: liczby w definicji joba", () => {
  it.each([
    ["attempts", 0],
    ["attempts", 1.5],
    ["attempts", -1],
    ["concurrency", 0],
    ["concurrency", 1.5],
    ["concurrency", -1],
    ["globalConcurrency", 0],
    ["globalConcurrency", 1.5],
    ["globalConcurrency", -1],
  ])("%s równe %s nie jest dodatnią liczbą całkowitą", (field, value) => {
    expect(
      jobProblems({ "audit-logs.prune": systemJob({ [field]: value }) }),
    ).toEqual([`- audit-logs.prune: ${field} must be a positive integer`]);
  });

  it("lockDurationMs 4999 jest za krótkie", () => {
    expect(
      jobProblems({ "audit-logs.prune": systemJob({ lockDurationMs: 4999 }) }),
    ).toEqual(["- audit-logs.prune: lockDurationMs must be at least 5000"]);
  });
});

describe("createJobRegistry: harmonogramy", () => {
  function scheduleProblems(
    map: Record<string, unknown>,
    module = "audit-logs",
  ) {
    return problemsOf({
      jobs: [AUDIT_JOBS],
      schedules: [schedules(module, map)],
    });
  }

  const DAILY = {
    job: "audit-logs.prune",
    cron: "0 3 * * *",
    enabledByDefault: true,
  };

  it("id notes.daily w module audit-logs nie należy do modułu", () => {
    expect(scheduleProblems({ "notes.daily": DAILY })).toEqual([
      "- notes.daily: schedule key is not owned by module audit-logs",
    ]);
  });

  it("id audit-logs.Daily nie pasuje do wzorca klucza", () => {
    expect(scheduleProblems({ "audit-logs.Daily": DAILY })).toEqual([
      `- audit-logs.Daily: ${KEY_LINE}`,
    ]);
  });

  it("to samo id w dwóch wpisach daje declared twice", () => {
    expect(
      problemsOf({
        jobs: [AUDIT_JOBS],
        schedules: [dailySchedule(), dailySchedule()],
      }),
    ).toEqual(["- audit-logs.prune-daily: declared twice"]);
  });

  it.each(["0 0 3 * * *", "* * * *", "0 3 * * * *"])(
    "cron %s nie ma pięciu pól",
    (cron) => {
      expect(
        scheduleProblems({ "audit-logs.prune-daily": { ...DAILY, cron } }),
      ).toEqual(["- audit-logs.prune-daily: cron must have five fields"]);
    },
  );

  it.each(["61 * * * *", "0 3 * * MON", "0 24 * * *"])(
    "cron %s ma pięć pól, ale jest niepoprawny",
    (cron) => {
      expect(
        scheduleProblems({ "audit-logs.prune-daily": { ...DAILY, cron } }),
      ).toEqual([`- audit-logs.prune-daily: cron is invalid: ${cron}`]);
    },
  );

  it("strefa Mars/Base nie jest nazwą IANA ani organization", () => {
    expect(
      scheduleProblems({
        "audit-logs.prune-daily": { ...DAILY, timezone: "Mars/Base" },
      }),
    ).toEqual([
      '- audit-logs.prune-daily: timezone is neither an IANA name nor "organization"',
    ]);
  });

  it("harmonogram nieznanego joba audit-logs.nope", () => {
    expect(
      scheduleProblems({
        "audit-logs.prune-daily": { ...DAILY, job: "audit-logs.nope" },
      }),
    ).toEqual(["- audit-logs.prune-daily: unknown job audit-logs.nope"]);
  });

  it("harmonogram w uploads joba z audit-logs należy do innego modułu", () => {
    expect(
      scheduleProblems({ "uploads.prune-daily": DAILY }, "uploads"),
    ).toEqual([
      "- uploads.prune-daily: job audit-logs.prune belongs to another module",
    ]);
  });

  it("strefa organization na jobie systemowym wymaga joba organizacyjnego", () => {
    expect(
      scheduleProblems({
        "audit-logs.prune-daily": { ...DAILY, timezone: "organization" },
      }),
    ).toEqual([
      "- audit-logs.prune-daily: an organization-time schedule needs an organization job",
    ]);
  });

  it.each([
    ["bez strefy", {}],
    ["Europe/Warsaw", { timezone: "Europe/Warsaw" }],
    ["UTC", { timezone: "UTC" }],
  ])(
    "stała strefa (%s) na jobie organizacyjnym wymaga joba systemowego",
    (_label, extra) => {
      expect(
        scheduleProblems({
          "audit-logs.digest-weekly": {
            job: "audit-logs.digest",
            cron: "0 8 * * 1",
            enabledByDefault: false,
            ...extra,
          },
        }),
      ).toEqual([
        "- audit-logs.digest-weekly: a fixed-time schedule needs a system job",
      ]);
    },
  );

  it("defaultSettings niezgodne ze schematem settings", () => {
    expect(
      scheduleProblems({
        "audit-logs.prune-daily": {
          ...DAILY,
          settings: z.object({ olderThanDays: z.number().int().min(1) }),
          defaultSettings: { olderThanDays: 0 },
        },
      }),
    ).toEqual([
      "- audit-logs.prune-daily: defaultSettings do not match settings",
    ]);
  });

  it("defaultSettings zgodne ze schematem settings przechodzą", () => {
    expect(() =>
      createJobRegistry({
        jobs: [AUDIT_JOBS],
        schedules: [
          dailySchedule({
            settings: z.object({ olderThanDays: z.number().int().min(1) }),
            defaultSettings: { olderThanDays: 1 },
          }),
        ],
      }),
    ).not.toThrow();
  });

  it("defaultSettings bez schematu settings", () => {
    expect(
      scheduleProblems({
        "audit-logs.prune-daily": {
          ...DAILY,
          defaultSettings: { olderThanDays: 30 },
        },
      }),
    ).toEqual([
      "- audit-logs.prune-daily: defaultSettings given without a settings schema",
    ]);
  });
});

describe("createJobRegistry: overrides", () => {
  const SETTINGS = z.object({
    olderThanDays: z.number().int().min(1),
    batch: z.number().int().min(1),
  });

  function withSettings() {
    return dailySchedule({
      settings: SETTINGS,
      defaultSettings: { olderThanDays: 30, batch: 100 },
    });
  }

  it("override nieznanego harmonogramu", () => {
    expect(
      problemsOf({
        jobs: [AUDIT_JOBS],
        schedules: [dailySchedule()],
        overrides: overrides({ "audit-logs.nope-daily": { enabled: true } }),
      }),
    ).toEqual(["- audit-logs.nope-daily: unknown schedule"]);
  });

  it("override null dla nieznanego harmonogramu też jest nieznanym harmonogramem", () => {
    expect(
      problemsOf({
        jobs: [AUDIT_JOBS],
        schedules: [dailySchedule()],
        overrides: overrides({ "audit-logs.nope-daily": null }),
      }),
    ).toEqual(["- audit-logs.nope-daily: unknown schedule"]);
  });

  it("override settings z olderThanDays 0 jest niezgodny ze schematem", () => {
    expect(
      problemsOf({
        jobs: [AUDIT_JOBS],
        schedules: [withSettings()],
        overrides: overrides({
          "audit-logs.prune-daily": { settings: { olderThanDays: 0 } },
        }),
      }),
    ).toEqual([
      "- audit-logs.prune-daily: override settings do not match settings",
    ]);
  });

  it("częściowy override settings jest sprawdzany po scaleniu z defaultSettings", () => {
    expect(() =>
      createJobRegistry({
        jobs: [AUDIT_JOBS],
        schedules: [withSettings()],
        overrides: overrides({
          "audit-logs.prune-daily": { settings: { olderThanDays: 7 } },
        }),
      }),
    ).not.toThrow();
  });

  it("override settings bez schematu settings", () => {
    expect(
      problemsOf({
        jobs: [AUDIT_JOBS],
        schedules: [dailySchedule()],
        overrides: overrides({
          "audit-logs.prune-daily": { settings: { olderThanDays: 7 } },
        }),
      }),
    ).toEqual([
      "- audit-logs.prune-daily: override settings given without a settings schema",
    ]);
  });

  it.each([
    ["0 0 3 * * *", "- audit-logs.prune-daily: cron must have five fields"],
    ["61 * * * *", "- audit-logs.prune-daily: cron is invalid: 61 * * * *"],
  ])("override cron %s jest sprawdzany jak deklaracja", (cron, line) => {
    expect(
      problemsOf({
        jobs: [AUDIT_JOBS],
        schedules: [dailySchedule()],
        overrides: overrides({ "audit-logs.prune-daily": { cron } }),
      }),
    ).toEqual([line]);
  });

  it("override timezone Mars/Base jest sprawdzany jak deklaracja", () => {
    expect(
      problemsOf({
        jobs: [AUDIT_JOBS],
        schedules: [dailySchedule()],
        overrides: overrides({
          "audit-logs.prune-daily": { timezone: "Mars/Base" },
        }),
      }),
    ).toEqual([
      '- audit-logs.prune-daily: timezone is neither an IANA name nor "organization"',
    ]);
  });

  it("override timezone organization na harmonogramie joba systemowego wymaga joba organizacyjnego", () => {
    expect(
      problemsOf({
        jobs: [AUDIT_JOBS],
        schedules: [dailySchedule()],
        overrides: overrides({
          "audit-logs.prune-daily": { timezone: "organization" },
        }),
      }),
    ).toEqual([
      "- audit-logs.prune-daily: an organization-time schedule needs an organization job",
    ]);
  });

  it("override timezone UTC na harmonogramie joba organizacyjnego wymaga joba systemowego", () => {
    expect(
      problemsOf({
        jobs: [AUDIT_JOBS],
        schedules: [digestSchedule()],
        overrides: overrides({
          "audit-logs.digest-weekly": { timezone: "UTC" },
        }),
      }),
    ).toEqual([
      "- audit-logs.digest-weekly: a fixed-time schedule needs a system job",
    ]);
  });

  it("override timezone organization nie maskuje deklaracji stałej strefy na jobie organizacyjnym", () => {
    expect(
      problemsOf({
        jobs: [AUDIT_JOBS],
        schedules: [digestSchedule({ timezone: "Europe/Warsaw" })],
        overrides: overrides({
          "audit-logs.digest-weekly": { timezone: "organization" },
        }),
      }),
    ).toEqual([
      "- audit-logs.digest-weekly: a fixed-time schedule needs a system job",
    ]);
  });
});

describe("createJobRegistry: wiele problemów", () => {
  it("dwa problemy dają jeden JobRegistryError z obiema liniami posortowanymi po kluczu", () => {
    const error = registryError({
      jobs: [
        jobs("audit-logs", {
          "notes.prune": systemJob(),
          "audit-logs.Prune": systemJob(),
        }),
      ],
      schedules: [],
    });

    expect(error.name).toBe("JobRegistryError");
    expect(error.problems).toEqual([
      `- audit-logs.Prune: ${KEY_LINE}`,
      "- notes.prune: job key is not owned by module audit-logs",
    ]);
    expect(error.message).toBe(
      `- audit-logs.Prune: ${KEY_LINE}\n- notes.prune: job key is not owned by module audit-logs`,
    );
  });

  it("problemy jobów, harmonogramów i overrides z różnych modułów trafiają do jednego komunikatu", () => {
    const error = registryError({
      jobs: [
        jobs("uploads", {
          "uploads.sweep": systemJob({ lockDurationMs: 4999 }),
        }),
        AUDIT_JOBS,
      ],
      schedules: [
        schedules("uploads", {
          "uploads.sweep-hourly": {
            job: "uploads.sweep",
            cron: "0 0 3 * * *",
            enabledByDefault: true,
          },
        }),
        dailySchedule(),
      ],
      overrides: overrides({ "audit-logs.ghost": { enabled: false } }),
    });

    expect(error.message).toBe(
      [
        "- audit-logs.ghost: unknown schedule",
        "- uploads.sweep-hourly: cron must have five fields",
        "- uploads.sweep: lockDurationMs must be at least 5000",
      ].join("\n"),
    );
  });
});

describe("createJobRegistry: odczyt rejestru", () => {
  const prune = systemJob();
  const sweep = systemJob();
  const pruneDaily = {
    job: "audit-logs.prune",
    cron: "0 3 * * *",
    enabledByDefault: true,
  };
  const sweepHourly = {
    job: "uploads.sweep",
    cron: "0 * * * *",
    timezone: "Europe/Warsaw",
    enabledByDefault: true,
  };

  const registry = () =>
    createJobRegistry({
      jobs: [
        jobs("audit-logs", { "audit-logs.prune": prune }),
        jobs("uploads", { "uploads.sweep": sweep }),
      ],
      schedules: [
        schedules("uploads", { "uploads.sweep-hourly": sweepHourly }),
        schedules("audit-logs", { "audit-logs.prune-daily": pruneDaily }),
      ],
    });

  it("job(name) zwraca nazwę, moduł i tę samą definicję", () => {
    const found = registry().job("uploads.sweep");

    expect(found?.name).toBe("uploads.sweep");
    expect(found?.module).toBe("uploads");
    expect(found?.definition).toBe(sweep);
  });

  it("job(name) dla niezadeklarowanego joba zwraca undefined", () => {
    expect(registry().job("audit-logs.nope")).toBeUndefined();
  });

  it("schedules() zwraca każdy harmonogram w kolejności wejścia", () => {
    expect(registry().schedules()).toEqual([
      {
        id: "uploads.sweep-hourly",
        module: "uploads",
        definition: sweepHourly,
      },
      {
        id: "audit-logs.prune-daily",
        module: "audit-logs",
        definition: pruneDaily,
      },
    ]);
  });

  it("schedules() pustego rejestru jest puste", () => {
    expect(createJobRegistry({ jobs: [], schedules: [] }).schedules()).toEqual(
      [],
    );
  });
});

describe("JobRegistry.effectiveSchedules", () => {
  const SWEEP_SETTINGS = z.object({
    batch: z.number().int().min(1),
    dryRun: z.boolean().default(false),
  });

  function input(
    overrideMap: Record<string, ScheduleOverride | null> = {},
  ): JobRegistryInput {
    return {
      jobs: [AUDIT_JOBS, jobs("uploads", { "uploads.sweep": systemJob() })],
      schedules: [
        schedules("uploads", {
          "uploads.sweep-hourly": {
            job: "uploads.sweep",
            cron: "0 * * * *",
            timezone: "Europe/Warsaw",
            enabledByDefault: true,
            settings: SWEEP_SETTINGS,
            defaultSettings: { batch: 100 },
          },
        }),
        dailySchedule(),
        digestSchedule(),
      ],
      overrides: overrideMap,
    };
  }

  const SWEEP_EFFECTIVE = {
    id: "uploads.sweep-hourly",
    module: "uploads",
    job: "uploads.sweep",
    scope: "system",
    cron: "0 * * * *",
    timezone: "Europe/Warsaw",
    settings: { batch: 100, dryRun: false },
  };

  const DAILY_EFFECTIVE = {
    id: "audit-logs.prune-daily",
    module: "audit-logs",
    job: "audit-logs.prune",
    scope: "system",
    cron: "0 3 * * *",
    timezone: undefined,
    settings: {},
  };

  const DIGEST_EFFECTIVE = {
    id: "audit-logs.digest-weekly",
    module: "audit-logs",
    job: "audit-logs.digest",
    scope: "organization",
    cron: "0 8 * * 1",
    timezone: "organization",
    settings: {},
  };

  it("bez overrides zwraca harmonogramy włączonych modułów z enabledByDefault w kolejności wejścia", () => {
    expect(
      createJobRegistry(input()).effectiveSchedules(["audit-logs", "uploads"]),
    ).toEqual([SWEEP_EFFECTIVE, DAILY_EFFECTIVE]);
  });

  it("pomija harmonogramy modułów spoza listy włączonych", () => {
    expect(createJobRegistry(input()).effectiveSchedules(["uploads"])).toEqual([
      SWEEP_EFFECTIVE,
    ]);
  });

  it("bez włączonych modułów zwraca pustą listę", () => {
    expect(createJobRegistry(input()).effectiveSchedules([])).toEqual([]);
  });

  it("override null wyłącza harmonogram", () => {
    expect(
      createJobRegistry(
        input({ "audit-logs.prune-daily": null }),
      ).effectiveSchedules(["audit-logs", "uploads"]),
    ).toEqual([SWEEP_EFFECTIVE]);
  });

  it("override enabled false wyłącza harmonogram z enabledByDefault true", () => {
    expect(
      createJobRegistry(
        input({ "audit-logs.prune-daily": { enabled: false } }),
      ).effectiveSchedules(["audit-logs"]),
    ).toEqual([]);
  });

  it("override enabled true włącza harmonogram z enabledByDefault false", () => {
    expect(
      createJobRegistry(
        input({ "audit-logs.digest-weekly": { enabled: true } }),
      ).effectiveSchedules(["audit-logs"]),
    ).toEqual([DAILY_EFFECTIVE, DIGEST_EFFECTIVE]);
  });

  it("pusty override zostawia enabledByDefault", () => {
    expect(
      createJobRegistry(
        input({ "audit-logs.prune-daily": {}, "audit-logs.digest-weekly": {} }),
      ).effectiveSchedules(["audit-logs"]),
    ).toEqual([DAILY_EFFECTIVE]);
  });

  it("override cron i timezone zastępuje wartości z deklaracji", () => {
    expect(
      createJobRegistry(
        input({
          "audit-logs.prune-daily": { cron: "30 4 * * *", timezone: "UTC" },
        }),
      ).effectiveSchedules(["audit-logs"]),
    ).toEqual([{ ...DAILY_EFFECTIVE, cron: "30 4 * * *", timezone: "UTC" }]);
  });

  it("override settings jest scalany z defaultSettings i parsowany przez schemat", () => {
    expect(
      createJobRegistry(
        input({ "uploads.sweep-hourly": { settings: { dryRun: true } } }),
      ).effectiveSchedules(["uploads"]),
    ).toEqual([{ ...SWEEP_EFFECTIVE, settings: { batch: 100, dryRun: true } }]);
  });

  it("override settings nadpisuje klucz z defaultSettings", () => {
    expect(
      createJobRegistry(
        input({ "uploads.sweep-hourly": { settings: { batch: 5 } } }),
      ).effectiveSchedules(["uploads"]),
    ).toEqual([{ ...SWEEP_EFFECTIVE, settings: { batch: 5, dryRun: false } }]);
  });
});
