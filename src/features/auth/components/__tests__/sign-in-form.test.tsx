import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderAuthForm } from "./helpers/render";
import { AUTH_SUCCESS, AUTH_ERROR } from "./helpers/mocks";

const { mockSignIn, mockPush, mockToastError } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockPush: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/shared/lib/auth/client", () => ({
  authClient: {
    signIn: { email: mockSignIn },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));

import { SignInForm } from "../sign-in-form";

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderuje pola email, hasło i przycisk submit", () => {
    renderAuthForm(<SignInForm />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Hasło")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zaloguj się" }),
    ).toBeInTheDocument();
  });

  it("pokazuje błąd walidacji gdy email jest pusty", async () => {
    const user = userEvent.setup();
    renderAuthForm(<SignInForm />);

    await user.click(screen.getByRole("button", { name: "Zaloguj się" }));

    expect(
      await screen.findByText("Podaj prawidłowy adres email"),
    ).toBeInTheDocument();
  });

  it("pokazuje błąd walidacji gdy hasło jest puste", async () => {
    const user = userEvent.setup();
    renderAuthForm(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Zaloguj się" }));

    expect(await screen.findByText("Podaj hasło")).toBeInTheDocument();
  });

  it("wywołuje authClient.signIn.email i przekierowuje na /dashboard po sukcesie", async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue(AUTH_SUCCESS);
    renderAuthForm(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Hasło"), "password123");
    await user.click(screen.getByRole("button", { name: "Zaloguj się" }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("pokazuje toast błędu gdy authClient zwraca error", async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue(AUTH_ERROR);
    renderAuthForm(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Hasło"), "password123");
    await user.click(screen.getByRole("button", { name: "Zaloguj się" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Nie udało się zalogować");
    });
  });

  it("pokazuje toast błędu połączenia gdy authClient rzuca wyjątek", async () => {
    const user = userEvent.setup();
    mockSignIn.mockRejectedValue(new Error("network error"));
    renderAuthForm(<SignInForm />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Hasło"), "password123");
    await user.click(screen.getByRole("button", { name: "Zaloguj się" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Wystąpił błąd połączenia. Spróbuj ponownie.",
      );
    });
  });
});
