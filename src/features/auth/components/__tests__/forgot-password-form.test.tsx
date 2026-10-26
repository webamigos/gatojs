import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderAuthForm } from "./helpers/render";
import { AUTH_SUCCESS, AUTH_ERROR } from "./helpers/mocks";

const { mockRequestPasswordReset, mockToastError } = vi.hoisted(() => ({
  mockRequestPasswordReset: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/shared/lib/auth/client", () => ({
  authClient: { requestPasswordReset: mockRequestPasswordReset },
}));

vi.mock("@/i18n/routing", () => ({
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

import { ForgotPasswordForm } from "../forgot-password-form";

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderuje pole email i przycisk wysłania linku", () => {
    renderAuthForm(<ForgotPasswordForm />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Wyślij link" }),
    ).toBeInTheDocument();
  });

  it("pokazuje błąd walidacji gdy email jest nieprawidłowy", async () => {
    const user = userEvent.setup();
    renderAuthForm(<ForgotPasswordForm />);

    await user.click(screen.getByRole("button", { name: "Wyślij link" }));

    expect(
      await screen.findByText("Podaj prawidłowy adres email"),
    ).toBeInTheDocument();
  });

  it("pokazuje potwierdzenie z adresem email po sukcesie i ukrywa formularz", async () => {
    const user = userEvent.setup();
    mockRequestPasswordReset.mockResolvedValue(AUTH_SUCCESS);
    renderAuthForm(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Wyślij link" }));

    expect(
      await screen.findByText(
        /wysłaliśmy link do resetu hasła na adres test@example\.com/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Wyślij link" }),
    ).not.toBeInTheDocument();
  });

  it("pokazuje toast błędu gdy authClient zwraca error", async () => {
    const user = userEvent.setup();
    mockRequestPasswordReset.mockResolvedValue(AUTH_ERROR);
    renderAuthForm(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Wyślij link" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Nie udało się wysłać linku resetującego",
      );
    });
  });

  it("pokazuje toast błędu połączenia gdy authClient rzuca wyjątek", async () => {
    const user = userEvent.setup();
    mockRequestPasswordReset.mockRejectedValue(new Error("network error"));
    renderAuthForm(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Wyślij link" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Wystąpił błąd połączenia. Spróbuj ponownie.",
      );
    });
  });
});
