import { test } from "@fast-check/vitest";
import fc from "fast-check";
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
          body: {
            email: string;
            name: string;
            role: string;
            password?: string;
          };
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
vi.mock("@/shared/config/project", () => ({
  project: { name: "Test Projekt", slug: "test-projekt" },
}));

const { emitted, transaction, steps, setupHooks } = vi.hoisted(() => ({
  emitted: [] as { event: unknown; insideTransaction: boolean }[],
  transaction: { open: false },
  steps: [] as string[],
  setupHooks: {
    seed: vi.fn(),
    onOrganizationCreated: vi.fn(),
  },
}));

vi.mock("@/modules.generated", () => ({
  moduleEvents: [],
  moduleSubscribers: [
    {
      module: "probe",
      value: {
        "organizations.created": {
          id: "probe.record",
          run: (event: unknown) => {
            steps.push(
              `event:${(event as { organizationId: string }).organizationId}`,
            );
            emitted.push({ event, insideTransaction: transaction.open });
          },
        },
      },
    },
  ],
  moduleSetups: [
    {
      module: "notes",
      version: "1.2.0",
      value: {
        seed: setupHooks.seed,
        onOrganizationCreated: setupHooks.onOrganizationCreated,
      },
    },
  ],
}));

import {
  AdminCreateError,
  adminCreate,
  slugifyOrgName,
  type AdminCreateOptions,
} from "../admin-create";

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
    expect(db.orgs[0]).toMatchObject({
      name: "Test Projekt",
      slug: "test-projekt",
    });
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
    ).rejects.toThrow("Aborted");
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
      "User d@x.pl already exists. Grant role admin? [y/N]",
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
    expect(db.orgs[0].slug).toBe("test-projekt");
  });

  it("normalizuje email do małych liter", async () => {
    await adminCreate({ email: "H@X.pl", ...yes });
    const r = await adminCreate({ email: "h@x.pl", ...yes });
    expect(r.createdUser).toBe(false);
    expect(db.users).toHaveLength(1);
  });
});

describe("adminCreate z rolą globalną", () => {
  beforeEach(() => {
    db.users.length = 0;
    db.orgs.length = 0;
    db.members.length = 0;
    db.seq = 0;
  });

  function seedUser(email: string, role: string) {
    db.users.push({
      id: `u-${email}`,
      email,
      name: email.split("@")[0],
      role,
      emailVerified: true,
    });
  }

  it("nowe konto bez roli dostaje rolę admin", async () => {
    await adminCreate({ email: "n@x.pl", ...yes });
    expect(mockAuth.api.createUser).toHaveBeenCalledWith({
      body: expect.objectContaining({ role: "admin" }),
    });
    expect(db.users[0].role).toBe("admin");
  });

  it("nowe konto z rolą superadmin dostaje rolę superadmin", async () => {
    await adminCreate({ email: "s@x.pl", role: "superadmin", ...yes });
    expect(mockAuth.api.createUser).toHaveBeenCalledWith({
      body: expect.objectContaining({ role: "superadmin" }),
    });
    expect(db.users[0].role).toBe("superadmin");
  });

  it("nowe konto z rolą admin dostaje rolę admin", async () => {
    await adminCreate({ email: "a2@x.pl", role: "admin", ...yes });
    expect(mockAuth.api.createUser).toHaveBeenCalledWith({
      body: expect.objectContaining({ role: "admin" }),
    });
  });

  it("istniejący user bez roli: pyta o rolę admin i ją nadaje", async () => {
    seedUser("u1@x.pl", "user");
    const confirm = vi.fn(async () => true);
    await adminCreate({ email: "u1@x.pl", yes: false, confirm });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      "User u1@x.pl already exists. Grant role admin? [y/N]",
    );
    expect(db.users[0].role).toBe("admin");
  });

  it("istniejący user z rolą superadmin: pyta o rolę superadmin i ją nadaje", async () => {
    seedUser("u2@x.pl", "user");
    const confirm = vi.fn(async () => true);
    await adminCreate({
      email: "u2@x.pl",
      role: "superadmin",
      yes: false,
      confirm,
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      "User u2@x.pl already exists. Grant role superadmin? [y/N]",
    );
    expect(mockAuth.api.createUser).not.toHaveBeenCalled();
    expect(db.users[0].role).toBe("superadmin");
  });

  it("istniejący admin z rolą superadmin: pyta i podnosi do superadmin", async () => {
    seedUser("ad@x.pl", "admin");
    const confirm = vi.fn(async () => true);
    await adminCreate({
      email: "ad@x.pl",
      role: "superadmin",
      yes: false,
      confirm,
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      "User ad@x.pl already exists. Grant role superadmin? [y/N]",
    );
    expect(db.users[0].role).toBe("superadmin");
  });

  it("odmowa podniesienia admina do superadmin → Przerwano, rola i organizacje bez zmian", async () => {
    seedUser("ad2@x.pl", "admin");
    await expect(
      adminCreate({
        email: "ad2@x.pl",
        role: "superadmin",
        yes: false,
        confirm: async () => false,
      }),
    ).rejects.toThrow("Aborted");
    expect(db.users[0].role).toBe("admin");
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(db.orgs).toHaveLength(0);
    expect(db.members).toHaveLength(0);
  });

  it("odmowa nadania superadmin userowi → Przerwano, rola bez zmian", async () => {
    seedUser("u3@x.pl", "user");
    await expect(
      adminCreate({
        email: "u3@x.pl",
        role: "superadmin",
        yes: false,
        confirm: async () => false,
      }),
    ).rejects.toThrow("Aborted");
    expect(db.users[0].role).toBe("user");
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(db.members).toHaveLength(0);
  });

  it("yes: true nadaje rolę superadmin bez pytania", async () => {
    seedUser("u4@x.pl", "user");
    const confirm = vi.fn(async () => false);
    await adminCreate({
      email: "u4@x.pl",
      role: "superadmin",
      yes: true,
      confirm,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(db.users[0].role).toBe("superadmin");
  });

  it("yes: true podnosi admina do superadmin bez pytania", async () => {
    seedUser("ad3@x.pl", "admin");
    const confirm = vi.fn(async () => false);
    await adminCreate({
      email: "ad3@x.pl",
      role: "superadmin",
      yes: true,
      confirm,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(db.users[0].role).toBe("superadmin");
  });

  it.each([
    ["bez roli", undefined],
    ["z rolą admin", "admin" as const],
  ])(
    "istniejący superadmin %s: bez pytania i bez obniżenia roli",
    async (_label, role) => {
      seedUser("sa@x.pl", "superadmin");
      const confirm = vi.fn(async () => true);
      const r = await adminCreate({
        email: "sa@x.pl",
        role,
        yes: true,
        confirm,
      });
      expect(confirm).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockAuth.api.createUser).not.toHaveBeenCalled();
      expect(db.users[0].role).toBe("superadmin");
      expect(db.members).toEqual([
        {
          organizationId: r.organizationId,
          userId: "u-sa@x.pl",
          role: "owner",
        },
      ]);
    },
  );

  it.each([
    ["bez roli, z yes", undefined, true],
    ["bez roli, bez yes", undefined, false],
    ["z rolą admin, z yes", "admin" as const, true],
    ["z rolą admin, bez yes", "admin" as const, false],
  ])(
    'istniejące konto z rolą "user,superadmin" %s: bez pytania i bez obniżenia roli',
    async (_label, role, yesFlag) => {
      seedUser("multi@x.pl", "user,superadmin");
      const confirm = vi.fn(async () => true);
      const r = await adminCreate({
        email: "multi@x.pl",
        role,
        yes: yesFlag,
        confirm,
      });
      expect(confirm).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockAuth.api.createUser).not.toHaveBeenCalled();
      expect(db.users[0].role).toBe("user,superadmin");
      expect(db.members).toEqual([
        {
          organizationId: r.organizationId,
          userId: "u-multi@x.pl",
          role: "owner",
        },
      ]);
    },
  );

  it("istniejący superadmin bez roli i bez yes: nie pyta i nie obniża roli", async () => {
    seedUser("sa2@x.pl", "superadmin");
    const confirm = vi.fn(async () => true);
    await adminCreate({ email: "sa2@x.pl", yes: false, confirm });
    expect(confirm).not.toHaveBeenCalled();
    expect(db.users[0].role).toBe("superadmin");
  });

  it("istniejący superadmin z rolą superadmin: bez pytania, rola bez zmian", async () => {
    seedUser("sa3@x.pl", "superadmin");
    const confirm = vi.fn(async () => true);
    await adminCreate({
      email: "sa3@x.pl",
      role: "superadmin",
      yes: false,
      confirm,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(db.users[0].role).toBe("superadmin");
  });

  it("istniejący admin bez roli: bez pytania, rola bez zmian", async () => {
    seedUser("ad4@x.pl", "admin");
    const confirm = vi.fn(async () => true);
    await adminCreate({ email: "ad4@x.pl", yes: false, confirm });
    expect(confirm).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(db.users[0].role).toBe("admin");
  });

  it.each([
    ["nowego konta", null],
    ["istniejącego usera", "user"],
  ])(
    "nieznana rola dla %s → błąd przed jakimkolwiek zapisem",
    async (_label, existingRole) => {
      if (existingRole) {
        seedUser("r@x.pl", existingRole);
      }
      const confirm = vi.fn(async () => true);
      await expect(
        adminCreate({
          email: "r@x.pl",
          role: "root" as unknown as AdminCreateOptions["role"],
          yes: true,
          confirm,
        }),
      ).rejects.toThrow("Unknown role: root (allowed: admin, superadmin)");
      expect(confirm).not.toHaveBeenCalled();
      expect(mockAuth.api.createUser).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.organization.create).not.toHaveBeenCalled();
      expect(mockPrisma.member.create).not.toHaveBeenCalled();
      expect(db.users).toHaveLength(existingRole ? 1 : 0);
      expect(db.orgs).toHaveLength(0);
      expect(db.members).toHaveLength(0);
    },
  );

  it("komunikat błędu nieznanej roli jest dokładny", async () => {
    const error = await adminCreate({
      email: "r2@x.pl",
      role: "root" as unknown as AdminCreateOptions["role"],
      ...yes,
    }).catch((e: unknown) => e);
    expect((error as Error).message).toBe(
      "Unknown role: root (allowed: admin, superadmin)",
    );
  });

  it.each([
    ["admin", "admin" as const],
    ["superadmin", "superadmin" as const],
  ])(
    "nowe konto z rolą %s zostaje ownerem nowej organizacji",
    async (_label, role) => {
      const r = await adminCreate({ email: "o@x.pl", role, ...yes });
      expect(r.createdOrganization).toBe(true);
      expect(db.orgs).toHaveLength(1);
      expect(db.members).toEqual([
        { organizationId: r.organizationId, userId: r.userId, role: "owner" },
      ]);
    },
  );

  it.each([
    ["admin", "admin" as const],
    ["superadmin", "superadmin" as const],
  ])(
    "rola %s zostaje ownerem najstarszej istniejącej organizacji",
    async (_label, role) => {
      db.orgs.push({
        id: "org-first",
        name: "Pierwsza",
        slug: "pierwsza",
        createdAt: new Date(0),
      });
      seedUser("o2@x.pl", "user");
      const r = await adminCreate({ email: "o2@x.pl", role, ...yes });
      expect(r).toMatchObject({
        organizationId: "org-first",
        createdOrganization: false,
      });
      expect(db.orgs).toHaveLength(1);
      expect(db.members).toEqual([
        { organizationId: "org-first", userId: "u-o2@x.pl", role: "owner" },
      ]);
    },
  );
});

function lastCreateUserPassword(): unknown {
  const calls = mockAuth.api.createUser.mock.calls;
  return (calls[calls.length - 1][0] as { body: { password?: string } }).body
    .password;
}

describe("adminCreate: puste hasło (R36)", () => {
  beforeEach(() => {
    db.users.length = 0;
    db.orgs.length = 0;
    db.members.length = 0;
    db.seq = 0;
  });

  it.each([
    ["pusty napis", ""],
    ["brak pola", undefined],
    ["same spacje", "   "],
    ["spacje, tabulator i nowa linia", " \t\n "],
  ])(
    "hasło: %s → do createUser trafia wygenerowane hasło, zwrócone jako generatedPassword",
    async (_label, password) => {
      const r = await adminCreate({
        email: "a@example.com",
        password,
        ...yes,
      });
      const passed = lastCreateUserPassword();
      expect(typeof passed).toBe("string");
      expect((passed as string).length).toBe(20);
      expect((passed as string).trim()).toBe(passed);
      expect(r.generatedPassword).not.toBeNull();
      expect(r.generatedPassword).toBe(passed);
    },
  );

  it("podane hasło trafia do createUser bez zmian i nie jest zwracane jako wygenerowane", async () => {
    const r = await adminCreate({
      email: "a@example.com",
      password: "Haslo-123456",
      ...yes,
    });
    expect(lastCreateUserPassword()).toBe("Haslo-123456");
    expect(r.generatedPassword).toBeNull();
  });

  it("istniejące konto z pustym hasłem: createUser nie jest wołany, generatedPassword to null", async () => {
    db.users.push({
      id: "u-x",
      email: "x@example.com",
      name: "x",
      role: "user",
      emailVerified: true,
    });
    const r = await adminCreate({
      email: "x@example.com",
      password: "",
      ...yes,
    });
    expect(mockAuth.api.createUser).not.toHaveBeenCalled();
    expect(r.generatedPassword).toBeNull();
  });

  test.prop(
    [
      fc
        .array(fc.constantFrom(" ", "\t", "\n"), { maxLength: 8 })
        .map((chars) => chars.join("")),
    ],
    { numRuns: 30 },
  )(
    "dowolny ciąg samych białych znaków daje wygenerowane, niepuste hasło równe zwróconemu",
    async (blank) => {
      db.users.length = 0;
      db.orgs.length = 0;
      db.members.length = 0;
      mockAuth.api.createUser.mockClear();
      const r = await adminCreate({
        email: "p@example.com",
        password: blank,
        ...yes,
      });
      const passed = lastCreateUserPassword();
      expect(passed).not.toBe(blank);
      expect((passed as string).length).toBe(20);
      expect(r.generatedPassword).toBe(passed);
    },
  );

  test.prop([fc.stringMatching(/^[A-Za-z0-9!@#-]{1,30}$/)], { numRuns: 30 })(
    "hasło z widocznych znaków jest przekazane dokładnie i nie jest generowane",
    async (password) => {
      db.users.length = 0;
      db.orgs.length = 0;
      db.members.length = 0;
      mockAuth.api.createUser.mockClear();
      const r = await adminCreate({
        email: "q@example.com",
        password,
        ...yes,
      });
      expect(lastCreateUserPassword()).toBe(password);
      expect(r.generatedPassword).toBeNull();
    },
  );
});

describe("adminCreate: organizations.created", () => {
  beforeEach(() => {
    db.users.length = 0;
    db.orgs.length = 0;
    db.members.length = 0;
    db.seq = 0;
    emitted.length = 0;
    transaction.open = false;
  });

  function trackTransaction() {
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => unknown) => {
        transaction.open = true;
        try {
          return await fn(mockPrisma);
        } finally {
          transaction.open = false;
        }
      },
    );
  }

  it("creating the first organization emits one organizations.created with the admin as owner and actor", async () => {
    const r = await adminCreate({
      email: "a@x.pl",
      orgName: "Acme Corp",
      ...yes,
    });

    expect(r).toMatchObject({ userId: "user-1", organizationId: "org-2" });
    expect(emitted.map(({ event }) => event)).toEqual([
      {
        name: "organizations.created",
        organizationId: "org-2",
        actorUserId: "user-1",
        serviceMode: false,
        payload: {
          name: "Acme Corp",
          slug: "acme-corp",
          ownerUserId: "user-1",
        },
      },
    ]);
  });

  it("the event is emitted after the transaction resolved, not inside its callback", async () => {
    trackTransaction();

    await adminCreate({ email: "a@x.pl", ...yes });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].insideTransaction).toBe(false);
  });

  it("an organization name without a slug carries the project slug fallback in the payload", async () => {
    await adminCreate({ email: "a@x.pl", orgName: "!!!", ...yes });

    expect(emitted.map(({ event }) => event)).toEqual([
      {
        name: "organizations.created",
        organizationId: "org-2",
        actorUserId: "user-1",
        serviceMode: false,
        payload: { name: "!!!", slug: "test-projekt", ownerUserId: "user-1" },
      },
    ]);
  });

  it("joining the existing oldest organization emits no event", async () => {
    db.orgs.push({
      id: "org-old",
      name: "Stara",
      slug: "stara",
      createdAt: new Date(0),
    });

    const r = await adminCreate({ email: "c@x.pl", ...yes });

    expect(r).toMatchObject({ createdOrganization: false });
    expect(emitted).toEqual([]);
  });

  it("a second run against the organization it created emits no second event", async () => {
    await adminCreate({ email: "a@x.pl", ...yes });
    await adminCreate({ email: "a@x.pl", ...yes });

    expect(emitted).toHaveLength(1);
  });

  it("a failing transaction emits no event", async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("db down"));

    await expect(adminCreate({ email: "a@x.pl", ...yes })).rejects.toThrow(
      "db down",
    );
    expect(emitted).toEqual([]);
  });
});

describe("adminCreate: seed hooks", () => {
  beforeEach(() => {
    db.users.length = 0;
    db.orgs.length = 0;
    db.members.length = 0;
    db.seq = 0;
    emitted.length = 0;
    steps.length = 0;
    transaction.open = false;
    setupHooks.seed.mockReset();
    setupHooks.seed.mockImplementation(
      (context: { organizationId: string }) => {
        steps.push(`seed:${context.organizationId}`);
      },
    );
    setupHooks.onOrganizationCreated.mockReset();
  });

  it("runs the seed hooks once for the created organization with exactly its id", async () => {
    const r = await adminCreate({ email: "a@x.pl", ...yes });

    expect(r.organizationId).toBe("org-2");
    expect(setupHooks.seed.mock.calls).toStrictEqual([
      [{ organizationId: "org-2" }],
    ]);
  });

  it("runs the seed hooks after organizations.created was emitted", async () => {
    await adminCreate({ email: "a@x.pl", ...yes });

    expect(steps).toEqual(["event:org-2", "seed:org-2"]);
  });

  it("runs the seed hooks for the joined oldest organization, without an event", async () => {
    db.orgs.push({
      id: "org-old",
      name: "Stara",
      slug: "stara",
      createdAt: new Date(0),
    });

    await adminCreate({ email: "c@x.pl", ...yes });

    expect(steps).toEqual(["seed:org-old"]);
    expect(setupHooks.seed.mock.calls).toStrictEqual([
      [{ organizationId: "org-old" }],
    ]);
  });

  it("a second run seeds the same organization again", async () => {
    await adminCreate({ email: "a@x.pl", ...yes });
    await adminCreate({ email: "a@x.pl", ...yes });

    expect(steps).toEqual(["event:org-2", "seed:org-2", "seed:org-2"]);
  });

  it("does not call onOrganizationCreated itself", async () => {
    await adminCreate({ email: "a@x.pl", ...yes });

    expect(setupHooks.onOrganizationCreated).not.toHaveBeenCalled();
  });

  it("a failing seed does not fail adminCreate", async () => {
    setupHooks.seed.mockRejectedValue(new Error("seed broke"));

    await expect(
      adminCreate({ email: "a@x.pl", ...yes }),
    ).resolves.toMatchObject({
      organizationId: "org-2",
      createdOrganization: true,
    });
  });

  it("a failing transaction runs no seed", async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("db down"));

    await expect(adminCreate({ email: "a@x.pl", ...yes })).rejects.toThrow(
      "db down",
    );
    expect(setupHooks.seed).not.toHaveBeenCalled();
  });

  it("an aborted run seeds nothing", async () => {
    db.users.push({
      id: "u-b",
      email: "b@x.pl",
      name: "b",
      role: "user",
      emailVerified: true,
    });

    await expect(
      adminCreate({ email: "b@x.pl", yes: false, confirm: async () => false }),
    ).rejects.toThrow("Aborted");
    expect(setupHooks.seed).not.toHaveBeenCalled();
  });
});

describe("slugifyOrgName", () => {
  it("zwraca ascii, małe litery i myślniki", () => {
    expect(slugifyOrgName("  Łódź & Co.  ")).toBe("lodz-co");
    expect(slugifyOrgName("WA App")).toBe("wa-app");
  });
});
