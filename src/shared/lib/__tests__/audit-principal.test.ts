import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import type { OrgContext } from "@/shared/lib/auth/org-context";
import {
  runWithRequestPrincipal,
  type RequestPrincipal,
} from "@/shared/lib/auth/request-principal";
import {
  auditActor,
  trackAudit,
  type AuditChannel,
  type AuditEvent,
  type AuditSink,
} from "../audit";

const PRINCIPAL: RequestPrincipal = {
  channel: "mcp",
  userId: "u1",
  organizationId: "o1",
  accountRole: "user",
  credentialId: "client-1",
  scopes: ["mcp:read"],
  correlationId: "corr-1",
};

const CONTEXT: OrgContext = {
  userId: "u1",
  organizationId: "o1",
  orgRole: "admin",
  userRole: "user",
  serviceMode: false,
};

describe("auditActor pod principalem żądania", () => {
  it("dodaje kanał MCP, credentialId i correlationId z principala", () => {
    const actor = runWithRequestPrincipal(PRINCIPAL, () => auditActor(CONTEXT));

    expect(actor).toStrictEqual({
      organizationId: "o1",
      actorUserId: "u1",
      serviceMode: false,
      channel: "MCP",
      credentialId: "client-1",
      correlationId: "corr-1",
    });
  });

  it("credentialId i correlationId pochodzą z bieżącego principala", () => {
    const actor = runWithRequestPrincipal(
      {
        ...PRINCIPAL,
        credentialId: "client-7",
        correlationId: "corr-7",
      },
      () => auditActor(CONTEXT),
    );

    expect(actor).toMatchObject({
      channel: "MCP",
      credentialId: "client-7",
      correlationId: "corr-7",
    });
  });

  it("principal widoczny po await → kanał MCP w aktorze", async () => {
    const actor = await runWithRequestPrincipal(PRINCIPAL, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return auditActor(CONTEXT);
    });

    expect(actor.channel).toBe("MCP");
    expect(actor.correlationId).toBe("corr-1");
  });

  it("zdarzenie z aktora pod principalem trafia do sinka z correlationId", async () => {
    const sink = vi.fn<AuditSink>(async () => undefined);

    await runWithRequestPrincipal(PRINCIPAL, () =>
      trackAudit(
        {
          ...auditActor(CONTEXT),
          action: "upload.deleted",
          entityType: "upload",
          entityId: "f1",
        },
        [sink],
      ),
    );

    expect(sink.mock.calls[0]?.[0]).toStrictEqual({
      organizationId: "o1",
      actorUserId: "u1",
      serviceMode: false,
      channel: "MCP",
      credentialId: "client-1",
      correlationId: "corr-1",
      action: "upload.deleted",
      entityType: "upload",
      entityId: "f1",
    });
  });
});

describe("auditActor bez principala", () => {
  it("zwraca dokładnie organizationId, actorUserId i serviceMode", () => {
    expect(auditActor(CONTEXT)).toStrictEqual({
      organizationId: "o1",
      actorUserId: "u1",
      serviceMode: false,
    });
  });

  it("nie ma kluczy channel, credentialId ani correlationId, nawet undefined", () => {
    const actor = auditActor(CONTEXT);

    expect(Object.keys(actor).sort()).toEqual([
      "actorUserId",
      "organizationId",
      "serviceMode",
    ]);
    expect("channel" in actor).toBe(false);
    expect("credentialId" in actor).toBe(false);
    expect("correlationId" in actor).toBe(false);
  });

  it("po zakończeniu runWithRequestPrincipal → znowu bez kanału", () => {
    runWithRequestPrincipal(PRINCIPAL, () => auditActor(CONTEXT));

    expect(auditActor(CONTEXT)).toStrictEqual({
      organizationId: "o1",
      actorUserId: "u1",
      serviceMode: false,
    });
  });
});

describe("typy zdarzenia audytu", () => {
  it("AuditChannel przyjmuje MCP, a AuditEvent opcjonalne correlationId", () => {
    const channel: AuditChannel = "MCP";
    const event: AuditEvent = {
      organizationId: "o1",
      actorUserId: "u1",
      action: "upload.deleted",
      entityType: "upload",
      channel,
      correlationId: "corr-1",
    };

    expect(event.correlationId).toBe("corr-1");
  });
});
