import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import organizationsPl from "../../i18n/pl.json";

const { mockUseListOrganizations, mockUseActiveOrganization } = vi.hoisted(
  () => ({
    mockUseListOrganizations: vi.fn(),
    mockUseActiveOrganization: vi.fn(),
  }),
);

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/shared/lib/auth/client", () => ({
  authClient: {
    useListOrganizations: mockUseListOrganizations,
    useActiveOrganization: mockUseActiveOrganization,
    organization: { setActive: vi.fn(), create: vi.fn() },
  },
}));

import { OrgSwitcher } from "../org-switcher";

function renderSwitcher(multiOrg: boolean) {
  return render(
    <NextIntlClientProvider
      locale="pl"
      messages={{ ...coreMessages, organizations: organizationsPl }}
    >
      <OrgSwitcher multiOrg={multiOrg} />
    </NextIntlClientProvider>,
  );
}

describe("OrgSwitcher", () => {
  beforeEach(() => {
    mockUseListOrganizations.mockReturnValue({
      data: [
        { id: "org-1", name: "Pierwsza" },
        { id: "org-2", name: "Druga" },
      ],
    });
    mockUseActiveOrganization.mockReturnValue({
      data: { id: "org-1", name: "Pierwsza" },
    });
  });

  it("MULTI_ORG=false → nic nie renderuje i nie pyta o organizacje", () => {
    const { container } = renderSwitcher(false);
    expect(container).toBeEmptyDOMElement();
    expect(mockUseListOrganizations).not.toHaveBeenCalled();
  });

  it("MULTI_ORG=true → przełącznik i akcja utworzenia organizacji", () => {
    renderSwitcher(true);
    expect(
      screen.getByRole("button", { name: "Utwórz organizację" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pierwsza")).toBeInTheDocument();
  });

  it("MULTI_ORG=true z jedną organizacją → tylko akcja utworzenia", () => {
    mockUseListOrganizations.mockReturnValue({
      data: [{ id: "org-1", name: "Pierwsza" }],
    });
    renderSwitcher(true);
    expect(
      screen.getByRole("group", { name: "Organizacja" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Utwórz organizację" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pierwsza")).not.toBeInTheDocument();
  });
});
