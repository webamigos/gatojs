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
  useSearchParams: mockSearchParams,
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { SetPasswordForm } from "../set-password-form";

describe("SetPasswordForm", () => {
  beforeEach(() => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams("token=valid-token-123"),
    );
  });

  it("renders the welcome/set-password copy (behavior is covered by PasswordTokenForm's own tests)", () => {
    renderAuthForm(<SetPasswordForm />);

    expect(screen.getByText("Witamy")).toBeInTheDocument();
    expect(
      screen.getByText("Ustaw hasło, aby dokończyć zakładanie konta."),
    ).toBeInTheDocument();
  });

  it("renders the set-password expired copy when the token is missing", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(""));
    renderAuthForm(<SetPasswordForm />);

    expect(screen.getByText("Link wygasł")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ten link jest nieprawidłowy lub wygasł. Poproś o nowy przez formularz logowania.",
      ),
    ).toBeInTheDocument();
  });
});
