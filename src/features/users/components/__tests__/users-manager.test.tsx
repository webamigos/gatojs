import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { UserAccountListItem } from "../../contracts/user-account.types";
import { usersMessages } from "./messages";

const {
  mockImpersonateUser,
  mockLogStart,
  mockPush,
  mockRefresh,
  mockToastError,
} = vi.hoisted(() => ({
  mockImpersonateUser: vi.fn(),
  mockLogStart: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
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

function renderManager(
  users: UserAccountListItem[] = [],
  currentUserId = "admin-1",
) {
  return render(
    <NextIntlClientProvider locale="pl" messages={usersMessages}>
      <UsersManager users={users} currentUserId={currentUserId} />
    </NextIntlClientProvider>,
  );
}

const IMPERSONATE = { name: "Zaloguj jako" };

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

  it("blokuje impersonację własnego konta", () => {
    renderManager([makeUser({ id: "admin-1" })], "admin-1");
    expect(screen.getByRole("button", IMPERSONATE)).toBeDisabled();
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
