import { screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderAuthForm } from "./helpers/render";

const { mockSearchParams } = vi.hoisted(() => ({
  mockSearchParams: vi
    .fn()
    .mockReturnValue(new URLSearchParams("token=valid-token-123")),
}));

vi.mock("@/shared/lib/auth/client", () => ({
  authClient: { resetPassword: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: mockSearchParams,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { ResetPasswordForm } from "../reset-password-form";

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams("token=valid-token-123"),
    );
  });

  it("renders the classic reset-password copy (behavior is covered by PasswordTokenForm's own tests)", () => {
    renderAuthForm(<ResetPasswordForm />);

    expect(screen.getByText("Ustaw nowe hasło")).toBeInTheDocument();
    expect(
      screen.getByText("Wprowadź nowe hasło dla swojego konta."),
    ).toBeInTheDocument();
  });

  it("renders the reset-password expired copy when the token is missing", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(""));
    renderAuthForm(<ResetPasswordForm />);

    expect(screen.getByText("Link wygasł")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ten link resetujący jest nieprawidłowy lub wygasł. Poproś o nowy.",
      ),
    ).toBeInTheDocument();
  });
});
