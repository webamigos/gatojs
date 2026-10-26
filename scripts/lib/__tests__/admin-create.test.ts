import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
};
type OrgRow = { id: string; name: string; slug: string; createdAt: Date };
type MemberRow = { organizationId: string; userId: string; role: string };

const { db, mockPrisma, mockAuth } = vi.hoisted(() => {
  const db = {
    users: [] as UserRow[],
    orgs: [] as OrgRow[],
    members: [] as MemberRow[],
    seq: 0,
  };
  const mockPrisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => {
        return db.users.find((u) => u.email === where.email) ?? null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<UserRow>;
        }) => {
          const user = db.users.find((u) => u.id === where.id)!;
          Object.assign(user, data);
          return user;
        },
      ),
      count: vi.fn(async () => db.users.length),
    },
    organization: {
      findFirst: vi.fn(async () => db.orgs[0] ?? null),
      findUnique: vi.fn(
        async ({ where }: { where: { slug: string } }) =>
          db.orgs.find((o) => o.slug === where.slug) ?? null,
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            name: string;
            slug: string;
            members: { create: { userId: string; role: string } };
          };
        }) => {
          const org: OrgRow = {
            id: `org-${++db.seq}`,
            name: data.name,
            slug: data.slug,
            createdAt: new Date(),
          };
          db.orgs.push(org);
          db.members.push({
            organizationId: org.id,
            userId: data.members.create.userId,
            role: data.members.create.role,
          });
          return org;
        },
      ),
      count: vi.fn(async () => db.orgs.length),
    },
    member: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { organizationId: string; userId: string };
        }) =>
          db.members.find(
            (m) =>
              m.organizationId === where.organizationId &&
              m.userId === where.userId,
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: MemberRow }) => {
        db.members.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
  };
  const mockAuth = {
    api: {
      createUser: vi.fn(
        async ({
          body,
        }: {
          body: { email: string; name: string; role: string };
        }) => {
          const user: UserRow = {
            id: `user-${++db.seq}`,
            email: body.email,
            name: body.name,
            role: body.role,
            emailVerified: true,
          };
          db.users.push(user);
          return { user };
        },
      ),
    },
  };
  return { db, mockPrisma, mockAuth };
});

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/auth", () => ({ auth: mockAuth }));

import { AdminCreateError, adminCreate, slugifyOrgName } from "../admin-create";

const yes = { yes: true, confirm: async () => true };

describe("adminCreate", () => {
  beforeEach(() => {
    db.users.length = 0;
    db.orgs.length = 0;
    db.members.length = 0;
    db.seq = 0;
  });

  it("pierwsze uruchomienie tworzy admina i organizację", async () => {
    const r = await adminCreate({ email: "a@x.pl", ...yes });
    expect(r).toMatchObject({ createdUser: true, createdOrganization: true });
    expect(r.generatedPassword).toHaveLength(20);
    expect(mockAuth.api.createUser).toHaveBeenCalledWith({
      body: expect.objectContaining({
        email: "a@x.pl",
        name: "a",
        role: "admin",
        data: { emailVerified: true },
      }),
    });
    expect(db.orgs[0]).toMatchObject({ name: "WA App", slug: "wa-app" });
    expect(db.members).toEqual([
      { organizationId: r.organizationId, userId: r.userId, role: "owner" },
    ]);
  });

  it("drugie uruchomienie: brak duplikatów, rola admin, exit OK", async () => {
    await adminCreate({ email: "a@x.pl", ...yes });
    const r = await adminCreate({ email: "a@x.pl", ...yes });
    expect(r).toMatchObject({
      createdUser: false,
      createdOrganization: false,
      generatedPassword: null,
    });
    expect(db.orgs).toHaveLength(1);
    expect(db.users).toHaveLength(1);
    expect(db.members).toHaveLength(1);
    expect(db.users[0].role).toBe("admin");
  });

  it("istniejący użytkownik bez zgody → bez zmian", async () => {
    db.users.push({
      id: "u-b",
      email: "b@x.pl",
      name: "b",
      role: "user",
      emailVerified: true,
    });
    await expect(
      adminCreate({
        email: "b@x.pl",
        yes: false,
        confirm: async () => false,
      }),
    ).rejects.toThrow("Przerwano");
    expect(db.users[0].role).toBe("user");
    expect(db.orgs).toHaveLength(0);
    expect(db.members).toHaveLength(0);
  });

  it("istniejąca organizacja: admin zostaje jej ownerem, bez drugiej organizacji", async () => {
    db.orgs.push({
      id: "org-old",
      name: "Stara",
      slug: "stara",
      createdAt: new Date(0),
    });
    const r = await adminCreate({ email: "c@x.pl", ...yes });
    expect(r).toMatchObject({
      createdOrganization: false,
      organizationId: "org-old",
    });
    expect(db.orgs).toHaveLength(1);
    expect(db.members).toEqual([
      { organizationId: "org-old", userId: r.userId, role: "owner" },
    ]);
  });

  it("istniejący użytkownik: pyta o zgodę i nie zmienia hasła", async () => {
    db.users.push({
      id: "u-d",
      email: "d@x.pl",
      name: "d",
      role: "user",
      emailVerified: true,
    });
    const confirm = vi.fn(async () => true);
    const r = await adminCreate({
      email: "d@x.pl",
      password: "secret-password",
      yes: false,
      confirm,
    });
    expect(confirm).toHaveBeenCalledWith(
      "Użytkownik d@x.pl istnieje. Nadać rolę admin? [t/N]",
    );
    expect(mockAuth.api.createUser).not.toHaveBeenCalled();
    expect(db.users[0].role).toBe("admin");
    expect(r.generatedPassword).toBeNull();
  });

  it("używa podanego hasła, nazwy i nazwy organizacji", async () => {
    const r = await adminCreate({
      email: "e@x.pl",
      password: "my-password-1",
      name: "Ewa",
      orgName: "Zażółć Gęślą Jaźń!",
      ...yes,
    });
    expect(r.generatedPassword).toBeNull();
    expect(mockAuth.api.createUser).toHaveBeenCalledWith({
      body: expect.objectContaining({ password: "my-password-1", name: "Ewa" }),
    });
    expect(db.orgs[0].slug).toBe("zazolc-gesla-jazn");
  });
});

describe("adminCreate partial failure and slug fallback", () => {
  beforeEach(() => {
    db.users.length = 0;
    db.orgs.length = 0;
    db.members.length = 0;
    db.seq = 0;
  });

  it("błąd organizacji po utworzeniu użytkownika ujawnia wygenerowane hasło", async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("db down"));
    const error = await adminCreate({ email: "f@x.pl", ...yes }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AdminCreateError);
    expect((error as AdminCreateError).message).toBe("db down");
    expect((error as AdminCreateError).generatedPassword).toHaveLength(20);
    expect(db.users).toHaveLength(1);
  });

  it("pusty slug wraca do project.slug", async () => {
    await adminCreate({ email: "g@x.pl", orgName: "!!!", ...yes });
    expect(db.orgs[0].slug).toBe("wa-app");
  });

  it("normalizuje email do małych liter", async () => {
    await adminCreate({ email: "H@X.pl", ...yes });
    const r = await adminCreate({ email: "h@x.pl", ...yes });
    expect(r.createdUser).toBe(false);
    expect(db.users).toHaveLength(1);
  });
});

describe("slugifyOrgName", () => {
  it("zwraca ascii, małe litery i myślniki", () => {
    expect(slugifyOrgName("  Łódź & Co.  ")).toBe("lodz-co");
    expect(slugifyOrgName("WA App")).toBe("wa-app");
  });
});
