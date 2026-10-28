import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import organizationsPl from "@/features/organizations/i18n/pl.json";

const {
  mockGetOrgContext,
  mockGetSwitchableOrganizations,
  mockRedirect,
  mockEnv,
} = vi.hoisted(() => ({
  mockGetOrgContext: vi.fn(),
  mockGetSwitchableOrganizations: vi.fn(),
  mockRedirect: vi.fn((args: unknown) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { args });
  }),
  mockEnv: { MULTI_ORG: false },
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator: create } = await import("next-intl");
  const messages = (await import("@/features/organizations/i18n/pl.json"))
    .default;
  return {
    setRequestLocale: vi.fn(),
    getTranslations: vi.fn(async (namespace: string) =>
      create({
        locale: "pl",
        messages: { [namespace]: messages },
        namespace,
      }),
    ),
  };
});
vi.mock("@/i18n/routing", () => ({
  redirect: mockRedirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/shared/lib/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/auth/org-context", () => {
  class NoOrganizationError extends Error {}
  return { NoOrganizationError, getOrgContext: mockGetOrgContext };
});
vi.mock(
  "@/features/organizations/services/queries/switchable-organizations-query",
  () => ({ getSwitchableOrganizationsQuery: mockGetSwitchableOrganizations }),
);
vi.mock(
  "@/features/organizations/services/commands/enter-organization-command",
  () => ({ enterOrganizationCommand: vi.fn() }),
);
vi.mock("@/features/organizations/components/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Wyloguj się</button>,
}));
vi.mock("@/features/organizations/components/create-organization-form", () => ({
  CreateOrganizationForm: () => null,
}));

import { NoOrganizationError } from "@/shared/lib/auth/org-context";
import NoOrganizationPage from "../page";

const params = Promise.resolve({ locale: "pl" });

async function renderPage() {
  const page = await NoOrganizationPage({ params });
  return render(
    <NextIntlClientProvider
      locale="pl"
      messages={{ ...coreMessages, organizations: organizationsPl }}
    >
      {page}
    </NextIntlClientProvider>,
  );
}

describe("strona /no-organization", () => {
  beforeEach(() => {
    mockEnv.MULTI_ORG = false;
    mockGetOrgContext.mockRejectedValue(new NoOrganizationError());
    mockGetSwitchableOrganizations.mockResolvedValue([]);
  });

  it("pusta lista organizacji → brak przycisków wejścia", async () => {
    await renderPage();

    expect(screen.getByText("Brak organizacji")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Wyloguj się"]);
    expect(screen.queryByText("Wejdź do organizacji")).not.toBeInTheDocument();
  });

  it("niepusta lista → przycisk wejścia z nazwą każdej organizacji", async () => {
    mockGetSwitchableOrganizations.mockResolvedValue([
      { id: "org-a", name: "Alfa", isMember: false },
      { id: "org-b", name: "Beta", isMember: false },
    ]);

    await renderPage();

    expect(screen.getByText("Wejdź do organizacji")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alfa" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Beta" })).toBeEnabled();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("użytkownik z działającym kontekstem organizacji → przekierowanie na /dashboard", async () => {
    mockGetOrgContext.mockResolvedValue({
      userId: "u1",
      organizationId: "org-a",
      orgRole: "member",
      userRole: "user",
      serviceMode: false,
    });

    await expect(NoOrganizationPage({ params })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mockRedirect).toHaveBeenCalledWith({
      href: "/dashboard",
      locale: "pl",
    });
  });

  it("inne błędy kontekstu nie są połykane", async () => {
    mockGetOrgContext.mockRejectedValue(new Error("db down"));

    await expect(NoOrganizationPage({ params })).rejects.toThrow("db down");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
