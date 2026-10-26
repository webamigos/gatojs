import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderAuthForm } from "./helpers/render";
import { AUTH_SUCCESS, AUTH_ERROR } from "./helpers/mocks";

const { mockSignUp, mockPush, mockToastError, mockToastSuccess } = vi.hoisted(
  () => ({
    mockSignUp: vi.fn(),
    mockPush: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
  }),
);

vi.mock("@/shared/lib/auth/client", () => ({
  authClient: {
    signUp: { email: mockSignUp },
  },
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
  toast: { error: mockToastError, success: mockToastSuccess },
}));

import { SignUpForm } from "../sign-up-form";

describe("SignUpForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderuje pola name, email, hasło i przycisk submit", () => {
    renderAuthForm(<SignUpForm />);

    expect(screen.getByLabelText("Imię i nazwisko")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Hasło")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zarejestruj się" }),
    ).toBeInTheDocument();
  });

  it("pokazuje błędy walidacji dla pustego imienia, nieprawidłowego emaila i za krótkiego hasła", async () => {
    const user = userEvent.setup();
    renderAuthForm(<SignUpForm />);

    await user.click(screen.getByRole("button", { name: "Zarejestruj się" }));

    expect(
      await screen.findByText("Podaj imię i nazwisko"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Podaj prawidłowy adres email"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Hasło musi mieć co najmniej 8 znaków"),
    ).toBeInTheDocument();
  });

  it("wywołuje authClient.signUp.email, pokazuje toast sukcesu i przekierowuje na /sign-in", async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue(AUTH_SUCCESS);
    renderAuthForm(<SignUpForm />);

    await user.type(screen.getByLabelText("Imię i nazwisko"), "Jan Kowalski");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Hasło"), "password123");
    await user.click(screen.getByRole("button", { name: "Zarejestruj się" }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        name: "Jan Kowalski",
        email: "test@example.com",
        password: "password123",
      });
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Konto zostało utworzone. Zaloguj się.",
      );
      expect(mockPush).toHaveBeenCalledWith("/sign-in");
    });
  });

  it("pokazuje komunikat serwera gdy authClient zwraca error z message", async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue({
      data: null,
      error: {
        message:
          "Aplikacja nie jest skonfigurowana: uruchom npm run admin:create",
        status: 500,
        statusText: "Internal Server Error",
      },
    });
    renderAuthForm(<SignUpForm />);

    await user.type(screen.getByLabelText("Imię i nazwisko"), "Jan Kowalski");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Hasło"), "password123");
    await user.click(screen.getByRole("button", { name: "Zarejestruj się" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Aplikacja nie jest skonfigurowana: uruchom npm run admin:create",
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("pokazuje ogólny toast błędu gdy error nie ma message", async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue({
      ...AUTH_ERROR,
      error: { status: 400, statusText: "Bad Request" },
    });
    renderAuthForm(<SignUpForm />);

    await user.type(screen.getByLabelText("Imię i nazwisko"), "Jan Kowalski");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Hasło"), "password123");
    await user.click(screen.getByRole("button", { name: "Zarejestruj się" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Nie udało się utworzyć konta",
      );
    });
  });

  it("pokazuje toast błędu połączenia gdy authClient rzuca wyjątek", async () => {
    const user = userEvent.setup();
    mockSignUp.mockRejectedValue(new Error("network error"));
    renderAuthForm(<SignUpForm />);

    await user.type(screen.getByLabelText("Imię i nazwisko"), "Jan Kowalski");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Hasło"), "password123");
    await user.click(screen.getByRole("button", { name: "Zarejestruj się" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Wystąpił błąd połączenia. Spróbuj ponownie.",
      );
    });
  });

  it("dołącza invitationId do żądania rejestracji gdy podano zaproszenie", async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue(AUTH_SUCCESS);
    renderAuthForm(<SignUpForm invitationId="inv-1" />);

    await user.type(screen.getByLabelText("Imię i nazwisko"), "Jan Kowalski");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Hasło"), "password123");
    await user.click(screen.getByRole("button", { name: "Zarejestruj się" }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        name: "Jan Kowalski",
        email: "test@example.com",
        password: "password123",
        invitationId: "inv-1",
      });
    });
  });
});
