import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import type { ColumnDef } from "@/components/ui/data-table";
import type { OrgRole, UserRole } from "@/shared/lib/auth/roles";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import type {
  RegisteredContribution,
  SlotComponentLoader,
  SlotComponentProps,
} from "@/shared/lib/modules/slots";
import { pl } from "date-fns/locale";
import usersPl from "../../i18n/pl.json";
import usersEn from "../../i18n/en.json";
import type { UserAccountListItem } from "../../contracts/user-account.types";

const { registry } = vi.hoisted(() => ({ registry: [] as unknown[] }));

vi.mock("@/modules.client.generated", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/modules.client.generated")>();
  const extra: ModuleDef[] = [
    { key: "crm", nav: [], routePrefixes: ["/crm"] },
    {
      key: "sales",
      nav: [],
      routePrefixes: ["/sales"],
      adminOnly: true,
      multiOrgRoles: ["owner"],
    },
  ];
  return {
    ...original,
    clientModules: [...original.clientModules, ...extra],
    clientModuleSlots: registry,
  };
});

import { buildUserAccountColumns } from "../user-account-columns";

type Translate = Parameters<typeof buildUserAccountColumns>[0];

const t = ((key: string) => `t:${key}`) as Translate;
const plMessages: Record<string, string> = usersPl;
const tPl = ((key: string) => plMessages[key] ?? `missing:${key}`) as Translate;

const SUPERADMIN_VIEWER = {
  userId: "me",
  role: "superadmin",
  adminImpersonation: false,
  organizationId: "org-1",
  orgRole: null,
  multiOrg: false,
} as const;

const columns = buildUserAccountColumns(
  t,
  pl,
  SUPERADMIN_VIEWER,
  null,
  vi.fn(),
  [],
);
const dataColumns = columns.filter((column) => column.id !== "actions");

function renderRoleCell(role: string) {
  const roleColumn = buildUserAccountColumns(
    tPl,
    pl,
    SUPERADMIN_VIEWER,
    null,
    vi.fn(),
    [],
  ).find((column) => column.header === usersPl["col-role"]);
  if (!roleColumn || typeof roleColumn.cell !== "function") {
    throw new Error("Brak kolumny roli");
  }
  const renderCell = roleColumn.cell as (context: {
    row: { original: UserAccountListItem };
  }) => ReactNode;
  const original = {
    id: "u1",
    name: "Jan",
    email: "jan@firma.pl",
    role,
    emailVerified: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  } as UserAccountListItem;
  return render(<>{renderCell({ row: { original } })}</>);
}

interface ActionsViewer {
  currentUserId: string;
  currentUserRole: UserRole;
  adminImpersonation: boolean;
  pendingId: string | null;
  organizationId?: string;
  orgRole?: OrgRole | null;
  multiOrg?: boolean;
}

function renderActionsCell(
  viewer: ActionsViewer,
  target: { id: string; role: UserRole },
) {
  const actionsColumn = buildUserAccountColumns(
    tPl,
    pl,
    {
      userId: viewer.currentUserId,
      role: viewer.currentUserRole,
      adminImpersonation: viewer.adminImpersonation,
      organizationId: viewer.organizationId ?? "org-1",
      orgRole: viewer.orgRole ?? null,
      multiOrg: viewer.multiOrg ?? false,
    },
    viewer.pendingId,
    vi.fn(),
    [],
  ).find((column) => column.id === "actions");
  if (!actionsColumn || typeof actionsColumn.cell !== "function") {
    throw new Error("Brak kolumny akcji");
  }
  const renderCell = actionsColumn.cell as (context: {
    row: { original: UserAccountListItem };
  }) => ReactNode;
  const original: UserAccountListItem = {
    id: target.id,
    name: "Jan",
    email: "jan@firma.pl",
    role: target.role,
    emailVerified: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  return render(<>{renderCell({ row: { original } })}</>);
}

beforeEach(() => {
  registry.length = 0;
});

describe("buildUserAccountColumns", () => {
  it("etykietuje każdą kolumnę danych dla panelu widoczności", () => {
    expect(dataColumns).toHaveLength(4);
    dataColumns.forEach((column) => {
      expect(column.meta?.label).toMatch(/^t:col-/);
    });
  });

  it("etykieta i nagłówek są zgodne", () => {
    dataColumns.forEach((column) => {
      expect(column.meta?.label).toBe(column.header);
    });
  });

  it("kolumna akcji nie trafia do panelu widoczności", () => {
    const actions = columns.find((column) => column.id === "actions");
    expect(actions?.enableHiding).toBe(false);
  });
});

describe("kolumna roli", () => {
  it("superadmin → badge „Serwis (Web Amigos)”", () => {
    renderRoleCell("superadmin");

    expect(screen.getByText("Serwis (Web Amigos)")).toBeInTheDocument();
    expect(screen.queryByText("Administrator")).not.toBeInTheDocument();
    expect(screen.queryByText("Użytkownik")).not.toBeInTheDocument();
  });

  it("admin → badge „Administrator”", () => {
    renderRoleCell("admin");

    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.queryByText("Serwis (Web Amigos)")).not.toBeInTheDocument();
  });

  it("user → badge „Użytkownik”", () => {
    renderRoleCell("user");

    expect(screen.getByText("Użytkownik")).toBeInTheDocument();
    expect(screen.queryByText("Serwis (Web Amigos)")).not.toBeInTheDocument();
  });

  it("etykieta role-superadmin: PL „Serwis (Web Amigos)”, EN „Service (Web Amigos)”", () => {
    const enMessages: Record<string, string> = usersEn;

    expect(plMessages["role-superadmin"]).toBe("Serwis (Web Amigos)");
    expect(enMessages["role-superadmin"]).toBe("Service (Web Amigos)");
  });
});

describe("kolumna akcji", () => {
  it("superadmin → wiersz innego admina ma aktywny przycisk „Zaloguj jako”", () => {
    renderActionsCell(
      {
        currentUserId: "me",
        currentUserRole: "superadmin",
        adminImpersonation: false,
        pendingId: null,
      },
      { id: "other", role: "admin" },
    );

    expect(screen.getByRole("button", { name: "Zaloguj jako" })).toBeEnabled();
  });

  it("superadmin → własny wiersz nie ma przycisku „Zaloguj jako”, nawet z rolą admin na liście", () => {
    renderActionsCell(
      {
        currentUserId: "me",
        currentUserRole: "superadmin",
        adminImpersonation: false,
        pendingId: null,
      },
      { id: "me", role: "admin" },
    );

    expect(
      screen.queryByRole("button", { name: "Zaloguj jako" }),
    ).not.toBeInTheDocument();
  });

  it("admin z ADMIN_IMPERSONATION=true → własny wiersz nie ma przycisku „Zaloguj jako”, nawet z rolą user na liście", () => {
    renderActionsCell(
      {
        currentUserId: "me",
        currentUserRole: "admin",
        adminImpersonation: true,
        pendingId: null,
      },
      { id: "me", role: "user" },
    );

    expect(
      screen.queryByRole("button", { name: "Zaloguj jako" }),
    ).not.toBeInTheDocument();
  });

  it.each([[false], [true]])(
    "admin (ADMIN_IMPERSONATION=%s) → wiersz superadmina nie ma żadnego przycisku",
    (adminImpersonation) => {
      renderActionsCell(
        {
          currentUserId: "me",
          currentUserRole: "admin",
          adminImpersonation,
          pendingId: null,
        },
        { id: "service", role: "superadmin" },
      );

      expect(screen.queryAllByRole("button")).toHaveLength(0);
    },
  );

  it("admin bez ADMIN_IMPERSONATION → wiersz zwykłego użytkownika nie ma przycisku „Zaloguj jako”", () => {
    renderActionsCell(
      {
        currentUserId: "me",
        currentUserRole: "admin",
        adminImpersonation: false,
        pendingId: null,
      },
      { id: "other", role: "user" },
    );

    expect(
      screen.queryByRole("button", { name: "Zaloguj jako" }),
    ).not.toBeInTheDocument();
  });

  it("w trakcie innej impersonacji widoczny przycisk jest zablokowany", () => {
    renderActionsCell(
      {
        currentUserId: "me",
        currentUserRole: "admin",
        adminImpersonation: true,
        pendingId: "someone-else",
      },
      { id: "other", role: "user" },
    );

    expect(screen.getByRole("button", { name: "Zaloguj jako" })).toBeDisabled();
  });
});

function columnIdOf(
  column: ColumnDef<UserAccountListItem>,
): string | undefined {
  if (column.id !== undefined) {
    return column.id;
  }
  return "accessorKey" in column ? String(column.accessorKey) : undefined;
}

describe("buildUserAccountColumns: contributed columns", () => {
  it("contributed columns go after the built-ins and before the actions, in order", () => {
    const contributed: ColumnDef<UserAccountListItem>[] = [
      { id: "crm.score" },
      { id: "crm.stage" },
    ];
    const built = buildUserAccountColumns(
      t,
      pl,
      SUPERADMIN_VIEWER,
      null,
      vi.fn(),
      contributed,
    );

    expect(built.map(columnIdOf)).toEqual([
      "name",
      "email",
      "role",
      "createdAt",
      "crm.score",
      "crm.stage",
      "actions",
    ]);
  });

  it("the contributed column definitions are used as given", () => {
    const score: ColumnDef<UserAccountListItem> = {
      id: "crm.score",
      header: "Ocena",
    };
    const built = buildUserAccountColumns(
      t,
      pl,
      SUPERADMIN_VIEWER,
      null,
      vi.fn(),
      [score],
    );

    expect(built[4]).toBe(score);
  });

  it("without contributed columns → name, email, role, createdAt, actions", () => {
    expect(columns.map(columnIdOf)).toEqual([
      "name",
      "email",
      "role",
      "createdAt",
      "actions",
    ]);
  });
});

function rowActionLoader(label: string): SlotComponentLoader {
  function Action(props: SlotComponentProps) {
    return (
      <span
        data-testid="row-action"
        data-keys={Object.keys(props).sort().join(",")}
      >
        {`${label} userId=${String(props.userId)} organizationId=${String(props.organizationId)}`}
      </span>
    );
  }
  return () => Promise.resolve({ default: Action });
}

function contribution(
  slot: string,
  id: string,
  module: string,
  roles?: OrgRole[],
): RegisteredContribution {
  return {
    slot,
    id,
    priority: 10,
    roles,
    component: rowActionLoader(id),
    module,
    kind: "client",
  };
}

describe("kolumna akcji: row actions of other modules", () => {
  it("renders the users.table.row-actions contributions with the row's userId and the viewer's organization", async () => {
    registry.push(contribution("users.table.row-actions", "crm.action", "crm"));
    renderActionsCell(
      {
        currentUserId: "me",
        currentUserRole: "superadmin",
        adminImpersonation: false,
        pendingId: null,
        organizationId: "org-5",
      },
      { id: "other", role: "admin" },
    );

    expect(
      await screen.findByText("crm.action userId=other organizationId=org-5"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("row-action").dataset.keys).toBe(
      "organizationId,userId",
    );
  });

  it("the row action comes after the impersonate button inside the actions container", async () => {
    registry.push(contribution("users.table.row-actions", "crm.action", "crm"));
    renderActionsCell(
      {
        currentUserId: "me",
        currentUserRole: "superadmin",
        adminImpersonation: false,
        pendingId: null,
      },
      { id: "other", role: "user" },
    );

    const action = await screen.findByTestId("row-action");
    const container = action.closest("div.flex.justify-end");
    expect(container).not.toBeNull();
    const impersonate = within(container as HTMLElement).getByRole("button", {
      name: "Zaloguj jako",
    });
    expect(
      impersonate.compareDocumentPosition(action) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the row action also in the viewer's own row, where there is no impersonate button", async () => {
    registry.push(contribution("users.table.row-actions", "crm.action", "crm"));
    renderActionsCell(
      {
        currentUserId: "me",
        currentUserRole: "superadmin",
        adminImpersonation: false,
        pendingId: null,
      },
      { id: "me", role: "superadmin" },
    );

    expect(
      await screen.findByText("crm.action userId=me organizationId=org-1"),
    ).toBeInTheDocument();
  });

  it("does not render contributions of the users.table.columns slot in the actions cell", async () => {
    registry.push(
      contribution("users.table.columns", "crm.column", "crm"),
      contribution("users.table.row-actions", "crm.action", "crm"),
    );
    renderActionsCell(
      {
        currentUserId: "me",
        currentUserRole: "superadmin",
        adminImpersonation: false,
        pendingId: null,
      },
      { id: "other", role: "admin" },
    );

    expect(await screen.findAllByTestId("row-action")).toHaveLength(1);
    expect(screen.getByTestId("row-action")).toHaveTextContent(
      "crm.action userId=other organizationId=org-1",
    );
  });

  it("does not render a row action of a module missing from clientModules", async () => {
    registry.push(
      contribution("users.table.row-actions", "ghost.action", "ghost"),
      contribution("users.table.row-actions", "crm.action", "crm"),
    );
    renderActionsCell(
      {
        currentUserId: "me",
        currentUserRole: "superadmin",
        adminImpersonation: false,
        pendingId: null,
      },
      { id: "other", role: "admin" },
    );

    expect(await screen.findAllByTestId("row-action")).toHaveLength(1);
    expect(screen.queryByText(/ghost/)).not.toBeInTheDocument();
  });

  it.each([
    ["owner", true],
    ["member", false],
  ] as const)(
    "a roles owner row action with the viewer's orgRole %s → shown: %s",
    async (orgRole, shown) => {
      registry.push(
        contribution("users.table.row-actions", "crm.owner-action", "crm", [
          "owner",
        ]),
        contribution("users.table.row-actions", "crm.action", "crm"),
      );
      renderActionsCell(
        {
          currentUserId: "me",
          currentUserRole: "user",
          adminImpersonation: false,
          pendingId: null,
          orgRole,
        },
        { id: "other", role: "user" },
      );

      expect(
        await screen.findByText("crm.action userId=other organizationId=org-1"),
      ).toBeInTheDocument();
      expect(
        screen.queryAllByText(
          "crm.owner-action userId=other organizationId=org-1",
        ),
      ).toHaveLength(shown ? 1 : 0);
    },
  );

  it.each([
    [true, true],
    [false, false],
  ] as const)(
    "a row action of an admin-only module with multiOrg %s for an organization owner → shown: %s",
    async (multiOrg, shown) => {
      registry.push(
        contribution("users.table.row-actions", "sales.action", "sales"),
        contribution("users.table.row-actions", "crm.action", "crm"),
      );
      renderActionsCell(
        {
          currentUserId: "me",
          currentUserRole: "user",
          adminImpersonation: false,
          pendingId: null,
          orgRole: "owner",
          multiOrg,
        },
        { id: "other", role: "user" },
      );

      expect(
        await screen.findByText("crm.action userId=other organizationId=org-1"),
      ).toBeInTheDocument();
      expect(
        screen.queryAllByText("sales.action userId=other organizationId=org-1"),
      ).toHaveLength(shown ? 1 : 0);
    },
  );
});
