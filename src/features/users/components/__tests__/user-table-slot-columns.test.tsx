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
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import type {
  RegisteredContribution,
  SlotComponentLoader,
  SlotComponentProps,
} from "@/shared/lib/modules/slots";
import type { UserAccountListItem } from "../../contracts/user-account.types";
import { buildContributedUserColumns } from "../user-table-slot-columns";

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

const LABELS: Record<string, string> = {
  "crm.col-a": "Ocena",
  "crm.col-b": "Etap",
  "crm.col-score": "Ocena",
  "crm.col-boom": "Wybuch",
  "crm.col-pending": "Czeka",
};

function translate(key: string): string {
  return LABELS[key] ?? `missing:${key}`;
}

function columnContribution(
  id: string,
  header: string,
  component: SlotComponentLoader,
  priority = 10,
): RegisteredContribution & { header: string } {
  return {
    slot: "users.table.columns",
    id,
    priority,
    roles: undefined,
    component,
    module: "crm",
    kind: "client",
    header,
  };
}

function plainContribution(id: string): RegisteredContribution {
  return {
    slot: "users.table.columns",
    id,
    priority: 10,
    roles: undefined,
    component: () => Promise.resolve({ default: () => null }),
    module: "crm",
    kind: "client",
  };
}

function labelled(label: string): SlotComponentLoader {
  function Labelled(props: SlotComponentProps) {
    const row = props.row as UserAccountListItem;
    return (
      <span data-testid={label} data-keys={Object.keys(props).sort().join(",")}>
        {`${label} ${row.id} ${row.email} ${String(props.organizationId)}`}
      </span>
    );
  }
  return () => Promise.resolve({ default: Labelled });
}

const EMAIL_COLUMN: ColumnDef<UserAccountListItem> = {
  accessorKey: "email",
  header: "Email",
  cell: ({ row }) => <span>{row.original.email}</span>,
};

function renderTable(
  contributions: readonly RegisteredContribution[],
  organizationId = "org-1",
) {
  const columns = [
    EMAIL_COLUMN,
    ...buildContributedUserColumns(contributions, translate, organizationId),
  ];
  return render(<DataTable columns={columns} data={[ULA, ADAM]} />);
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

describe("buildContributedUserColumns: columns", () => {
  it("two column contributions → columns crm.a and crm.b with headers Ocena and Etap", () => {
    const columns = buildContributedUserColumns(
      [
        columnContribution("crm.a", "col-a", labelled("a")),
        columnContribution("crm.b", "col-b", labelled("b")),
      ],
      translate,
      "org-1",
    );

    expect(columns.map((column) => column.id)).toEqual(["crm.a", "crm.b"]);
    expect(columns.map((column) => column.header)).toEqual(["Ocena", "Etap"]);
  });

  it("the column label for the visibility panel is the translated header", () => {
    const columns = buildContributedUserColumns(
      [
        columnContribution("crm.a", "col-a", labelled("a")),
        columnContribution("crm.b", "col-b", labelled("b")),
      ],
      translate,
      "org-1",
    );

    expect(columns.map((column) => column.meta?.label)).toEqual([
      "Ocena",
      "Etap",
    ]);
  });

  it("translates the header key in the namespace of the contributing module", () => {
    const keys: string[] = [];
    buildContributedUserColumns(
      [columnContribution("crm.a", "col-a", labelled("a"))],
      (key) => {
        keys.push(key);
        return translate(key);
      },
      "org-1",
    );

    expect(keys).not.toContain("col-a");
    expect(keys).toContain("crm.col-a");
  });

  it("contributed columns are not sortable", () => {
    const columns = buildContributedUserColumns(
      [
        columnContribution("crm.a", "col-a", labelled("a")),
        columnContribution("crm.b", "col-b", labelled("b")),
      ],
      translate,
      "org-1",
    );

    expect(columns.map((column) => column.enableSorting)).toEqual([
      false,
      false,
    ]);
  });

  it("keeps the input order of the contributions", () => {
    const columns = buildContributedUserColumns(
      [
        columnContribution("crm.b", "col-b", labelled("b"), 20),
        columnContribution("crm.a", "col-a", labelled("a"), 10),
      ],
      translate,
      "org-1",
    );

    expect(columns.map((column) => column.id)).toEqual(["crm.b", "crm.a"]);
  });

  it("no contributions → no columns", () => {
    expect(buildContributedUserColumns([], translate, "org-1")).toEqual([]);
  });
});

describe("buildContributedUserColumns: a contribution that is not a column", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("a plain contribution (no header) gives no column and is logged with its id", () => {
    const columns = buildContributedUserColumns(
      [
        columnContribution("crm.a", "col-a", labelled("a")),
        plainContribution("crm.plain"),
        columnContribution("crm.b", "col-b", labelled("b")),
      ],
      translate,
      "org-1",
    );

    expect(columns.map((column) => column.id)).toEqual(["crm.a", "crm.b"]);
    expect(consoleError).toHaveBeenCalledWith(
      "Slot contribution is not a column:",
      "crm.plain",
    );
  });

  it("a contribution with an empty header gives no column", () => {
    const columns = buildContributedUserColumns(
      [columnContribution("crm.empty", "", labelled("empty"))],
      translate,
      "org-1",
    );

    expect(columns).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "Slot contribution is not a column:",
      "crm.empty",
    );
  });
});

describe("buildContributedUserColumns: cells", () => {
  it("each cell renders the contribution with that row and the organization", async () => {
    renderTable([
      columnContribution("crm.score", "col-score", labelled("score")),
    ]);

    expect(
      await screen.findByText("score u-1 ula@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("score u-2 adam@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(cellTexts("ula@firma.pl")).toEqual([
      "ula@firma.pl",
      "score u-1 ula@firma.pl org-1",
    ]);
    expect(cellTexts("adam@firma.pl")).toEqual([
      "adam@firma.pl",
      "score u-2 adam@firma.pl org-1",
    ]);
  });

  it("uses the organizationId given to the builder", async () => {
    renderTable(
      [columnContribution("crm.score", "col-score", labelled("score"))],
      "org-7",
    );

    expect(
      await screen.findByText("score u-1 ula@firma.pl org-7"),
    ).toBeInTheDocument();
  });

  it("the cell component receives exactly row and organizationId, row equal to that row's item", async () => {
    const received: SlotComponentProps[] = [];
    function Recording(props: SlotComponentProps) {
      received.push(props);
      return <span>recorded</span>;
    }
    renderTable([
      columnContribution("crm.score", "col-score", () =>
        Promise.resolve({ default: Recording }),
      ),
    ]);

    expect(await screen.findAllByText("recorded")).toHaveLength(2);
    expect(received.length).toBeGreaterThanOrEqual(2);
    for (const props of received) {
      expect(Object.keys(props).sort()).toEqual(["organizationId", "row"]);
    }
    expect(received).toContainEqual({ row: ULA, organizationId: "org-1" });
    expect(received).toContainEqual({ row: ADAM, organizationId: "org-1" });
  });

  it("loads a contribution once for all rows and across re-renders", async () => {
    const loader = vi.fn(labelled("score"));
    const contribution = columnContribution("crm.score", "col-score", loader);
    const { rerender } = renderTable([contribution]);
    expect(
      await screen.findByText("score u-2 adam@firma.pl org-1"),
    ).toBeInTheDocument();

    rerender(
      <DataTable
        columns={[
          EMAIL_COLUMN,
          ...buildContributedUserColumns([contribution], translate, "org-2"),
        ]}
        data={[ULA, ADAM]}
      />,
    );

    expect(
      await screen.findByText("score u-2 adam@firma.pl org-2"),
    ).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe("buildContributedUserColumns: a failing cell hides only itself", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("a throwing cell: the other column and the built-in cells stay, the error is logged", async () => {
    const boom = new Error("boom");
    function Boom(): never {
      throw boom;
    }
    renderTable([
      columnContribution("crm.boom", "col-boom", () =>
        Promise.resolve({ default: Boom }),
      ),
      columnContribution("crm.score", "col-score", labelled("score")),
    ]);

    expect(
      await screen.findByText("score u-1 ula@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("score u-2 adam@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(cellTexts("ula@firma.pl")).toEqual([
      "ula@firma.pl",
      "",
      "score u-1 ula@firma.pl org-1",
    ]);
    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual(["Email", "Wybuch", "Ocena"]);
    expect(consoleError).toHaveBeenCalledWith(
      "Slot contribution failed to render:",
      "crm.boom",
      boom,
    );
  });

  it("a rejected loader: only its cells are empty", async () => {
    const loadError = new Error("load failed");
    renderTable([
      columnContribution("crm.boom", "col-boom", () =>
        Promise.reject(loadError),
      ),
      columnContribution("crm.score", "col-score", labelled("score")),
    ]);

    expect(
      await screen.findByText("score u-2 adam@firma.pl org-1"),
    ).toBeInTheDocument();
    expect(cellTexts("adam@firma.pl")).toEqual([
      "adam@firma.pl",
      "",
      "score u-2 adam@firma.pl org-1",
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      "Slot contribution failed to render:",
      "crm.boom",
      loadError,
    );
  });

  it("a cell still loading does not hold back the table", () => {
    renderTable([
      columnContribution(
        "crm.pending",
        "col-pending",
        () => new Promise<never>(() => {}),
      ),
    ]);

    expect(screen.getByText("ula@firma.pl")).toBeInTheDocument();
    expect(screen.getByText("adam@firma.pl")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Czeka" }),
    ).toBeInTheDocument();
  });
});
