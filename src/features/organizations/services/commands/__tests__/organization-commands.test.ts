import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, emitted, timeline } = vi.hoisted(() => ({
  mockPrisma: {
    organization: { create: vi.fn() },
  },
  emitted: [] as unknown[],
  timeline: [] as string[],
}));

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/modules.generated", () => ({
  moduleEvents: [],
  moduleSubscribers: [
    {
      module: "probe",
      value: {
        "organizations.created": {
          id: "probe.record",
          run: (event: unknown) => {
            timeline.push("event");
            emitted.push(event);
          },
        },
      },
    },
  ],
}));

import { createOrganizationWithOwnerCommand } from "../organization-commands";

beforeEach(() => {
  emitted.length = 0;
  timeline.length = 0;
  mockPrisma.organization.create.mockReset();
  mockPrisma.organization.create.mockResolvedValue({
    id: "org-1",
    slug: "acme",
  });
});

describe("createOrganizationWithOwnerCommand", () => {
  it("returns only the new organization id", async () => {
    await expect(
      createOrganizationWithOwnerCommand({ name: "Acme", ownerId: "u1" }),
    ).resolves.toStrictEqual({ id: "org-1" });
  });

  it("creates the organization with the owner and selects its id and slug", async () => {
    await createOrganizationWithOwnerCommand({ name: "Acme", ownerId: "u1" });

    expect(mockPrisma.organization.create).toHaveBeenCalledTimes(1);
    const { data, select } = mockPrisma.organization.create.mock.calls[0][0];
    expect(data.name).toBe("Acme");
    expect(data.slug).toMatch(/^acme-[a-z0-9]{8}$/);
    expect(data.members).toEqual({ create: { userId: "u1", role: "owner" } });
    expect(select).toEqual({ id: true, slug: true });
  });

  it("emits one organizations.created for the new organization with the owner as actor", async () => {
    await createOrganizationWithOwnerCommand({ name: "Acme", ownerId: "u1" });

    expect(emitted).toEqual([
      {
        name: "organizations.created",
        organizationId: "org-1",
        actorUserId: "u1",
        payload: { name: "Acme", slug: "acme", ownerUserId: "u1" },
      },
    ]);
  });

  it("the event carries the slug of the written row", async () => {
    mockPrisma.organization.create.mockResolvedValue({
      id: "org-2",
      slug: "beta-12345678",
    });

    await createOrganizationWithOwnerCommand({ name: "Beta", ownerId: "u7" });

    expect(emitted).toEqual([
      {
        name: "organizations.created",
        organizationId: "org-2",
        actorUserId: "u7",
        payload: { name: "Beta", slug: "beta-12345678", ownerUserId: "u7" },
      },
    ]);
  });

  it("the event comes only after the write resolved", async () => {
    mockPrisma.organization.create.mockImplementation(async () => {
      timeline.push("write:start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      timeline.push("write:end");
      return { id: "org-1", slug: "acme" };
    });

    await createOrganizationWithOwnerCommand({ name: "Acme", ownerId: "u1" });

    expect(timeline).toEqual(["write:start", "write:end", "event"]);
  });

  it("a failing write rejects and emits no event", async () => {
    mockPrisma.organization.create.mockRejectedValue(new Error("db down"));

    await expect(
      createOrganizationWithOwnerCommand({ name: "Acme", ownerId: "u1" }),
    ).rejects.toThrow("db down");
    expect(emitted).toEqual([]);
  });

  it("two calls emit two events, one per organization", async () => {
    mockPrisma.organization.create
      .mockResolvedValueOnce({ id: "org-1", slug: "acme" })
      .mockResolvedValueOnce({ id: "org-2", slug: "acme-2" });

    await createOrganizationWithOwnerCommand({ name: "Acme", ownerId: "u1" });
    await createOrganizationWithOwnerCommand({ name: "Acme", ownerId: "u2" });

    expect(
      emitted.map(
        (event) => (event as { organizationId: string }).organizationId,
      ),
    ).toEqual(["org-1", "org-2"]);
  });
});
