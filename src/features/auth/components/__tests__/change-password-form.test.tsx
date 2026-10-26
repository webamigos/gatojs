import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderAuthForm } from "./helpers/render";
import { CMD_SUCCESS, CMD_FAILURE } from "./helpers/mocks";

const { mockChangePassword, mockToastError, mockToastSuccess } = vi.hoisted(
  () => ({
    mockChangePassword: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
  }),
);

vi.mock("@/features/auth/services/commands/change-password-command", () => ({
  changePasswordCommand: mockChangePassword,
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

import { ChangePasswordForm } from "../change-password-form";

describe("ChangePasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderuje pola aktualne hasło, nowe hasło i powtórz nowe hasło", () => {
    renderAuthForm(<ChangePasswordForm />);

    expect(screen.getByLabelText("Aktualne hasło")).toBeInTheDocument();
    expect(screen.getByLabelText("Nowe hasło")).toBeInTheDocument();
    expect(screen.getByLabelText("Powtórz nowe hasło")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zmień hasło" }),
    ).toBeInTheDocument();
  });

  it("pokazuje błąd walidacji gdy aktualne hasło jest puste", async () => {
    const user = userEvent.setup();
    renderAuthForm(<ChangePasswordForm />);

    await user.click(screen.getByRole("button", { name: "Zmień hasło" }));

    expect(await screen.findByText("Podaj aktualne hasło")).toBeInTheDocument();
  });

  it("pokazuje błąd walidacji gdy nowe hasło jest za krótkie", async () => {
    const user = userEvent.setup();
    renderAuthForm(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("Aktualne hasło"), "currentpass");
    await user.type(screen.getByLabelText("Nowe hasło"), "short");
    await user.click(screen.getByRole("button", { name: "Zmień hasło" }));

    expect(
      await screen.findByText("Nowe hasło musi mieć co najmniej 8 znaków"),
    ).toBeInTheDocument();
  });

  it("pokazuje błąd walidacji gdy hasła się nie zgadzają", async () => {
    const user = userEvent.setup();
    renderAuthForm(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("Aktualne hasło"), "currentpass");
    await user.type(screen.getByLabelText("Nowe hasło"), "newpassword123");
    await user.type(
      screen.getByLabelText("Powtórz nowe hasło"),
      "different456",
    );
    await user.click(screen.getByRole("button", { name: "Zmień hasło" }));

    expect(
      await screen.findByText("Nowe hasła nie są identyczne"),
    ).toBeInTheDocument();
  });

  it("pokazuje toast sukcesu i resetuje formularz po pomyślnej zmianie hasła", async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue(CMD_SUCCESS);
    renderAuthForm(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("Aktualne hasło"), "currentpass");
    await user.type(screen.getByLabelText("Nowe hasło"), "newpassword123");
    await user.type(
      screen.getByLabelText("Powtórz nowe hasło"),
      "newpassword123",
    );
    await user.click(screen.getByRole("button", { name: "Zmień hasło" }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Hasło zostało zmienione");
    });
    expect(screen.getByLabelText("Aktualne hasło")).toHaveValue("");
    expect(screen.getByLabelText("Nowe hasło")).toHaveValue("");
    expect(screen.getByLabelText("Powtórz nowe hasło")).toHaveValue("");
  });

  it("pokazuje toast błędu z treścią z serwera gdy komenda zwraca failure", async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue(CMD_FAILURE);
    renderAuthForm(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("Aktualne hasło"), "currentpass");
    await user.type(screen.getByLabelText("Nowe hasło"), "newpassword123");
    await user.type(
      screen.getByLabelText("Powtórz nowe hasło"),
      "newpassword123",
    );
    await user.click(screen.getByRole("button", { name: "Zmień hasło" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Błąd serwera");
    });
  });
});
