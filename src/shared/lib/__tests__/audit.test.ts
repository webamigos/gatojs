import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoggerError } = vi.hoisted(() => ({ mockLoggerError: vi.fn() }));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}));

import {
  auditActor,
  trackAudit,
  type AuditEvent,
  type AuditSink,
} from "../audit";

const EVENT: AuditEvent = {
  organizationId: "o1",
  actorUserId: "u1",
  action: "organization.entered",
  entityType: "organization",
  entityId: "o1",
  serviceMode: true,
};

describe("trackAudit", () => {
  beforeEach(() => {
    mockLoggerError.mockReset();
  });

  it("bez sinków → resolves undefined i nic nie loguje", async () => {
    await expect(trackAudit(EVENT, [])).resolves.toBeUndefined();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("oba sinki dostają to samo zdarzenie, w kolejności", async () => {
    const order: string[] = [];
    const sinkA = vi.fn<AuditSink>(async () => {
      order.push("A");
    });
    const sinkB = vi.fn<AuditSink>(async () => {
      order.push("B");
    });

    await trackAudit(EVENT, [sinkA, sinkB]);

    expect(sinkA).toHaveBeenCalledTimes(1);
    expect(sinkB).toHaveBeenCalledTimes(1);
    expect(sinkA.mock.calls[0][0]).toBe(EVENT);
    expect(sinkB.mock.calls[0][0]).toBe(EVENT);
    expect(order).toEqual(["A", "B"]);
  });

  it("sink rzuca → trackAudit nie rzuca, drugi sink wywołany, błąd zalogowany z akcją", async () => {
    const sinkA = vi.fn<AuditSink>(async () => {
      throw new Error("db down");
    });
    const sinkB = vi.fn<AuditSink>(async () => undefined);

    await expect(trackAudit(EVENT, [sinkA, sinkB])).resolves.toBeUndefined();

    expect(sinkB).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "trackAudit failed",
      expect.objectContaining({ action: "organization.entered" }),
    );
  });

  it("drugi sink rzuca → pierwszy zdążył, błąd zalogowany raz", async () => {
    const sinkA = vi.fn<AuditSink>(async () => undefined);
    const sinkB = vi.fn<AuditSink>(async () => {
      throw new Error("db down");
    });

    await expect(trackAudit(EVENT, [sinkA, sinkB])).resolves.toBeUndefined();

    expect(sinkA).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });

  it("synchroniczny wyjątek sinka jest połknięty, kolejny sink działa", async () => {
    const sinkA = vi.fn<AuditSink>((): Promise<void> => {
      throw new Error("sync boom");
    });
    const sinkB = vi.fn<AuditSink>(async () => undefined);

    await expect(trackAudit(EVENT, [sinkA, sinkB])).resolves.toBeUndefined();

    expect(sinkB).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });

  it("dwa sinki rzucają → oba wywołane, dwa wpisy w logu", async () => {
    const failing = async () => {
      throw new Error("db down");
    };
    const sinkA = vi.fn<AuditSink>(failing);
    const sinkB = vi.fn<AuditSink>(failing);

    await trackAudit(EVENT, [sinkA, sinkB]);

    expect(sinkA).toHaveBeenCalledTimes(1);
    expect(sinkB).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledTimes(2);
  });
});

describe("auditActor", () => {
  it("superadmin w trybie serwisowym → organizacja, aktor i serviceMode true", () => {
    expect(
      auditActor({
        userId: "u1",
        organizationId: "o1",
        orgRole: "owner",
        userRole: "superadmin",
        serviceMode: true,
      }),
    ).toEqual({ organizationId: "o1", actorUserId: "u1", serviceMode: true });
  });

  it("członek poza trybem serwisowym → serviceMode false", () => {
    expect(
      auditActor({
        userId: "u2",
        organizationId: "o9",
        orgRole: "member",
        userRole: "user",
        serviceMode: false,
      }),
    ).toEqual({ organizationId: "o9", actorUserId: "u2", serviceMode: false });
  });
});

describe("audit.ts jako moduł współdzielony", () => {
  it("nie zawiera dyrektywy use server", () => {
    const source = readFileSync(
      join(process.cwd(), "src/shared/lib/audit.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/["']use server["']/);
  });
});
