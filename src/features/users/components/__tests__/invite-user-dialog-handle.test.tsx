import type { ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import { usersMessages } from "./messages";

const { overrides } = vi.hoisted(() => ({
  overrides: new Map<string, unknown>(),
}));

vi.mock("@/modules.client.generated", () => {
  const modules: ModuleDef[] = [
    { key: "crm", nav: [], routePrefixes: ["/crm"], roles: ["owner"] },
  ];
  return {
    clientComponentOverrides: overrides,
    clientModules: modules,
  };
});
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../../services/commands/invite-user-command", () => ({
  inviteUserCommand: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import { InviteUserDialog, InviteUserDialogBase } from "../invite-user-dialog";

const INVITE_BUTTON = { name: "Zaproś użytkownika" };

const OWNER: AccessContext = {
  userRole: "user",
  orgRole: "owner",
  multiOrg: false,
};
const MEMBER: AccessContext = {
  userRole: "user",
  orgRole: "member",
  multiOrg: false,
};

function register(
  handle: string,
  mode: "replace" | "wrap",
  Component: ComponentType<never>,
) {
  const component = vi.fn(() => Promise.resolve({ default: Component }));
  overrides.set(handle, {
    handle,
    mode,
    component,
    source: "crm",
  });
  return component;
}

function renderDialog(viewer: AccessContext = OWNER) {
  return render(
    <NextIntlClientProvider locale="pl" messages={usersMessages}>
      <InviteUserDialog viewer={viewer} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  overrides.clear();
});

describe("InviteUserDialog behind the users.invite-dialog handle", () => {
  it("a users.invite-dialog replacement renders instead of the invite button", async () => {
    register("users.invite-dialog", "replace", () => <p>crm invite</p>);
    renderDialog();
    expect(await screen.findByText("crm invite")).toBeInTheDocument();
    expect(screen.queryByRole("button", INVITE_BUTTON)).not.toBeInTheDocument();
  });

  it("an override of another handle leaves the core invite button", () => {
    register("users.other-dialog", "replace", () => <p>crm invite</p>);
    renderDialog();
    expect(screen.getByRole("button", INVITE_BUTTON)).toBeInTheDocument();
    expect(screen.queryByText("crm invite")).not.toBeInTheDocument();
  });

  it("without any override the core invite button renders", () => {
    renderDialog();
    expect(screen.getByRole("button", INVITE_BUTTON)).toBeInTheDocument();
  });

  it("a wrapper gets InviteUserDialogBase as Base and renders the core button inside it", async () => {
    const seenBase = vi.fn();
    function Wrapper({ Base }: { Base: ComponentType }) {
      seenBase(Base);
      return (
        <section data-testid="wrapper">
          <p>crm hint</p>
          <Base />
        </section>
      );
    }
    register("users.invite-dialog", "wrap", Wrapper as ComponentType<never>);
    renderDialog();
    const wrapper = await screen.findByTestId("wrapper");
    expect(within(wrapper).getByText("crm hint")).toBeInTheDocument();
    expect(
      within(wrapper).getByRole("button", INVITE_BUTTON),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", INVITE_BUTTON)).toHaveLength(1);
    expect(seenBase.mock.lastCall?.[0]).toBe(InviteUserDialogBase);
  });

  it("a replacement from a module limited to owners leaves the core invite button for a member", () => {
    const loader = register("users.invite-dialog", "replace", () => (
      <p>crm invite</p>
    ));
    renderDialog(MEMBER);
    expect(screen.getByRole("button", INVITE_BUTTON)).toBeInTheDocument();
    expect(screen.queryByText("crm invite")).not.toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
  });

  it("a replacement from a module limited to owners renders for an owner", async () => {
    register("users.invite-dialog", "replace", () => <p>crm invite</p>);
    renderDialog(OWNER);
    expect(await screen.findByText("crm invite")).toBeInTheDocument();
    expect(screen.queryByRole("button", INVITE_BUTTON)).not.toBeInTheDocument();
  });

  it("the replacement receives no props: viewer stays with the handle", async () => {
    const seen = vi.fn();
    function Replacement(props: Record<string, unknown>) {
      seen(props);
      return <p>crm invite</p>;
    }
    register(
      "users.invite-dialog",
      "replace",
      Replacement as ComponentType<never>,
    );
    renderDialog(OWNER);
    expect(await screen.findByText("crm invite")).toBeInTheDocument();
    expect(seen.mock.lastCall?.[0]).toEqual({});
  });
});
