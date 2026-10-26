import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { usersMessages } from "./messages";

const {
  mockRefresh,
  mockInviteUserCommand,
  mockToastSuccess,
  mockToastWarning,
  mockToastError,
} = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockInviteUserCommand: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastWarning: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
vi.mock("../../services/commands/invite-user-command", () => ({
  inviteUserCommand: mockInviteUserCommand,
}));
vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    warning: mockToastWarning,
    error: mockToastError,
  },
}));

import { InviteUserDialog } from "../invite-user-dialog";

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="pl" messages={usersMessages}>
      <InviteUserDialog />
    </NextIntlClientProvider>,
  );
}

async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Zaproś użytkownika" }));
  const dialog = within(document.body);
  await dialog.findByRole("dialog");
  await user.type(
    dialog.getByLabelText("Imię i nazwisko", { exact: false }),
    "Anna Nowak",
  );
  await user.type(
    dialog.getByLabelText("Email", { exact: false }),
    "anna@firma.pl",
  );
  return dialog;
}

describe("InviteUserDialog", () => {
  beforeEach(() => {
    mockInviteUserCommand.mockResolvedValue({
      success: true,
      data: { userId: "new-1" },
    });
  });

  it("wysyła zaproszenie z domyślną rolą członka i odświeża widok", async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = await openAndFill(user);
    await user.click(
      dialog.getByRole("button", { name: "Wyślij zaproszenie" }),
    );

    await waitFor(() => {
      expect(mockInviteUserCommand).toHaveBeenCalledWith({
        name: "Anna Nowak",
        email: "anna@firma.pl",
        role: "member",
      });
      expect(mockRefresh).toHaveBeenCalled();
    });
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("ostrzeżenie mail-failed → toast ostrzegawczy zamiast sukcesu", async () => {
    mockInviteUserCommand.mockResolvedValue({
      success: true,
      data: { userId: "new-1" },
      warning: "mail-failed",
    });
    const user = userEvent.setup();
    renderDialog();

    const dialog = await openAndFill(user);
    await user.click(
      dialog.getByRole("button", { name: "Wyślij zaproszenie" }),
    );

    await waitFor(() => expect(mockToastWarning).toHaveBeenCalled());
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("pozwala wybrać rolę administratora organizacji", async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = await openAndFill(user);
    await user.click(
      dialog.getByRole("combobox", { name: /Rola w organizacji/ }),
    );
    await user.click(
      await within(document.body).findByRole("option", {
        name: "Administrator organizacji",
      }),
    );
    await user.click(
      dialog.getByRole("button", { name: "Wyślij zaproszenie" }),
    );

    await waitFor(() =>
      expect(mockInviteUserCommand).toHaveBeenCalledWith(
        expect.objectContaining({ role: "admin" }),
      ),
    );
  });

  it("błąd komendy → toast i otwarty dialog", async () => {
    mockInviteUserCommand.mockResolvedValue({
      success: false,
      error: "Użytkownik z tym adresem już istnieje",
    });
    const user = userEvent.setup();
    renderDialog();

    const dialog = await openAndFill(user);
    await user.click(
      dialog.getByRole("button", { name: "Wyślij zaproszenie" }),
    );

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Użytkownik z tym adresem już istnieje",
      ),
    );
    expect(
      dialog.getByRole("heading", { name: "Zaproś użytkownika" }),
    ).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
