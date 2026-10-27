import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import organizationsPl from "../../i18n/pl.json";
import type { SwitchableOrganization } from "../../contracts/organization-switcher.types";

const { mockEnterOrganization, mockRefresh, mockToastError } = vi.hoisted(
  () => ({
    mockEnterOrganization: vi.fn(),
    mockRefresh: vi.fn(),
    mockToastError: vi.fn(),
  }),
);

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));
vi.mock(
  "@/features/organizations/services/commands/enter-organization-command",
  () => ({ enterOrganizationCommand: mockEnterOrganization }),
);
vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));
vi.mock("@/shared/lib/auth/client", () => ({
  authClient: {
    useListOrganizations: vi.fn(() => ({ data: [] })),
    useActiveOrganization: vi.fn(() => ({ data: null })),
    organization: { setActive: vi.fn(), create: vi.fn() },
  },
}));

import { OrgSwitcher } from "../org-switcher";

const TWO_ORGANIZATIONS: SwitchableOrganization[] = [
  { id: "org-1", name: "Pierwsza", isMember: true },
  { id: "org-2", name: "Druga", isMember: false },
];

function renderSwitcher(
  organizations: SwitchableOrganization[],
  activeOrganizationId: string,
) {
  return render(
    <NextIntlClientProvider
      locale="pl"
      messages={{ ...coreMessages, organizations: organizationsPl }}
    >
      <OrgSwitcher
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
      />
    </NextIntlClientProvider>,
  );
}

async function chooseOrganization(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox"));
  await user.click(await within(document.body).findByRole("option", { name }));
}

describe("OrgSwitcher", () => {
  beforeEach(() => {
    mockEnterOrganization.mockResolvedValue({ success: true });
  });

  it("brak organizacji → brak przełącznika", () => {
    renderSwitcher([], "");

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("jedna organizacja → brak przełącznika", () => {
    renderSwitcher(
      [{ id: "org-1", name: "Pierwsza", isMember: true }],
      "org-1",
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("Pierwsza")).not.toBeInTheDocument();
  });

  it("dwie organizacje → przełącznik pokazuje aktywną organizację", () => {
    renderSwitcher(TWO_ORGANIZATIONS, "org-2");

    expect(screen.getByRole("combobox")).toHaveTextContent("Druga");
    expect(screen.getByRole("combobox")).not.toHaveTextContent("Pierwsza");
  });

  it("wybór organizacji → enterOrganizationCommand z jej id i odświeżenie", async () => {
    renderSwitcher(TWO_ORGANIZATIONS, "org-1");

    await chooseOrganization("Druga");

    expect(mockEnterOrganization).toHaveBeenCalledTimes(1);
    expect(mockEnterOrganization).toHaveBeenCalledWith("org-2");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("odmowa komendy → toast z błędem i bez odświeżenia", async () => {
    mockEnterOrganization.mockResolvedValue({
      success: false,
      error: "Brak dostępu do organizacji",
    });
    renderSwitcher(TWO_ORGANIZATIONS, "org-1");

    await chooseOrganization("Druga");

    expect(mockToastError).toHaveBeenCalledWith("Brak dostępu do organizacji");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("wyjątek komendy → toast z błędem i bez odświeżenia", async () => {
    mockEnterOrganization.mockRejectedValue(new Error("network down"));
    renderSwitcher(TWO_ORGANIZATIONS, "org-1");

    await chooseOrganization("Druga");

    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
