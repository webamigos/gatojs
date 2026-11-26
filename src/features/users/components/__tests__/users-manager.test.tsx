import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { UserRole } from "@/shared/lib/auth/roles";
import type { UserAccountListItem } from "../../contracts/user-account.types";
import { usersMessages } from "./messages";

const {
  mockImpersonateUser,
  mockLogStart,
  mockPush,
  mockRefresh,
  mockToastError,
  stableRouter,
} = vi.hoisted(() => {
  const push = vi.fn();
  const refresh = vi.fn();
  return {
    mockImpersonateUser: vi.fn(),
    mockLogStart: vi.fn(),
    mockPush: push,
    mockRefresh: refresh,
    mockToastError: vi.fn(),
    stableRouter: { push, refresh },
  };
});

vi.mock("@/modules.client.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.client.generated")>()),
  clientModuleSlots: [],
}));
vi.mock("@/i18n/routing", () => ({
  useRouter: () => stableRouter,
}));
vi.mock("@/shared/lib/auth/client", () => ({
  authClient: { admin: { impersonateUser: mockImpersonateUser } },
}));
vi.mock("../../services/commands/impersonation-commands", () => ({
  logImpersonationStartCommand: mockLogStart,
}));
vi.mock("../../services/commands/invite-user-command", () => ({
  inviteUserCommand: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

import { UsersManager } from "../users-manager";

interface Viewer {
  currentUserId: string;
  currentUserRole: UserRole;
  adminImpersonation: boolean;
}

const SUPERADMIN_VIEWER: Viewer = {
  currentUserId: "admin-1",
  currentUserRole: "superadmin",
  adminImpersonation: false,
};

function makeUser(
  overrides: Partial<UserAccountListItem> = {},
): UserAccountListItem {
  return {
    id: "user-1",
    name: "Jan Kowalski",
    email: "jan@firma.pl",
    role: "user",
    emailVerified: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function managerElement(users: UserAccountListItem[], viewer: Viewer) {
  return (
    <NextIntlClientProvider locale="pl" messages={usersMessages}>
      <UsersManager
        users={users}
        currentUserId={viewer.currentUserId}
        currentUserRole={viewer.currentUserRole}
        adminImpersonation={viewer.adminImpersonation}
        organizationId="org-1"
        currentOrgRole="member"
        multiOrg={false}
      />
    </NextIntlClientProvider>
  );
}

function renderManager(
  users: UserAccountListItem[] = [],
  viewer: Viewer = SUPERADMIN_VIEWER,
) {
  return render(managerElement(users, viewer));
}

function rowOf(email: string): HTMLElement {
  const row = screen.getByText(email).closest("tr");
  if (!row) {
    throw new Error(`Brak wiersza dla ${email}`);
  }
  return row;
}

const IMPERSONATE = { name: "Zaloguj jako" };

const USER_EMAIL = "ula@firma.pl";
const ADMIN_EMAIL = "adam@firma.pl";
const SUPERADMIN_EMAIL = "serwis@webamigos.pl";

const TARGET_EMAILS: Record<UserRole, string> = {
  user: USER_EMAIL,
  admin: ADMIN_EMAIL,
  superadmin: SUPERADMIN_EMAIL,
};

const TARGETS = [
  makeUser({ id: "target-user", name: "Ula", email: USER_EMAIL, role: "user" }),
  makeUser({
    id: "target-admin",
    name: "Adam",
    email: ADMIN_EMAIL,
    role: "admin",
  }),
  makeUser({
    id: "target-superadmin",
    name: "Sara",
    email: SUPERADMIN_EMAIL,
    role: "superadmin",
  }),
];

describe("UsersManager", () => {
  beforeEach(() => {
    mockImpersonateUser.mockResolvedValue({ error: null });
    mockLogStart.mockResolvedValue({ success: true });
  });

  it("renderuje tytuł i opis", () => {
    renderManager();
    expect(screen.getByText("Użytkownicy")).toBeInTheDocument();
    expect(
      screen.getByText(/Widoczne tylko dla administratorów/),
    ).toBeInTheDocument();
  });

  it("pokazuje pusty stan bez tabeli", () => {
    renderManager();
    expect(screen.getByText("Brak użytkowników.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renderuje nagłówki kolumn i odznaki ról", () => {
    renderManager([
      makeUser({ id: "u1", role: "user" }),
      makeUser({ id: "u2", role: "admin" }),
    ]);
    expect(
      screen.getByRole("columnheader", { name: "Email" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Rola" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(
      screen.getByText("Użytkownik", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("przycisk zaproszenia jest w nagłówku karty, nie w treści", () => {
    renderManager([makeUser()]);
    const button = screen.getByRole("button", { name: "Zaproś użytkownika" });
    expect(button.closest('[data-slot="card-action"]')).not.toBeNull();
    expect(button.closest('[data-slot="card-content"]')).toBeNull();
  });

  it("impersonuje innego użytkownika i przechodzi na dashboard przez router", async () => {
    const user = userEvent.setup();
    renderManager([makeUser({ id: "user-2" })]);

    await user.click(screen.getByRole("button", IMPERSONATE));

    expect(mockImpersonateUser).toHaveBeenCalledWith({ userId: "user-2" });
    expect(mockLogStart).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("błąd impersonacji → toast, bez nawigacji i bez zapisu zdarzenia", async () => {
    mockImpersonateUser.mockResolvedValue({ error: { message: "denied" } });
    const user = userEvent.setup();
    renderManager([makeUser({ id: "user-2" })]);

    await user.click(screen.getByRole("button", IMPERSONATE));

    expect(mockToastError).toHaveBeenCalledWith(
      "Nie udało się zalogować jako ten użytkownik",
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockLogStart).not.toHaveBeenCalled();
  });

  it("błąd zapisu zdarzenia nie blokuje nawigacji", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockLogStart.mockResolvedValue({ success: false, error: "db down" });
    const user = userEvent.setup();
    renderManager([makeUser({ id: "user-2" })]);

    await user.click(screen.getByRole("button", IMPERSONATE));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
    consoleError.mockRestore();
  });

  it("w trakcie żądania wszystkie przyciski impersonacji są zablokowane", async () => {
    let resolveImpersonate: (value: { error: null }) => void = () => {};
    mockImpersonateUser.mockReturnValue(
      new Promise((resolve) => {
        resolveImpersonate = resolve;
      }),
    );
    const user = userEvent.setup();
    renderManager([
      makeUser({ id: "user-2", name: "Dwa" }),
      makeUser({ id: "user-3", name: "Trzy" }),
    ]);

    const [first] = screen.getAllByRole("button", IMPERSONATE);
    await user.click(first);

    for (const button of screen.getAllByRole("button", IMPERSONATE)) {
      expect(button).toBeDisabled();
    }

    resolveImpersonate({ error: null });
    await waitFor(() => {
      for (const button of screen.getAllByRole("button", IMPERSONATE)) {
        expect(button).not.toBeDisabled();
      }
    });
  });
});

describe("UsersManager: kto widzi „Zaloguj jako”", () => {
  beforeEach(() => {
    mockImpersonateUser.mockResolvedValue({ error: null });
    mockLogStart.mockResolvedValue({ success: true });
  });

  it.each([
    ["superadmin", false, "user"],
    ["superadmin", false, "admin"],
    ["superadmin", true, "user"],
    ["superadmin", true, "admin"],
    ["admin", true, "user"],
  ] as const)(
    "aktor %s (ADMIN_IMPERSONATION=%s) → w wierszu %s jest aktywny przycisk „Zaloguj jako”",
    (currentUserRole, adminImpersonation, targetRole) => {
      renderManager(TARGETS, {
        currentUserId: "viewer",
        currentUserRole,
        adminImpersonation,
      });

      expect(
        within(rowOf(TARGET_EMAILS[targetRole])).getByRole(
          "button",
          IMPERSONATE,
        ),
      ).toBeEnabled();
    },
  );

  it.each([
    ["superadmin", false, "superadmin"],
    ["admin", false, "user"],
    ["admin", false, "admin"],
    ["admin", false, "superadmin"],
    ["admin", true, "admin"],
    ["admin", true, "superadmin"],
  ] as const)(
    "aktor %s (ADMIN_IMPERSONATION=%s) → w wierszu %s nie ma przycisku „Zaloguj jako”",
    (currentUserRole, adminImpersonation, targetRole) => {
      renderManager(TARGETS, {
        currentUserId: "viewer",
        currentUserRole,
        adminImpersonation,
      });

      expect(
        within(rowOf(TARGET_EMAILS[targetRole])).queryByRole(
          "button",
          IMPERSONATE,
        ),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    ["superadmin", false, 2],
    ["superadmin", true, 2],
    ["admin", false, 0],
    ["admin", true, 1],
  ] as const)(
    "aktor %s (ADMIN_IMPERSONATION=%s) widzi w tabeli %s przycisków „Zaloguj jako”",
    (currentUserRole, adminImpersonation, expectedCount) => {
      renderManager(TARGETS, {
        currentUserId: "viewer",
        currentUserRole,
        adminImpersonation,
      });

      expect(screen.queryAllByRole("button", IMPERSONATE)).toHaveLength(
        expectedCount,
      );
    },
  );

  it("superadmin nie widzi „Zaloguj jako” we własnym wierszu, nawet gdy lista pokazuje go jako admina", () => {
    renderManager(
      [
        makeUser({ id: "me", email: "ja@webamigos.pl", role: "admin" }),
        makeUser({ id: "other", email: "inny@firma.pl", role: "admin" }),
      ],
      {
        currentUserId: "me",
        currentUserRole: "superadmin",
        adminImpersonation: false,
      },
    );

    expect(
      within(rowOf("ja@webamigos.pl")).queryByRole("button", IMPERSONATE),
    ).not.toBeInTheDocument();
    expect(
      within(rowOf("inny@firma.pl")).getByRole("button", IMPERSONATE),
    ).toBeEnabled();
  });

  it("admin przy ADMIN_IMPERSONATION=true nie widzi „Zaloguj jako” we własnym wierszu, nawet gdy lista pokazuje go jako użytkownika", () => {
    renderManager(
      [
        makeUser({ id: "me", email: "ja@firma.pl", role: "user" }),
        makeUser({ id: "other", email: "inny@firma.pl", role: "user" }),
      ],
      {
        currentUserId: "me",
        currentUserRole: "admin",
        adminImpersonation: true,
      },
    );

    expect(
      within(rowOf("ja@firma.pl")).queryByRole("button", IMPERSONATE),
    ).not.toBeInTheDocument();
    expect(
      within(rowOf("inny@firma.pl")).getByRole("button", IMPERSONATE),
    ).toBeEnabled();
  });

  it("przycisk „Zaloguj jako” ma podpowiedź „Zaloguj jako”", () => {
    renderManager(TARGETS, {
      currentUserId: "viewer",
      currentUserRole: "superadmin",
      adminImpersonation: false,
    });

    expect(
      within(rowOf(USER_EMAIL)).getByRole("button", IMPERSONATE),
    ).toHaveAttribute("title", "Zaloguj jako");
  });

  it("zmiana roli bieżącego użytkownika z superadmin na admin zabiera „Zaloguj jako” z wiersza admina", () => {
    const { rerender } = renderManager(TARGETS, {
      currentUserId: "viewer",
      currentUserRole: "superadmin",
      adminImpersonation: false,
    });
    expect(
      within(rowOf(ADMIN_EMAIL)).getByRole("button", IMPERSONATE),
    ).toBeEnabled();

    rerender(
      managerElement(TARGETS, {
        currentUserId: "viewer",
        currentUserRole: "admin",
        adminImpersonation: false,
      }),
    );

    expect(
      within(rowOf(ADMIN_EMAIL)).queryByRole("button", IMPERSONATE),
    ).not.toBeInTheDocument();
  });

  it("włączenie ADMIN_IMPERSONATION przy roli admin daje aktywne „Zaloguj jako” w wierszu użytkownika", () => {
    const { rerender } = renderManager(TARGETS, {
      currentUserId: "viewer",
      currentUserRole: "admin",
      adminImpersonation: false,
    });
    expect(
      within(rowOf(USER_EMAIL)).queryByRole("button", IMPERSONATE),
    ).not.toBeInTheDocument();

    rerender(
      managerElement(TARGETS, {
        currentUserId: "viewer",
        currentUserRole: "admin",
        adminImpersonation: true,
      }),
    );

    expect(
      within(rowOf(USER_EMAIL)).getByRole("button", IMPERSONATE),
    ).toBeEnabled();
  });

  it("admin przy ADMIN_IMPERSONATION=true impersonuje zwykłego użytkownika", async () => {
    const user = userEvent.setup();
    renderManager(TARGETS, {
      currentUserId: "viewer",
      currentUserRole: "admin",
      adminImpersonation: true,
    });

    await user.click(
      within(rowOf(USER_EMAIL)).getByRole("button", IMPERSONATE),
    );

    expect(mockImpersonateUser).toHaveBeenCalledWith({
      userId: "target-user",
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
  });
});

describe("UsersManager: wiersz konta serwisowego", () => {
  it.each([[false], [true]])(
    "admin (ADMIN_IMPERSONATION=%s) nie ma żadnej akcji w wierszu superadmina",
    (adminImpersonation) => {
      renderManager(TARGETS, {
        currentUserId: "viewer",
        currentUserRole: "admin",
        adminImpersonation,
      });

      const serviceRow = rowOf(SUPERADMIN_EMAIL);
      expect(within(serviceRow).queryAllByRole("button")).toHaveLength(0);
      expect(within(serviceRow).queryAllByRole("link")).toHaveLength(0);
      expect(within(serviceRow).queryAllByRole("menuitem")).toHaveLength(0);
    },
  );

  it("superadmin w wierszu innego superadmina nie ma „Zaloguj jako”", () => {
    renderManager(TARGETS, {
      currentUserId: "viewer",
      currentUserRole: "superadmin",
      adminImpersonation: true,
    });

    expect(
      within(rowOf(SUPERADMIN_EMAIL)).queryByRole("button", IMPERSONATE),
    ).not.toBeInTheDocument();
  });

  it("wiersz superadmina ma odznakę „Serwis (Web Amigos)”, a nie „Administrator”", () => {
    renderManager(TARGETS, {
      currentUserId: "viewer",
      currentUserRole: "admin",
      adminImpersonation: false,
    });

    const serviceRow = rowOf(SUPERADMIN_EMAIL);
    expect(
      within(serviceRow).getByText("Serwis (Web Amigos)"),
    ).toBeInTheDocument();
    expect(
      within(serviceRow).queryByText("Administrator"),
    ).not.toBeInTheDocument();
    expect(
      within(rowOf(ADMIN_EMAIL)).queryByText("Serwis (Web Amigos)"),
    ).not.toBeInTheDocument();
  });
});
