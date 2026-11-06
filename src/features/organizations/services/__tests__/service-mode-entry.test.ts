import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePrisma, type FakePrisma } from "@/test/fake-prisma";

const { database, mockTrackAudit, mockLogger } = vi.hoisted(() => ({
  database: { prisma: null as unknown as Record<string, unknown> },
  mockTrackAudit: vi.fn(),
  mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/shared/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_target, key: string) => database.prisma[key] },
  ),
}));
vi.mock("@/shared/lib/audit", async (importActual) => ({
  ...(await importActual<typeof import("@/shared/lib/audit")>()),
  trackAudit: mockTrackAudit,
}));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));

import { trackServiceModeEntry } from "../service-mode-entry";

const ORGANIZATIONS = [
  { id: "org-2", name: "Org 2", createdAt: new Date("2025-06-01") },
  { id: "org-1", name: "Org 1", createdAt: new Date("2026-01-01") },
];

let prisma: FakePrisma;

function seed(options: {
  role?: string;
  memberships?: string[];
  withUser?: boolean;
}) {
  const userId = "super-1";
  const fake = createFakePrisma({
    users:
      options.withUser === false
        ? []
        : [{ id: userId, role: options.role ?? "superadmin" }],
    organizations: ORGANIZATIONS.map((organization) => ({ ...organization })),
    members: (options.memberships ?? []).map((organizationId, index) => ({
      id: `m-${index}`,
      organizationId,
      userId,
      role: "member",
      createdAt: new Date("2026-02-01"),
    })),
    sessions: [],
  });
  prisma = fake.prisma;
  database.prisma = fake.prisma as unknown as Record<string, unknown>;
}

function failingPrisma(): Record<string, unknown> {
  const failing = vi.fn(async () => {
    throw new Error("database down");
  });
  return new Proxy(
    {},
    {
      get: () => new Proxy({}, { get: () => failing }),
    },
  );
}

function expectNoMembershipQueries() {
  expect(prisma.member.findFirst).not.toHaveBeenCalled();
  expect(prisma.member.findUnique).not.toHaveBeenCalled();
  expect(prisma.member.findMany).not.toHaveBeenCalled();
  expect(prisma.member.count).not.toHaveBeenCalled();
  expect(prisma.member.findFirstOrThrow).not.toHaveBeenCalled();
  expect(prisma.member.findUniqueOrThrow).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockTrackAudit.mockResolvedValue(undefined);
});

describe("trackServiceModeEntry", () => {
  it("superadmin bez członkostwa w aktywnej organizacji → jeden wpis organization.entered w trybie serwisowym", async () => {
    seed({});

    await trackServiceModeEntry({
      userId: "super-1",
      activeOrganizationId: "org-1",
    });

    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "super-1",
      action: "organization.entered",
      entityType: "organization",
      entityId: "org-1",
      serviceMode: true,
    });
  });

  it("superadmin z członkostwem w aktywnej organizacji → brak wpisu", async () => {
    seed({ memberships: ["org-1"] });

    await trackServiceModeEntry({
      userId: "super-1",
      activeOrganizationId: "org-1",
    });

    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("członkostwo superadmina w innej organizacji nie blokuje wpisu dla aktywnej", async () => {
    seed({ memberships: ["org-2"] });

    await trackServiceModeEntry({
      userId: "super-1",
      activeOrganizationId: "org-1",
    });

    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        entityId: "org-1",
        serviceMode: true,
      }),
    );
  });

  it.each(["user", "admin"])(
    "rola %s bez członkostwa w aktywnej organizacji → brak wpisu",
    async (role) => {
      seed({ role });

      await trackServiceModeEntry({
        userId: "super-1",
        activeOrganizationId: "org-1",
      });

      expect(mockTrackAudit).not.toHaveBeenCalled();
    },
  );

  it("sesja z activeOrganizationId: null → brak wpisu i bez zapytań o członkostwo", async () => {
    seed({});

    await trackServiceModeEntry({
      userId: "super-1",
      activeOrganizationId: null,
    });

    expect(mockTrackAudit).not.toHaveBeenCalled();
    expectNoMembershipQueries();
  });

  it("sesja bez pola activeOrganizationId → brak wpisu i bez zapytań o członkostwo", async () => {
    seed({});

    await trackServiceModeEntry({ userId: "super-1" });

    expect(mockTrackAudit).not.toHaveBeenCalled();
    expectNoMembershipQueries();
  });

  it("konto nie istnieje → brak wpisu", async () => {
    seed({ withUser: false });

    await trackServiceModeEntry({
      userId: "super-1",
      activeOrganizationId: "org-1",
    });

    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("awaria bazy → funkcja kończy się bez wyjątku, błąd w logu, brak wpisu", async () => {
    database.prisma = failingPrisma();

    await expect(
      trackServiceModeEntry({
        userId: "super-1",
        activeOrganizationId: "org-1",
      }),
    ).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("awaria zapisu wpisu → funkcja kończy się bez wyjątku i błąd w logu", async () => {
    seed({});
    mockTrackAudit.mockRejectedValue(new Error("sink down"));

    await expect(
      trackServiceModeEntry({
        userId: "super-1",
        activeOrganizationId: "org-1",
      }),
    ).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalled();
  });
});
