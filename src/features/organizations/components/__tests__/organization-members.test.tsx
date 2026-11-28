import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import organizationsPl from "../../i18n/pl.json";

const {
  mockInviteMember,
  mockRemoveMember,
  mockCancelInvitation,
  mockRefresh,
} = vi.hoisted(() => ({
  mockInviteMember: vi.fn(),
  mockRemoveMember: vi.fn(),
  mockCancelInvitation: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("@/shared/lib/auth/client", () => ({
  authClient: {
    organization: {
      inviteMember: mockInviteMember,
      removeMember: mockRemoveMember,
      cancelInvitation: mockCancelInvitation,
      updateMemberRole: vi.fn(),
    },
  },
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { OrganizationMembers } from "../organization-members";

const MEMBERS = [
  {
    memberId: "m-1",
    userId: "user-1",
    name: "Jan Kowalski",
    email: "jan@example.com",
    role: "owner",
  },
  {
    memberId: "m-2",
    userId: "user-2",
    name: "Anna Nowak",
    email: "anna@example.com",
    role: "member",
  },
];

const INVITATIONS = [
  {
    id: "inv-1",
    email: "nowy@example.com",
    role: "member",
    status: "pending",
    expiresAt: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "inv-2",
    email: "stary@example.com",
    role: "member",
    status: "canceled",
    expiresAt: "2026-06-01T00:00:00.000Z",
  },
];

function renderMembers(
  overrides: Partial<React.ComponentProps<typeof OrganizationMembers>> = {},
) {
  return render(
    <NextIntlClientProvider
      locale="pl"
      messages={{ ...coreMessages, organizations: organizationsPl }}
    >
      <OrganizationMembers
        organizationName="Firma"
        currentUserId="user-1"
        currentRole="owner"
        members={MEMBERS}
        invitations={INVITATIONS}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OrganizationMembers", () => {
  it("pokazuje członków z rolami i oznacza zalogowanego użytkownika", () => {
    renderMembers();

    expect(screen.getByText("Firma")).toBeInTheDocument();
    expect(screen.getByText(/Jan Kowalski/)).toBeInTheDocument();
    expect(screen.getByText("Właściciel")).toBeInTheDocument();
    expect(screen.getByText("(Ty)")).toBeInTheDocument();
    expect(screen.getByText("anna@example.com")).toBeInTheDocument();
  });

  it("nazwa organizacji jest jedynym nagłówkiem h1 w nagłówku strony", () => {
    const { container } = renderMembers({
      organizationName: "Acme Sp. z o.o.",
    });

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Acme Sp. z o.o.");
    expect(
      container.querySelector('header[data-slot="page-header"]'),
    ).toContainElement(headings[0]);
  });

  it("pokazuje tylko oczekujące zaproszenia", () => {
    renderMembers();

    expect(screen.getByText("nowy@example.com")).toBeInTheDocument();
    expect(screen.queryByText("stary@example.com")).not.toBeInTheDocument();
  });

  it("ukrywa zarządzanie przed zwykłym członkiem", () => {
    renderMembers({ currentRole: "member", currentUserId: "user-2" });

    expect(screen.queryByText("Zaproś osobę")).not.toBeInTheDocument();
    expect(screen.queryByText("Usuń")).not.toBeInTheDocument();
  });

  it("zaprasza po adresie email", async () => {
    const user = userEvent.setup({ delay: null });
    mockInviteMember.mockResolvedValue({ data: {}, error: null });
    renderMembers();

    await user.type(screen.getByLabelText("Email"), "nowa@firma.pl");
    await user.click(screen.getByText("Wyślij zaproszenie"));

    await waitFor(() => {
      expect(mockInviteMember).toHaveBeenCalledWith({
        email: "nowa@firma.pl",
        role: "member",
      });
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("usuwa członka po potwierdzeniu", async () => {
    const user = userEvent.setup({ delay: null });
    mockRemoveMember.mockResolvedValue({ data: {}, error: null });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderMembers();

    await user.click(screen.getByText("Usuń"));

    await waitFor(() => {
      expect(mockRemoveMember).toHaveBeenCalledWith({
        memberIdOrEmail: "m-2",
      });
    });
  });

  it("anuluje oczekujące zaproszenie", async () => {
    const user = userEvent.setup({ delay: null });
    mockCancelInvitation.mockResolvedValue({ data: {}, error: null });
    renderMembers();

    await user.click(screen.getByText("Anuluj"));

    await waitFor(() => {
      expect(mockCancelInvitation).toHaveBeenCalledWith({
        invitationId: "inv-1",
      });
    });
  });
});
