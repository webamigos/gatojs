import { z } from "zod";
import type { ModuleEntry } from "@/shared/lib/modules/gato-config";
import { isFiveFieldCron, splitCronFields } from "./cron";
import type {
  JobDefinition,
  JobMap,
  JobScope,
  ScheduleDefinition,
  ScheduleMap,
  ScheduleOverride,
} from "./define-jobs";
import { isSensitiveKey } from "./sensitive-keys";

export interface JobRegistryInput {
  jobs: readonly ModuleEntry<JobMap>[];
  schedules: readonly ModuleEntry<ScheduleMap>[];
  overrides?: Readonly<Record<string, ScheduleOverride | null>>;
}

export interface RegisteredJob {
  name: string;
  module: string;
  definition: JobDefinition;
}

export interface RegisteredSchedule {
  id: string;
  module: string;
  definition: ScheduleDefinition;
}

export interface EffectiveSchedule {
  id: string;
  module: string;
  job: string;
  scope: JobScope;
  cron: string;
  timezone: string | undefined;
  settings: Record<string, unknown>;
}

export interface JobRegistry {
  job(name: string): RegisteredJob | undefined;
  schedules(): readonly RegisteredSchedule[];
  effectiveSchedules(
    enabledModules: readonly string[],
  ): readonly EffectiveSchedule[];
}

export class JobRegistryError extends Error {
  name = "JobRegistryError";
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}

type Overrides = NonNullable<JobRegistryInput["overrides"]>;

const KEY_PATTERN = /^[a-z0-9-]+\.[a-z0-9-]+$/;
const RESERVED_PAYLOAD_KEYS = new Set([
  "organizationId",
  "actorUserId",
  "serviceMode",
  "cause",
]);
const POSITIVE_INTEGER_FIELDS = [
  "attempts",
  "concurrency",
  "globalConcurrency",
] as const;
const MIN_LOCK_DURATION_MS = 5000;
const ORGANIZATION_TIMEZONE = "organization";
const IANA_TIME_ZONES = new Set(Intl.supportedValuesOf("timeZone"));

function line(key: string, problem: string): string {
  return `- ${key}: ${problem}`;
}

function repeated(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function isIanaTimeZone(timezone: string): boolean {
  return timezone === "UTC" || IANA_TIME_ZONES.has(timezone);
}

function registeredJobs(input: JobRegistryInput): RegisteredJob[] {
  return input.jobs.flatMap((entry) =>
    Object.entries(entry.value).map(([name, definition]) => ({
      name,
      module: entry.module,
      definition,
    })),
  );
}

function registeredSchedules(input: JobRegistryInput): RegisteredSchedule[] {
  return input.schedules.flatMap((entry) =>
    Object.entries(entry.value).map(([id, definition]) => ({
      id,
      module: entry.module,
      definition,
    })),
  );
}

function keyProblems(
  kind: "job" | "schedule",
  entries: readonly { key: string; module: string }[],
): string[] {
  return [
    ...entries
      .filter(({ key, module }) => !key.startsWith(`${module}.`))
      .map(({ key, module }) =>
        line(key, `${kind} key is not owned by module ${module}`),
      ),
    ...entries
      .filter(({ key }) => !KEY_PATTERN.test(key))
      .map(({ key }) => line(key, `key must match ${KEY_PATTERN.source}`)),
    ...repeated(entries.map(({ key }) => key)).map((key) =>
      line(key, "declared twice"),
    ),
  ];
}

function payloadKeyProblems(key: string): string[] {
  return [
    ...(RESERVED_PAYLOAD_KEYS.has(key)
      ? [`payload declares reserved key ${key}`]
      : []),
    ...(isSensitiveKey(key) ? [`payload key ${key} looks sensitive`] : []),
  ];
}

function payloadProblems(payload: unknown): string[] {
  if (!(payload instanceof z.ZodObject) || payload.def.catchall !== undefined) {
    return ["payload must be a strip-mode z.object()"];
  }
  return Object.keys(payload.shape).flatMap(payloadKeyProblems);
}

function isPositiveInteger(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 1);
}

function jobDefinitionProblems({ name, definition }: RegisteredJob): string[] {
  const problems = [
    ...payloadProblems(definition.payload),
    ...POSITIVE_INTEGER_FIELDS.filter(
      (field) => !isPositiveInteger(definition[field]),
    ).map((field) => `${field} must be a positive integer`),
    ...((definition.lockDurationMs ?? MIN_LOCK_DURATION_MS) <
    MIN_LOCK_DURATION_MS
      ? [`lockDurationMs must be at least ${MIN_LOCK_DURATION_MS}`]
      : []),
  ];
  return problems.map((problem) => line(name, problem));
}

function cronProblems(cron: string): string[] {
  if (splitCronFields(cron).length !== 5) {
    return ["cron must have five fields"];
  }
  return isFiveFieldCron(cron) ? [] : [`cron is invalid: ${cron}`];
}

function timezoneProblems(timezone: string | undefined): string[] {
  if (
    timezone === undefined ||
    timezone === ORGANIZATION_TIMEZONE ||
    isIanaTimeZone(timezone)
  ) {
    return [];
  }
  return ['timezone is neither an IANA name nor "organization"'];
}

function timezoneModeProblems(
  timezone: string | undefined,
  job: RegisteredJob | undefined,
): string[] {
  if (job === undefined) {
    return [];
  }
  const organizationTime = timezone === ORGANIZATION_TIMEZONE;
  if (organizationTime === (job.definition.scope === "organization")) {
    return [];
  }
  return organizationTime
    ? ["an organization-time schedule needs an organization job"]
    : ["a fixed-time schedule needs a system job"];
}

function timingProblems(
  cron: string,
  timezone: string | undefined,
  job: RegisteredJob | undefined,
): string[] {
  return [
    ...cronProblems(cron),
    ...timezoneProblems(timezone),
    ...timezoneModeProblems(timezone, job),
  ];
}

function targetJobProblems(
  schedule: RegisteredSchedule,
  job: RegisteredJob | undefined,
): string[] {
  if (job === undefined) {
    return [`unknown job ${schedule.definition.job}`];
  }
  return job.module === schedule.module
    ? []
    : [`job ${job.name} belongs to another module`];
}

function matchesSettings(
  definition: ScheduleDefinition,
  settings: Record<string, unknown> | undefined,
): boolean {
  return (
    definition.settings?.safeParse({
      ...definition.defaultSettings,
      ...settings,
    }).success === true
  );
}

function settingsProblems(definition: ScheduleDefinition): string[] {
  if (definition.settings !== undefined) {
    return matchesSettings(definition, {})
      ? []
      : ["defaultSettings do not match settings"];
  }
  return definition.defaultSettings === undefined
    ? []
    : ["defaultSettings given without a settings schema"];
}

function overrideSettingsProblems(
  definition: ScheduleDefinition,
  override: ScheduleOverride,
): string[] {
  if (override.settings === undefined) {
    return [];
  }
  if (definition.settings === undefined) {
    return ["override settings given without a settings schema"];
  }
  return matchesSettings(definition, override.settings)
    ? []
    : ["override settings do not match settings"];
}

function overrideProblems(
  schedule: RegisteredSchedule,
  override: ScheduleOverride | null,
  job: RegisteredJob | undefined,
): string[] {
  if (override === null) {
    return [];
  }
  const { definition } = schedule;
  return [
    ...timingProblems(
      override.cron ?? definition.cron,
      override.timezone ?? definition.timezone,
      job,
    ),
    ...overrideSettingsProblems(definition, override),
  ];
}

function scheduleProblems(
  schedule: RegisteredSchedule,
  override: ScheduleOverride | null | undefined,
  job: RegisteredJob | undefined,
): string[] {
  const { definition } = schedule;
  const problems = [
    ...timingProblems(definition.cron, definition.timezone, job),
    ...targetJobProblems(schedule, job),
    ...settingsProblems(definition),
    ...(override === undefined
      ? []
      : overrideProblems(schedule, override, job)),
  ];
  return problems.map((problem) => line(schedule.id, problem));
}

function registryProblems(
  jobs: readonly RegisteredJob[],
  schedules: readonly RegisteredSchedule[],
  overrides: Overrides,
): string[] {
  const jobsByName = new Map(jobs.map((job) => [job.name, job]));
  const scheduleIds = new Set(schedules.map((schedule) => schedule.id));
  const problems = [
    ...keyProblems(
      "job",
      jobs.map(({ name, module }) => ({ key: name, module })),
    ),
    ...jobs.flatMap(jobDefinitionProblems),
    ...keyProblems(
      "schedule",
      schedules.map(({ id, module }) => ({ key: id, module })),
    ),
    ...schedules.flatMap((schedule) =>
      scheduleProblems(
        schedule,
        overrides[schedule.id],
        jobsByName.get(schedule.definition.job),
      ),
    ),
    ...Object.keys(overrides)
      .filter((id) => !scheduleIds.has(id))
      .map((id) => line(id, "unknown schedule")),
  ];
  return [...new Set(problems)].sort();
}

function isScheduleEnabled(
  definition: ScheduleDefinition,
  override: ScheduleOverride | null | undefined,
): boolean {
  return (
    override !== null && (override?.enabled ?? definition.enabledByDefault)
  );
}

export function createJobRegistry(input: JobRegistryInput): JobRegistry {
  const jobs = registeredJobs(input);
  const schedules = registeredSchedules(input);
  const overrides: Overrides = input.overrides ?? {};
  const problems = registryProblems(jobs, schedules, overrides);
  if (problems.length > 0) {
    throw new JobRegistryError(problems);
  }
  const jobsByName = new Map(jobs.map((job) => [job.name, job]));

  function effectiveSchedule(
    { id, module, definition }: RegisteredSchedule,
    override: ScheduleOverride,
  ): EffectiveSchedule {
    // WHY: the registry check above guarantees every schedule names a declared job.
    const job = jobsByName.get(definition.job)!;
    return {
      id,
      module,
      job: definition.job,
      scope: job.definition.scope,
      cron: override.cron ?? definition.cron,
      timezone: override.timezone ?? definition.timezone,
      settings:
        definition.settings?.parse({
          ...definition.defaultSettings,
          ...override.settings,
        }) ?? {},
    };
  }

  return {
    job: (name) => jobsByName.get(name),
    schedules: () => schedules,
    effectiveSchedules: (enabledModules) =>
      schedules
        .filter(
          (schedule) =>
            enabledModules.includes(schedule.module) &&
            isScheduleEnabled(schedule.definition, overrides[schedule.id]),
        )
        .map((schedule) =>
          effectiveSchedule(schedule, overrides[schedule.id] ?? {}),
        ),
  };
}
