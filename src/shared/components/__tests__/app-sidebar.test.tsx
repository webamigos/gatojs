import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import accountPl from "@/features/account/i18n/pl.json";
import dashboardPl from "@/features/dashboard/i18n/pl.json";
import usersPl from "@/features/users/i18n/pl.json";
import type { AccessContext } from "@/shared/lib/auth/permissions";

const { mockSignOut, mockPush, mockRefresh } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
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
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));
vi.mock("@/shared/lib/auth/client", () => ({
  authClient: { signOut: mockSignOut },
}));
vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

import { AppSidebar, SidebarProvider } from "../app-sidebar";

const messages = {
  ...coreMessages,
  dashboard: dashboardPl,
  account: accountPl,
  users: usersPl,
};

const member: AccessContext = {
  userRole: "user",
  orgRole: "member",
  multiOrg: false,
};

function renderSidebar(accessContext: AccessContext = member) {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <SidebarProvider>
        <AppSidebar
          accessContext={accessContext}
          userName="Jan Kowalski"
          userEmail="jan@firma.pl"
        />
      </SidebarProvider>
    </NextIntlClientProvider>,
  );
}

describe("AppSidebar", () => {
  beforeEach(() => {
    mockSignOut.mockResolvedValue({});
  });

  it("member widzi pozycje z rejestru z etykietami z namespace modułu", () => {
    renderSidebar();

    const nav = screen.getByRole("navigation");
    const labels = Array.from(nav.querySelectorAll("a")).map(
      (link) => link.textContent,
    );
    expect(labels).toEqual(["Dashboard", "Konto"]);
    expect(nav.querySelector("a[href='/users']")).toBeNull();
  });

  it("pozycje mają ikony z nazw lucide zadeklarowanych w module", () => {
    renderSidebar();

    const nav = screen.getByRole("navigation");
    expect(nav.querySelector("[data-icon='layout-dashboard']")).not.toBeNull();
    expect(nav.querySelector("[data-icon='user-cog']")).not.toBeNull();
  });

  it("globalny admin widzi pozycję Użytkownicy", () => {
    renderSidebar({ ...member, userRole: "admin" });

    expect(
      screen.getByRole("navigation").querySelector("a[href='/users']"),
    ).not.toBeNull();
  });

  it("owner widzi Użytkownicy tylko przy MULTI_ORG", () => {
    const { unmount } = renderSidebar({ ...member, orgRole: "owner" });
    expect(
      screen.getByRole("navigation").querySelector("a[href='/users']"),
    ).toBeNull();
    unmount();

    renderSidebar({ ...member, orgRole: "owner", multiOrg: true });
    expect(
      screen.getByRole("navigation").querySelector("a[href='/users']"),
    ).not.toBeNull();
  });

  it("oznacza aktywną pozycję", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Konto" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("wylogowanie czyści sesję i przechodzi na logowanie przez locale-aware router", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: /Jan Kowalski/ }));
    await user.click(await screen.findByRole("button", { name: "Wyloguj" }));

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/sign-in");
    expect(mockRefresh).toHaveBeenCalled();
  });
});
