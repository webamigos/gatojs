import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import plMessages from "@/app/messages/pl.json";

const {
  mockGetOrgContext,
  mockRedirect,
  mockGetCurrentUserWithImpersonation,
  mockEnv,
  sidebarProps,
  bannerProps,
  switcherProps,
  mockGetSwitchableOrganizations,
} = vi.hoisted(() => ({
  mockGetOrgContext: vi.fn(),
  mockRedirect: vi.fn((args: unknown) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { args });
  }),
  mockGetCurrentUserWithImpersonation: vi.fn(),
  mockEnv: { MULTI_ORG: false },
  sidebarProps: vi.fn(),
  bannerProps: vi.fn(),
  switcherProps: vi.fn(),
  mockGetSwitchableOrganizations: vi.fn(),
}));

vi.mock("@/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/auth/helpers", () => ({
  getCurrentUserWithImpersonation: mockGetCurrentUserWithImpersonation,
}));
vi.mock("@/shared/lib/auth/org-context", async () => {
  class NoOrganizationError extends Error {}
  return { NoOrganizationError, getOrgContext: mockGetOrgContext };
});
vi.mock("@/shared/components/app-sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => children,
  MobileHeader: () => null,
  AppSidebar: (props: unknown) => {
    sidebarProps(props);
    return <nav>sidebar</nav>;
  },
}));
vi.mock("@/features/users/components/impersonation-banner", () => ({
  ImpersonationBanner: (props: unknown) => {
    bannerProps(props);
    return null;
  },
}));
vi.mock("@/features/users/services/commands/impersonation-commands", () => ({
  logImpersonationStopCommand: vi.fn(),
}));
vi.mock("@/features/organizations/components/org-switcher", () => ({
  OrgSwitcher: (props: unknown) => {
    switcherProps(props);
    return <div>switcher</div>;
  },
}));
vi.mock(
  "@/features/organizations/services/queries/switchable-organizations-query",
  () => ({ getSwitchableOrganizationsQuery: mockGetSwitchableOrganizations }),
);

import { NoOrganizationError } from "@/shared/lib/auth/org-context";
import AppLayout from "../layout";

const params = Promise.resolve({ locale: "en" });

function renderLayout(layout: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pl" messages={plMessages}>
      {layout}
    </NextIntlClientProvider>,
  );
}

const SERVICE_CONTEXT = {
  userId: "sa-1",
  organizationId: "org-9",
  orgRole: "owner",
  userRole: "superadmin",
  serviceMode: true,
};
const MEMBER_CONTEXT = {
  userId: "u1",
  organizationId: "org-1",
  orgRole: "member",
  userRole: "user",
  serviceMode: false,
};
const SWITCHABLE_ORGANIZATIONS = [
  { id: "org-1", name: "Pierwsza", isMember: true },
  { id: "org-2", name: "Druga", isMember: true },
];

describe("(app) layout", () => {
  beforeEach(() => {
    mockEnv.MULTI_ORG = false;
    mockGetOrgContext.mockResolvedValue(MEMBER_CONTEXT);
    mockGetSwitchableOrganizations.mockResolvedValue(SWITCHABLE_ORGANIZATIONS);
    mockGetCurrentUserWithImpersonation.mockResolvedValue({
      user: { id: "u1", name: "Jan", email: "jan@firma.pl" },
      impersonatedBy: null,
    });
  });

  it("użytkownik bez członkostwa → przekierowanie na /no-organization, nie 500", async () => {
    mockGetOrgContext.mockRejectedValue(new NoOrganizationError());

    await expect(AppLayout({ children: "treść", params })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mockRedirect).toHaveBeenCalledWith({
      href: "/no-organization",
      locale: "en",
    });
  });

  it("inne błędy nie są połykane", async () => {
    mockGetOrgContext.mockRejectedValue(new Error("db down"));

    await expect(AppLayout({ children: "treść", params })).rejects.toThrow(
      "db down",
    );
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("brak użytkownika w sesji → przekierowanie na /sign-in", async () => {
    mockGetCurrentUserWithImpersonation.mockResolvedValue({
      user: null,
      impersonatedBy: null,
    });

    await expect(AppLayout({ children: "treść", params })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mockRedirect).toHaveBeenCalledWith({
      href: "/sign-in",
      locale: "en",
    });
  });

  it("członek widzi zawartość w powłoce z sidebarem", async () => {
    renderLayout(await AppLayout({ children: <p>treść</p>, params }));

    expect(screen.getByText("treść")).toBeInTheDocument();
    expect(screen.getByText("sidebar")).toBeInTheDocument();
  });

  it("przekazuje do sidebara role z kontekstu organizacji i flagę MULTI_ORG", async () => {
    mockEnv.MULTI_ORG = true;
    mockGetOrgContext.mockResolvedValue({
      ...MEMBER_CONTEXT,
      orgRole: "owner",
    });

    renderLayout(await AppLayout({ children: null, params }));

    expect(sidebarProps).toHaveBeenCalledWith({
      accessContext: { userRole: "user", orgRole: "owner", multiOrg: true },
      userName: "Jan",
      userEmail: "jan@firma.pl",
    });
    expect(screen.getByText("switcher")).toBeInTheDocument();
  });

  it("przełącznik dostaje aktywną organizację z kontekstu i listę z query", async () => {
    mockEnv.MULTI_ORG = true;
    mockGetOrgContext.mockResolvedValue({
      ...MEMBER_CONTEXT,
      organizationId: "org-2",
    });

    renderLayout(await AppLayout({ children: null, params }));

    expect(switcherProps).toHaveBeenCalledWith(
      expect.objectContaining({
        organizations: [
          { id: "org-1", name: "Pierwsza", isMember: true },
          { id: "org-2", name: "Druga", isMember: true },
        ],
        activeOrganizationId: "org-2",
        canCreateOrganization: true,
      }),
    );
  });

  it("MULTI_ORG=false → przełącznik bez tworzenia organizacji", async () => {
    renderLayout(await AppLayout({ children: null, params }));

    expect(switcherProps).toHaveBeenCalledWith(
      expect.objectContaining({
        activeOrganizationId: "org-1",
        canCreateOrganization: false,
      }),
    );
  });

  it("superadmin w trybie serwisowym dostaje w przełączniku organizację serwisowaną", async () => {
    mockGetOrgContext.mockResolvedValue({
      userId: "sa-1",
      organizationId: "org-9",
      orgRole: "owner",
      userRole: "superadmin",
      serviceMode: true,
    });
    mockGetSwitchableOrganizations.mockResolvedValue([
      { id: "org-1", name: "Pierwsza", isMember: false },
      { id: "org-9", name: "Klient", isMember: false },
    ]);

    renderLayout(await AppLayout({ children: null, params }));

    expect(switcherProps).toHaveBeenCalledWith(
      expect.objectContaining({
        organizations: [
          { id: "org-1", name: "Pierwsza", isMember: false },
          { id: "org-9", name: "Klient", isMember: false },
        ],
        activeOrganizationId: "org-9",
      }),
    );
  });

  it("baner impersonacji jest aktywny tylko dla sesji impersonowanej", async () => {
    mockGetCurrentUserWithImpersonation.mockResolvedValue({
      user: { id: "u2", name: "", email: "u2@firma.pl" },
      impersonatedBy: "admin-1",
    });

    renderLayout(await AppLayout({ children: null, params }));

    expect(bannerProps).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, userName: "u2@firma.pl" }),
    );
  });

  describe("pasek trybu serwisowego", () => {
    it("serviceMode: true → pasek z nazwą aktywnej organizacji z listy przełącznika", async () => {
      mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);
      mockGetSwitchableOrganizations.mockResolvedValue([
        { id: "org-1", name: "Pierwsza", isMember: false },
        { id: "org-9", name: "Klient", isMember: false },
        { id: "org-5", name: "Ostatnia", isMember: false },
      ]);

      renderLayout(await AppLayout({ children: null, params }));

      expect(screen.getByText("Tryb serwisowy: Klient")).toBeInTheDocument();
      expect(
        screen.queryByText("Tryb serwisowy: Pierwsza"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Tryb serwisowy: Ostatnia"),
      ).not.toBeInTheDocument();
    });

    it("nazwa paska idzie za organizationId z kontekstu", async () => {
      mockGetOrgContext.mockResolvedValue({
        ...SERVICE_CONTEXT,
        organizationId: "org-1",
      });
      mockGetSwitchableOrganizations.mockResolvedValue([
        { id: "org-1", name: "Pierwsza", isMember: false },
        { id: "org-9", name: "Klient", isMember: false },
      ]);

      renderLayout(await AppLayout({ children: null, params }));

      expect(screen.getByText("Tryb serwisowy: Pierwsza")).toBeInTheDocument();
      expect(
        screen.queryByText("Tryb serwisowy: Klient"),
      ).not.toBeInTheDocument();
    });

    it("serviceMode: false → brak paska trybu serwisowego", async () => {
      mockGetOrgContext.mockResolvedValue({
        ...SERVICE_CONTEXT,
        serviceMode: false,
      });
      mockGetSwitchableOrganizations.mockResolvedValue([
        { id: "org-9", name: "Klient", isMember: true },
      ]);

      renderLayout(await AppLayout({ children: null, params }));

      expect(screen.queryByText(/Tryb serwisowy/)).not.toBeInTheDocument();
    });

    it("członek organizacji nie widzi paska trybu serwisowego", async () => {
      renderLayout(await AppLayout({ children: null, params }));

      expect(screen.queryByText(/Tryb serwisowy/)).not.toBeInTheDocument();
    });

    it("aktywnej organizacji brak na liście przełącznika → pasek bez nazwy innej organizacji", async () => {
      mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);
      mockGetSwitchableOrganizations.mockResolvedValue([
        { id: "org-1", name: "Pierwsza", isMember: false },
      ]);

      renderLayout(await AppLayout({ children: null, params }));

      const banner = screen.getByText(/^Tryb serwisowy:/);
      expect(banner.textContent?.trim()).toBe("Tryb serwisowy:");
      expect(screen.queryByText(/Pierwsza/)).not.toBeInTheDocument();
    });
  });
});
