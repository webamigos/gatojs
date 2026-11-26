import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OrgRole, UserRole } from "@/shared/lib/auth/roles";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import type {
  RegisteredContribution,
  SlotComponentLoader,
  SlotComponentProps,
} from "@/shared/lib/modules/slots";
import type { UserAccountListItem } from "../../contracts/user-account.types";
import { usersMessages } from "./messages";

const { registry, stableRouter } = vi.hoisted(() => ({
  registry: [] as unknown[],
  stableRouter: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("@/modules.client.generated", () => {
  const modules: ModuleDef[] = [
    { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
    {
      key: "users",
      nav: [],
      routePrefixes: ["/users"],
      adminOnly: true,
      multiOrgRoles: ["owner", "admin"],
    },
    { key: "crm", nav: [], routePrefixes: ["/crm"] },
  ];
  return {
    authClientPlugins: [],
    clientModules: modules,
    clientModuleSlots: registry,
    gatoBranding: {},
  };
});
vi.mock("@/i18n/routing", () => ({
  useRouter: () => stableRouter,
}));
vi.mock("@/shared/lib/auth/client", () => ({
  authClient: { admin: { impersonateUser: vi.fn() } },
}));
vi.mock("../../services/commands/impersonation-commands", () => ({
  logImpersonationStartCommand: vi.fn(),
}));
vi.mock("../../services/commands/invite-user-command", () => ({
  inviteUserCommand: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { UsersManager } from "../users-manager";

const ULA: UserAccountListItem = {
  id: "u-1",
  name: "Ula",
  email: "ula@firma.pl",
  role: "user",
  emailVerified: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const ADAM: UserAccountListItem = {
  id: "u-2",
  name: "Adam",
  email: "adam@firma.pl",
  role: "admin",
  emailVerified: true,
  createdAt: new Date("2026-02-01T00:00:00Z"),
};

const MESSAGES = {
  ...usersMessages,
  crm: {
    "col-score": "Ocena",
    "col-stage": "Etap",
    "col-boom": "Wybuch",
    "col-owner": "Tylko owner",
  },
  ghost: { "col-ghost": "Duch" },
};

const IMPERSONATE = { name: "Zaloguj jako" };

const BUILT_IN_HEADERS = ["Imię i nazwisko", "Email", "Rola", "Utworzone"];

interface ManagerViewer {
  currentUserRole: UserRole;
  currentOrgRole: OrgRole | null;
}

function renderManager(
  viewer: ManagerViewer = {
    currentUserRole: "superadmin",
    currentOrgRole: null,
  },
) {
  return render(
    <NextIntlClientProvider locale="pl" messages={MESSAGES}>
      <UsersManager
        users={[ULA, ADAM]}
        currentUserId="admin-1"
        currentUserRole={viewer.currentUserRole}
        adminImpersonation={false}
        organizationId="org-1"
        currentOrgRole={viewer.currentOrgRole}
        multiOrg={false}
      />
    </NextIntlClientProvider>,
  );
}

function setContributions(...contributions: RegisteredContribution[]) {
  registry.length = 0;
  registry.push(...contributions);
}

function rowAction(
  id: string,
  component: SlotComponentLoader,
  module = "crm",
  roles?: OrgRole[],
): RegisteredContribution {
  return {
    slot: "users.table.row-actions",
    id,
    priority: 10,
    roles,
    component,
    module,
    kind: "client",
  };
}

function column(
  id: string,
  header: string,
  component: SlotComponentLoader,
  module = "crm",
  roles?: OrgRole[],
): RegisteredContribution {
  const contribution: RegisteredContribution & { header: string } = {
    slot: "users.table.columns",
    id,
    priority: 10,
    roles,
    component,
    module,
    kind: "client",
    header,
  };
  return contribution;
}

function actionLoader(label: string): SlotComponentLoader {
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

function cellLoader(label: string): SlotComponentLoader {
  function Cell(props: SlotComponentProps) {
    const row = props.row as UserAccountListItem;
    return (
      <span data-testid="cell" data-keys={Object.keys(props).sort().join(",")}>
        {`${label} ${row.id} ${row.email} ${String(props.organizationId)}`}
      </span>
    );
  }
  return () => Promise.resolve({ default: Cell });
}

function rowOf(email: string): HTMLElement {
  const row = screen.getByText(email).closest("tr");
  if (!row) {
    throw new Error(`no row for ${email}`);
  }
  return row;
}

function cellTexts(email: string): string[] {
  return within(rowOf(email))
    .getAllByRole("cell")
    .map((cell) => cell.textContent ?? "");
}

function headerTexts(): string[] {
  return screen
    .getAllByRole("columnheader")
    .map((header) => header.textContent ?? "");
}

describe("UsersManager without contributions", () => {
  beforeEach(() => {
    setContributions();
  });

  it("shows the built-in headers and the actions column only", () => {
    renderManager();

    expect(headerTexts()).toEqual([...BUILT_IN_HEADERS, ""]);
    expect(within(rowOf("ula@firma.pl")).getAllByRole("cell")).toHaveLength(5);
  });
});

describe("UsersManager: row actions", () => {
  beforeEach(() => {
    setContributions(rowAction("crm.action", actionLoader("action")));
  });

  it("renders the row action once per row with that row's userId and the organization", async () => {
    renderManager();

    expect(
      await within(rowOf("ula@firma.pl")).findByText(
        "action userId=u-1 organizationId=org-1",
      ),
    ).toBeInTheDocument();
    expect(
      await within(rowOf("adam@firma.pl")).findByText(
        "action userId=u-2 organizationId=org-1",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf("ula@firma.pl")).getAllByTestId("row-action"),
    ).toHaveLength(1);
    expect(
      within(rowOf("adam@firma.pl")).getAllByTestId("row-action"),
    ).toHaveLength(1);
    expect(screen.getAllByTestId("row-action")).toHaveLength(2);
  });

  it("the row action receives exactly userId and organizationId", async () => {
    renderManager();

    const actions = await screen.findAllByTestId("row-action");
    expect(actions.map((action) => action.dataset.keys)).toEqual([
      "organizationId,userId",
      "organizationId,userId",
    ]);
  });

  it("the row action sits in the actions cell after the impersonate button", async () => {
    renderManager();

    const action = await within(rowOf("ula@firma.pl")).findByText(
      "action userId=u-1 organizationId=org-1",
    );
    const cells = within(rowOf("ula@firma.pl")).getAllByRole("cell");
    const actionsCell = cells[cells.length - 1];
    const impersonate = within(actionsCell).getByRole("button", IMPERSONATE);
    expect(actionsCell).toContainElement(action);
    expect(
      impersonate.compareDocumentPosition(action) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("a row action does not add a column", async () => {
    renderManager();

    await screen.findAllByTestId("row-action");
    expect(headerTexts()).toEqual([...BUILT_IN_HEADERS, ""]);
  });
});

describe("UsersManager: contributed columns", () => {
  beforeEach(() => {
    setContributions(column("crm.score", "col-score", cellLoader("score")));
  });

  it("puts the translated header after Utworzone and before the actions column", () => {
    renderManager();

    expect(headerTexts()).toEqual([...BUILT_IN_HEADERS, "Ocena", ""]);
  });

  it("the cell of each row shows that row and the organization, between the built-in cells and the actions", async () => {
    renderManager();

    expect(
      await screen.findByText("score u-1 ula@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("score u-2 adam@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(cellTexts("ula@firma.pl")[4]).toBe("score u-1 ula@firma.pl org-1");
    expect(cellTexts("adam@firma.pl")[4]).toBe("score u-2 adam@firma.pl org-1");
    expect(cellTexts("ula@firma.pl")).toHaveLength(6);
  });

  it("the cell receives exactly row and organizationId", async () => {
    renderManager();

    const cells = await screen.findAllByTestId("cell");
    expect(cells.map((cell) => cell.dataset.keys)).toEqual([
      "organizationId,row",
      "organizationId,row",
    ]);
  });

  it("the cell receives the row item itself", async () => {
    const received: SlotComponentProps[] = [];
    function Recording(props: SlotComponentProps) {
      received.push(props);
      return <span>recorded</span>;
    }
    setContributions(
      column("crm.score", "col-score", () =>
        Promise.resolve({ default: Recording }),
      ),
    );
    renderManager();

    expect(await screen.findAllByText("recorded")).toHaveLength(2);
    expect(received).toContainEqual({ row: ULA, organizationId: "org-1" });
    expect(received).toContainEqual({ row: ADAM, organizationId: "org-1" });
  });

  it("two columns keep the registry order after the built-ins", () => {
    setContributions(
      column("crm.score", "col-score", cellLoader("score")),
      column("crm.stage", "col-stage", cellLoader("stage")),
    );
    renderManager();

    expect(headerTexts()).toEqual([...BUILT_IN_HEADERS, "Ocena", "Etap", ""]);
  });

  it("a contribution whose roles exclude the viewer is still shown to a global admin", () => {
    setContributions(
      column("crm.owner", "col-owner", cellLoader("owner"), "crm", ["owner"]),
    );
    renderManager({ currentUserRole: "admin", currentOrgRole: "member" });

    expect(headerTexts()).toEqual([...BUILT_IN_HEADERS, "Tylko owner", ""]);
  });
});

describe("UsersManager: a disabled module contributes nothing", () => {
  beforeEach(() => {
    setContributions(
      column("ghost.col", "col-ghost", cellLoader("ghost-cell"), "ghost"),
      rowAction("ghost.action", actionLoader("ghost-action"), "ghost"),
      column("crm.score", "col-score", cellLoader("score")),
    );
  });

  it("no header, no cell and no row action of a module missing from clientModules", async () => {
    renderManager();

    expect(
      await screen.findByText("score u-1 ula@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(headerTexts()).toEqual([...BUILT_IN_HEADERS, "Ocena", ""]);
    expect(cellTexts("ula@firma.pl")).toHaveLength(6);
    expect(screen.queryByText(/ghost/)).not.toBeInTheDocument();
    expect(screen.queryByText("Duch")).not.toBeInTheDocument();
  });
});

describe("UsersManager: a failing contribution leaves the table", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("a throwing cell: the header, the other column and the built-in cells stay", async () => {
    const boom = new Error("cell boom");
    function Boom(): never {
      throw boom;
    }
    setContributions(
      column("crm.boom", "col-boom", () => Promise.resolve({ default: Boom })),
      column("crm.score", "col-score", cellLoader("score")),
    );
    renderManager();

    expect(
      await screen.findByText("score u-1 ula@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("score u-2 adam@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(headerTexts()).toEqual([...BUILT_IN_HEADERS, "Wybuch", "Ocena", ""]);
    expect(cellTexts("ula@firma.pl")[4]).toBe("");
    expect(screen.getByText("ula@firma.pl")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "Slot contribution failed to render:",
      "crm.boom",
      boom,
    );
  });

  it("a rejected cell loader: only its cells are empty", async () => {
    const loadError = new Error("cell load failed");
    setContributions(
      column("crm.boom", "col-boom", () => Promise.reject(loadError)),
      column("crm.score", "col-score", cellLoader("score")),
    );
    renderManager();

    expect(
      await screen.findByText("score u-2 adam@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(headerTexts()).toEqual([...BUILT_IN_HEADERS, "Wybuch", "Ocena", ""]);
    expect(cellTexts("adam@firma.pl")[4]).toBe("");
    expect(cellTexts("adam@firma.pl")[5]).toBe("score u-2 adam@firma.pl org-1");
    expect(screen.getByText("adam@firma.pl")).toBeInTheDocument();
  });

  it("a cell still loading does not hold back the table", () => {
    setContributions(
      column("crm.boom", "col-boom", () => new Promise<never>(() => {})),
    );
    renderManager();

    expect(screen.getByText("ula@firma.pl")).toBeInTheDocument();
    expect(headerTexts()).toEqual([...BUILT_IN_HEADERS, "Wybuch", ""]);
  });

  it("a throwing row action: the impersonate button and the other row action stay", async () => {
    const boom = new Error("action boom");
    function Boom(): never {
      throw boom;
    }
    setContributions(
      rowAction("crm.boom-action", () => Promise.resolve({ default: Boom })),
      rowAction("crm.action", actionLoader("action")),
    );
    renderManager();

    const row = rowOf("ula@firma.pl");
    expect(
      await within(row).findByText("action userId=u-1 organizationId=org-1"),
    ).toBeInTheDocument();
    expect(within(row).getByRole("button", IMPERSONATE)).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "Slot contribution failed to render:",
      "crm.boom-action",
      boom,
    );
  });
});
