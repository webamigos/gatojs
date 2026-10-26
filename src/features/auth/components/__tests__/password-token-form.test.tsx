import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderAuthForm } from "./helpers/render";
import { AUTH_SUCCESS, AUTH_ERROR } from "./helpers/mocks";

const { mockResetPassword, mockPush, mockToastError, mockSearchParams } =
  vi.hoisted(() => ({
    mockResetPassword: vi.fn(),
    mockPush: vi.fn(),
    mockToastError: vi.fn(),
    mockSearchParams: vi
      .fn()
      .mockReturnValue(new URLSearchParams("token=valid-token-123")),
  }));

vi.mock("@/shared/lib/auth/client", () => ({
  authClient: { resetPassword: mockResetPassword },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: mockSearchParams,
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: mockPush }),
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));

import { PasswordTokenForm } from "../password-token-form";

const DEFAULT_PROPS = {
  title: "Ustaw nowe hasło",
  description: "Wprowadź nowe hasło dla swojego konta.",
  expiredTitle: "Link wygasł",
  expiredDescription:
    "Ten link resetujący jest nieprawidłowy lub wygasł. Poproś o nowy.",
};

describe("PasswordTokenForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.mockReturnValue(
      new URLSearchParams("token=valid-token-123"),
    );
  });

  it("z tokenem w URL renderuje przekazany tytuł, opis i pola hasła", () => {
    renderAuthForm(<PasswordTokenForm {...DEFAULT_PROPS} />);

    expect(screen.getByText("Ustaw nowe hasło")).toBeInTheDocument();
    expect(
      screen.getByText("Wprowadź nowe hasło dla swojego konta."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nowe hasło")).toBeInTheDocument();
    expect(screen.getByLabelText("Powtórz hasło")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zapisz nowe hasło" }),
    ).toBeInTheDocument();
  });

  it("bez tokenu w URL pokazuje przekazany tytuł/opis wygasłego linku z odnośnikiem do /forgot-password", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(""));
    renderAuthForm(<PasswordTokenForm {...DEFAULT_PROPS} />);

    expect(screen.getByText("Link wygasł")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ten link resetujący jest nieprawidłowy lub wygasł. Poproś o nowy.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Nowe hasło")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Poproś o nowy link" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("z parametrem error w URL pokazuje kartę wygasłego linku", () => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams("error=invalid_token"),
    );
    renderAuthForm(<PasswordTokenForm {...DEFAULT_PROPS} />);

    expect(screen.getByText("Link wygasł")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nowe hasło")).not.toBeInTheDocument();
  });

  it("pokazuje błąd walidacji gdy hasła się nie zgadzają", async () => {
    const user = userEvent.setup();
    renderAuthForm(<PasswordTokenForm {...DEFAULT_PROPS} />);

    await user.type(screen.getByLabelText("Nowe hasło"), "password123");
    await user.type(screen.getByLabelText("Powtórz hasło"), "different456");
    await user.click(screen.getByRole("button", { name: "Zapisz nowe hasło" }));

    expect(
      await screen.findByText("Hasła nie są identyczne"),
    ).toBeInTheDocument();
  });

  it("wywołuje authClient.resetPassword z tokenem i przekierowuje na /sign-in po sukcesie", async () => {
    const user = userEvent.setup();
    mockResetPassword.mockResolvedValue(AUTH_SUCCESS);
    renderAuthForm(<PasswordTokenForm {...DEFAULT_PROPS} />);

    await user.type(screen.getByLabelText("Nowe hasło"), "newpassword123");
    await user.type(screen.getByLabelText("Powtórz hasło"), "newpassword123");
    await user.click(screen.getByRole("button", { name: "Zapisz nowe hasło" }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith({
        newPassword: "newpassword123",
        token: "valid-token-123",
      });
      expect(mockPush).toHaveBeenCalledWith("/sign-in");
    });
  });

  it("pokazuje toast błędu gdy authClient zwraca error", async () => {
    const user = userEvent.setup();
    mockResetPassword.mockResolvedValue(AUTH_ERROR);
    renderAuthForm(<PasswordTokenForm {...DEFAULT_PROPS} />);

    await user.type(screen.getByLabelText("Nowe hasło"), "newpassword123");
    await user.type(screen.getByLabelText("Powtórz hasło"), "newpassword123");
    await user.click(screen.getByRole("button", { name: "Zapisz nowe hasło" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Nie udało się zresetować hasła",
      );
    });
  });

  it("pokazuje toast błędu połączenia gdy authClient rzuca wyjątek", async () => {
    const user = userEvent.setup();
    mockResetPassword.mockRejectedValue(new Error("network error"));
    renderAuthForm(<PasswordTokenForm {...DEFAULT_PROPS} />);

    await user.type(screen.getByLabelText("Nowe hasło"), "newpassword123");
    await user.type(screen.getByLabelText("Powtórz hasło"), "newpassword123");
    await user.click(screen.getByRole("button", { name: "Zapisz nowe hasło" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Wystąpił błąd połączenia. Spróbuj ponownie.",
      );
    });
  });
});
