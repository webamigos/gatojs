import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  defineJobs,
  defineSchedules,
  type JobContext,
  type OrganizationJobContext,
  type SystemJobContext,
} from "@/shared/lib/jobs";

describe("defineJobs", () => {
  it("zwraca tę samą mapę jobów", () => {
    const jobs = {
      "audit-logs.prune": {
        scope: "system" as const,
        payload: z.object({ olderThanDays: z.number() }),
        run: () => undefined,
      },
    };

    expect(defineJobs(jobs)).toBe(jobs);
  });

  it("w jobie organizacyjnym payload ma typ ze schematu, a ctx.organizationId jest stringiem", () => {
    const jobs = defineJobs({
      "invoices.render-pdf": {
        scope: "organization",
        payload: z.object({ n: z.number(), invoiceId: z.string() }),
        run: (payload, ctx) => {
          expectTypeOf(payload.n).toEqualTypeOf<number>();
          expectTypeOf(payload.invoiceId).toEqualTypeOf<string>();
          expectTypeOf(ctx.organizationId).toEqualTypeOf<string>();
          expectTypeOf(ctx).toEqualTypeOf<OrganizationJobContext>();
        },
      },
    });

    expect(jobs["invoices.render-pdf"].scope).toBe("organization");
  });

  it("w jobie systemowym ctx.organizationId jest undefined", () => {
    const jobs = defineJobs({
      "audit-logs.prune": {
        scope: "system",
        payload: z.object({ olderThanDays: z.number() }),
        attempts: 3,
        lockDurationMs: 5000,
        run: async (payload, ctx) => {
          expectTypeOf(payload.olderThanDays).toEqualTypeOf<number>();
          expectTypeOf(ctx.organizationId).toEqualTypeOf<undefined>();
          expectTypeOf(ctx).toEqualTypeOf<SystemJobContext>();
        },
      },
    });

    expect(jobs["audit-logs.prune"].attempts).toBe(3);
  });

  it("JobContext wybiera kontekst po zakresie", () => {
    expectTypeOf<
      JobContext<"organization">
    >().toEqualTypeOf<OrganizationJobContext>();
    expectTypeOf<JobContext<"system">>().toEqualTypeOf<SystemJobContext>();
    expectTypeOf<OrganizationJobContext["actorUserId"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<
      OrganizationJobContext["serviceMode"]
    >().toEqualTypeOf<boolean>();
  });
});

describe("defineSchedules", () => {
  it("zwraca tę samą mapę harmonogramów", () => {
    const schedules = {
      "audit-logs.prune-daily": {
        job: "audit-logs.prune",
        cron: "0 3 * * *",
        enabledByDefault: true,
        settings: z.object({ olderThanDays: z.number().int().min(1) }),
        defaultSettings: { olderThanDays: 30 },
      },
    };

    expect(defineSchedules(schedules)).toBe(schedules);
  });

  it("zachowuje literalne typy pól harmonogramu", () => {
    const schedules = defineSchedules({
      "audit-logs.digest-weekly": {
        job: "audit-logs.digest",
        cron: "0 8 * * 1",
        timezone: "organization",
        enabledByDefault: false,
      },
    });

    expectTypeOf(
      schedules["audit-logs.digest-weekly"].job,
    ).toEqualTypeOf<"audit-logs.digest">();
    expect(schedules["audit-logs.digest-weekly"].timezone).toBe("organization");
  });
});
