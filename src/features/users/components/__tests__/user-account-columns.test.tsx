import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import type { UserRole } from "@/shared/lib/auth/roles";
import { pl } from "date-fns/locale";
import usersPl from "../../i18n/pl.json";
import usersEn from "../../i18n/en.json";
import type { UserAccountListItem } from "../../contracts/user-account.types";
import { buildUserAccountColumns } from "../user-account-columns";

type Translate = Parameters<typeof buildUserAccountColumns>[0];

const t = ((key: string) => `t:${key}`) as Translate;
const plMessages: Record<string, string> = usersPl;
const tPl = ((key: string) => plMessages[key] ?? `missing:${key}`) as Translate;

const columns = buildUserAccountColumns(
  t,
  pl,
  { userId: "me", role: "superadmin", adminImpersonation: false },
  null,
  vi.fn(),
);
const dataColumns = columns.filter((column) => column.id !== "actions");

function renderRoleCell(role: string) {
  const roleColumn = buildUserAccountColumns(
    tPl,
    pl,
    { userId: "me", role: "superadmin", adminImpersonation: false },
    null,
    vi.fn(),
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
    },
    viewer.pendingId,
    vi.fn(),
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
