import { describe, expect, it } from "vitest";
import { CORE_MODULE_KEYS, coreClientModules } from "@/test/core-modules";
import { canAccessModule } from "../permissions";
import { getNavEntries } from "@/shared/lib/modules/nav";

type GlobalRole = "user" | "admin" | "superadmin";
type MembershipRole = "owner" | "admin" | "member" | null;
type ModuleKey = "auth" | "organizations" | "dashboard" | "account" | "users";
type MembershipColumn = "owner" | "admin" | "member" | "none";

const OK = "OK";
const NOT_FOUND = "NOT_FOUND";
const REDIRECT_NO_ORGANIZATION = "REDIRECT_NO_ORGANIZATION";
const OK_GLOBAL_ADMIN_REDIRECTED_EARLIER = "OK_GLOBAL_ADMIN_REDIRECTED_EARLIER";

type Cell =
  | typeof OK
  | typeof NOT_FOUND
  | typeof REDIRECT_NO_ORGANIZATION
  | typeof OK_GLOBAL_ADMIN_REDIRECTED_EARLIER;

const CAN_ACCESS_MODULE: Record<Cell, boolean> = {
  OK: true,
  NOT_FOUND: false,
  REDIRECT_NO_ORGANIZATION: false,
  OK_GLOBAL_ADMIN_REDIRECTED_EARLIER: true,
};

type MatrixRow = Record<GlobalRole, Record<MembershipColumn, Cell>>;

const MATRIX: Record<"single" | "multi", Record<ModuleKey, MatrixRow>> = {
  single: {
    auth: {
      user: { owner: OK, admin: OK, member: OK, none: OK },
      admin: { owner: OK, admin: OK, member: OK, none: OK },
      superadmin: { owner: OK, admin: OK, member: OK, none: OK },
    },
    organizations: {
      user: { owner: OK, admin: OK, member: OK, none: OK },
      admin: { owner: OK, admin: OK, member: OK, none: OK },
      superadmin: { owner: OK, admin: OK, member: OK, none: OK },
    },
    dashboard: {
      user: {
        owner: OK,
        admin: OK,
        member: OK,
        none: REDIRECT_NO_ORGANIZATION,
      },
      admin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
      superadmin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
    },
    account: {
      user: {
        owner: OK,
        admin: OK,
        member: OK,
        none: REDIRECT_NO_ORGANIZATION,
      },
      admin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
      superadmin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
    },
    users: {
      user: {
        owner: NOT_FOUND,
        admin: NOT_FOUND,
        member: NOT_FOUND,
        none: REDIRECT_NO_ORGANIZATION,
      },
      admin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
      superadmin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
    },
  },
  multi: {
    auth: {
      user: { owner: OK, admin: OK, member: OK, none: OK },
      admin: { owner: OK, admin: OK, member: OK, none: OK },
      superadmin: { owner: OK, admin: OK, member: OK, none: OK },
    },
    organizations: {
      user: { owner: OK, admin: OK, member: OK, none: OK },
      admin: { owner: OK, admin: OK, member: OK, none: OK },
      superadmin: { owner: OK, admin: OK, member: OK, none: OK },
    },
    dashboard: {
      user: {
        owner: OK,
        admin: OK,
        member: OK,
        none: REDIRECT_NO_ORGANIZATION,
      },
      admin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
      superadmin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
    },
    account: {
      user: {
        owner: OK,
        admin: OK,
        member: OK,
        none: REDIRECT_NO_ORGANIZATION,
      },
      admin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
      superadmin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
    },
    users: {
      user: {
        owner: OK,
        admin: OK,
        member: NOT_FOUND,
        none: REDIRECT_NO_ORGANIZATION,
      },
      admin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
      superadmin: {
        owner: OK,
        admin: OK,
        member: OK,
        none: OK_GLOBAL_ADMIN_REDIRECTED_EARLIER,
      },
    },
  },
};

const DASHBOARD = { href: "/dashboard", labelPath: "dashboard.nav" };
const USERS = { href: "/users", labelPath: "users.nav" };
const MEMBERS = { href: "/users", labelPath: "users.nav-members" };
const ACCOUNT = { href: "/account", labelPath: "account.nav" };

type NavItem = { href: string; labelPath: string };
type NavRow = Record<MembershipColumn, NavItem[]>;

const NAV: Record<"single" | "multi", Record<GlobalRole, NavRow>> = {
  single: {
    user: {
      owner: [DASHBOARD, ACCOUNT],
      admin: [DASHBOARD, ACCOUNT],
      member: [DASHBOARD, ACCOUNT],
      none: [],
    },
    admin: {
      owner: [DASHBOARD, USERS, ACCOUNT],
      admin: [DASHBOARD, USERS, ACCOUNT],
      member: [DASHBOARD, USERS, ACCOUNT],
      none: [DASHBOARD, USERS, ACCOUNT],
    },
    superadmin: {
      owner: [DASHBOARD, USERS, ACCOUNT],
      admin: [DASHBOARD, USERS, ACCOUNT],
      member: [DASHBOARD, USERS, ACCOUNT],
      none: [DASHBOARD, USERS, ACCOUNT],
    },
  },
  multi: {
    user: {
      owner: [DASHBOARD, MEMBERS, ACCOUNT],
      admin: [DASHBOARD, MEMBERS, ACCOUNT],
      member: [DASHBOARD, ACCOUNT],
      none: [],
    },
    admin: {
      owner: [DASHBOARD, USERS, ACCOUNT],
      admin: [DASHBOARD, USERS, ACCOUNT],
      member: [DASHBOARD, USERS, ACCOUNT],
      none: [DASHBOARD, USERS, ACCOUNT],
    },
    superadmin: {
      owner: [DASHBOARD, USERS, ACCOUNT],
      admin: [DASHBOARD, USERS, ACCOUNT],
      member: [DASHBOARD, USERS, ACCOUNT],
      none: [DASHBOARD, USERS, ACCOUNT],
    },
  },
};

const MEMBERSHIP: Record<MembershipColumn, MembershipRole> = {
  owner: "owner",
  admin: "admin",
  member: "member",
  none: null,
};

const GLOBAL_ROLES: GlobalRole[] = ["user", "admin", "superadmin"];
const MEMBERSHIP_COLUMNS: MembershipColumn[] = [
  "owner",
  "admin",
  "member",
  "none",
];
const MODULE_KEYS: ModuleKey[] = [
  "auth",
  "organizations",
  "dashboard",
  "account",
  "users",
];
const MODES = [
  { mode: "single", multiOrg: false },
  { mode: "multi", multiOrg: true },
] as const;

const moduleCases = MODES.flatMap(({ mode, multiOrg }) =>
  MODULE_KEYS.flatMap((moduleKey) =>
    GLOBAL_ROLES.flatMap((userRole) =>
      MEMBERSHIP_COLUMNS.map((column) => ({
        moduleKey,
        userRole,
        column,
        multiOrg,
        cell: MATRIX[mode][moduleKey][userRole][column],
      })),
    ),
  ),
);

const navCases = MODES.flatMap(({ mode, multiOrg }) =>
  GLOBAL_ROLES.flatMap((userRole) =>
    MEMBERSHIP_COLUMNS.map((column) => ({
      userRole,
      column,
      multiOrg,
      expected: NAV[mode][userRole][column],
    })),
  ),
);

function registryModule(key: ModuleKey) {
  const found = coreClientModules.find((moduleDef) => moduleDef.key === key);
  if (!found) {
    throw new Error(`Brak modułu ${key} w rejestrze`);
  }
  return found;
}

describe("macierz dostępu do modułów", () => {
  it("moduły rdzenia to dokładnie 5 modułów z macierzy", () => {
    expect(CORE_MODULE_KEYS).toEqual([
      "account",
      "auth",
      "dashboard",
      "organizations",
      "users",
    ]);
    expect(coreClientModules.map((moduleDef) => moduleDef.key).sort()).toEqual([
      "account",
      "auth",
      "dashboard",
      "organizations",
      "users",
    ]);
  });

  it("macierz obejmuje 120 komórek: 5 modułów × 3 role globalne × 4 role w organizacji × 2 tryby", () => {
    expect(moduleCases).toHaveLength(120);
  });

  it.each(moduleCases)(
    "canAccessModule($moduleKey, userRole=$userRole, orgRole=$column, multiOrg=$multiOrg) → $cell",
    ({ moduleKey, userRole, column, multiOrg, cell }) => {
      expect(
        canAccessModule(registryModule(moduleKey), {
          userRole,
          orgRole: MEMBERSHIP[column],
          multiOrg,
        }),
      ).toBe(CAN_ACCESS_MODULE[cell]);
    },
  );

  describe("zalogowany bez organizacji (orgRole = null)", () => {
    it.each([
      ["dashboard", false],
      ["dashboard", true],
      ["account", false],
      ["account", true],
      ["users", false],
      ["users", true],
    ] as const)(
      "zwykły użytkownik: canAccessModule(%s, multiOrg=%j) odmawia, requireModuleAccess przekierowuje na /no-organization",
      (moduleKey, multiOrg) => {
        expect(
          canAccessModule(registryModule(moduleKey), {
            userRole: "user",
            orgRole: null,
            multiOrg,
          }),
        ).toBe(false);
      },
    );

    it.each([
      ["admin", "dashboard"],
      ["admin", "account"],
      ["admin", "users"],
      ["superadmin", "dashboard"],
      ["superadmin", "account"],
      ["superadmin", "users"],
    ] as const)(
      "%s globalny: canAccessModule(%s) przyznaje dostęp, bo przekierowanie na /no-organization robi wcześniej requireModuleAccess (decyzja 1)",
      (userRole, moduleKey) => {
        expect(
          canAccessModule(registryModule(moduleKey), {
            userRole,
            orgRole: null,
            multiOrg: false,
          }),
        ).toBe(true);
      },
    );

    it.each([["auth"], ["organizations"]] as const)(
      "moduł publiczny %s jest dostępny dla zwykłego użytkownika",
      (moduleKey) => {
        expect(
          canAccessModule(registryModule(moduleKey), {
            userRole: "user",
            orgRole: null,
            multiOrg: true,
          }),
        ).toBe(true);
      },
    );
  });

  describe("MULTI_ORG=false: users tylko dla admina globalnego (decyzja 2)", () => {
    it.each([["owner"], ["admin"]] as const)(
      "%s organizacji bez roli globalnej nie ma dostępu do users",
      (orgRole) => {
        expect(
          canAccessModule(registryModule("users"), {
            userRole: "user",
            orgRole,
            multiOrg: false,
          }),
        ).toBe(false);
      },
    );

    it("superadmin jako member organizacji ma dostęp do users", () => {
      expect(
        canAccessModule(registryModule("users"), {
          userRole: "superadmin",
          orgRole: "member",
          multiOrg: false,
        }),
      ).toBe(true);
    });
  });
});

describe("nawigacja równa macierzy (decyzja 3)", () => {
  it("tabela nawigacji obejmuje 24 kombinacje ról i trybów", () => {
    expect(navCases).toHaveLength(24);
  });

  it.each(navCases)(
    "getNavEntries(userRole=$userRole, orgRole=$column, multiOrg=$multiOrg) zwraca dokładnie pozycje modułów z dostępem",
    ({ userRole, column, multiOrg, expected }) => {
      const entries = getNavEntries(
        { userRole, orgRole: MEMBERSHIP[column], multiOrg },
        coreClientModules,
      );

      expect(
        entries.map(({ href, labelPath }) => ({ href, labelPath })),
      ).toEqual(expected);
    },
  );

  it.each(
    (["admin", "superadmin"] as const).flatMap((userRole) =>
      MEMBERSHIP_COLUMNS.flatMap((column) =>
        [false, true].map((multiOrg) => ({ userRole, column, multiOrg })),
      ),
    ),
  )(
    "etykieta Członkowie (users.nav-members) nie pojawia się dla $userRole (orgRole=$column, multiOrg=$multiOrg)",
    ({ userRole, column, multiOrg }) => {
      const labels = getNavEntries(
        { userRole, orgRole: MEMBERSHIP[column], multiOrg },
        coreClientModules,
      ).map((entry) => entry.labelPath);

      expect(labels).not.toContain("users.nav-members");
      expect(labels).toContain("users.nav");
    },
  );
});
