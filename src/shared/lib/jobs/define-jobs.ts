import type { z } from "zod";
import type { logger } from "@/shared/lib/logger";

export type JobScope = "organization" | "system";

export type JobPayloadSchema = z.ZodObject<
  z.core.$ZodShape,
  z.core.$ZodObjectConfig
>;

export interface JobBackoff {
  type: "exponential" | "fixed";
  delayMs: number;
}

export interface JobRetentionRule {
  ageSeconds?: number;
  count?: number;
}

export interface JobRetention {
  completed?: JobRetentionRule;
  failed?: JobRetentionRule;
}

export interface JobEnqueueOptions {
  tx?: unknown;
  jobKey?: string;
  coalesceKey?: string;
  delayMs?: number;
}

export interface JobEnqueueResult {
  outboxId: string;
  duplicate: boolean;
}

interface BaseJobContext {
  readonly actorUserId: string | null;
  readonly serviceMode: boolean;
  readonly timezone: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly signal: AbortSignal;
  readonly log: typeof logger;
  progress(stage: string): Promise<void>;
  enqueue(
    name: string,
    payload: unknown,
    options?: JobEnqueueOptions,
  ): Promise<JobEnqueueResult>;
}

export interface OrganizationJobContext extends BaseJobContext {
  readonly organizationId: string;
}

export interface SystemJobContext extends BaseJobContext {
  readonly organizationId?: undefined;
}

export type JobContext<S extends JobScope> = S extends "organization"
  ? OrganizationJobContext
  : SystemJobContext;

export interface JobDefinition<
  S extends JobScope = JobScope,
  P extends JobPayloadSchema = JobPayloadSchema,
> {
  scope: S;
  payload: P;
  run(payload: z.output<P>, ctx: JobContext<S>): unknown;
  attempts?: number;
  backoff?: JobBackoff;
  concurrency?: number;
  globalConcurrency?: number;
  lockDurationMs?: number;
  timeoutMs?: number;
  retain?: JobRetention;
}

export type JobMap = Record<string, JobDefinition>;

type JobScopeMap = Record<string, JobScope>;
type JobPayloadMap = Record<string, JobPayloadSchema>;

type TypedJobs<S extends JobScopeMap, P extends JobPayloadMap> = {
  [K in keyof S & keyof P]: JobDefinition<S[K], P[K]>;
};

type JobsInput<S extends JobScopeMap, P extends JobPayloadMap> = {
  [K in keyof S]: { scope: S[K] };
} & { [K in keyof P]: { payload: P[K] } } & TypedJobs<S, P>;

export interface ScheduleDefinition {
  job: string;
  cron: string;
  timezone?: string;
  enabledByDefault: boolean;
  settings?: JobPayloadSchema;
  defaultSettings?: Record<string, unknown>;
}

export type ScheduleMap = Record<string, ScheduleDefinition>;

export interface ScheduleOverride {
  enabled?: boolean;
  cron?: string;
  timezone?: string;
  settings?: Record<string, unknown>;
}

export function defineJobs<
  const S extends JobScopeMap,
  const P extends JobPayloadMap,
>(jobs: JobsInput<S, P>): TypedJobs<S, P> {
  return jobs;
}

export function defineSchedules<const T extends ScheduleMap>(schedules: T): T {
  return schedules;
}
