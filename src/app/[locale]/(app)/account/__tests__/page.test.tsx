import { cloneElement, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const { mockRequireModuleAccess, mockRequireUser, mockEnv, moduleSlots } =
  vi.hoisted(() => ({
    mockRequireModuleAccess: vi.fn(),
    mockRequireUser: vi.fn(),
    mockEnv: { MULTI_ORG: false },
    moduleSlots: [] as Record<string, unknown>[],
  }));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async () => (key: string) => `account.${key}`),
}));
vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/auth/require-module-access", () => ({
  requireModuleAccess: mockRequireModuleAccess,
}));
vi.mock("@/shared/lib/auth/helpers", () => ({
  requireUser: mockRequireUser,
}));
vi.mock("@/features/account/components/account-details", () => ({
  AccountDetails: ({ name, email }: { name: string; email: string }) => (
    <div>
      account details {name} {email}
    </div>
  ),
}));
vi.mock("@/features/auth/components/change-password-form", () => ({
  ChangePasswordForm: () => <form aria-label="change password" />,
}));
vi.mock("@/modules.generated", () => ({ moduleSlots }));
vi.mock("@/modules.client.generated", () => {
  const modules: ModuleDef[] = [
    { key: "account", nav: [], routePrefixes: ["/account"] },
    { key: "billing", nav: [], routePrefixes: ["/billing"], roles: ["owner"] },
  ];
  return {
    authClientPlugins: [],
    clientModules: modules,
    clientModuleSlots: [],
    gatoBranding: {},
  };
});

import { Slot } from "@/shared/components/slot";
import AccountPage from "../page";

const params = Promise.resolve({ locale: "pl" });

function BillingSection({ userId }: { userId: string }) {
  return <section>billing of {userId}</section>;
}

function billingSection(module = "account", roles?: string[]) {
  return {
    slot: "account.sections",
    id: `${module}.billing-section`,
    priority: 10,
    roles,
    component: () => Promise.resolve({ default: BillingSection }),
    module,
    kind: "server",
  };
}

function setContributions(items: Record<string, unknown>[]) {
  moduleSlots.splice(0, moduleSlots.length, ...items);
}

async function resolveSlots(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    return Promise.all(node.map((child: ReactNode) => resolveSlots(child)));
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return node;
  }
  if (node.type === Slot) {
    return resolveSlots(await Slot(node.props as Parameters<typeof Slot>[0]));
  }
  if (node.props.children === undefined) {
    return node;
  }
  return cloneElement(node, undefined, await resolveSlots(node.props.children));
}

async function renderPage() {
  return render(await resolveSlots(await AccountPage({ params })));
}

function memberContext(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    organizationId: "org-1",
    orgRole: "member",
    userRole: "user",
    serviceMode: false,
    ...overrides,
  };
}

describe("/account", () => {
  beforeEach(() => {
    mockEnv.MULTI_ORG = false;
    setContributions([]);
    mockRequireModuleAccess.mockResolvedValue(memberContext());
    mockRequireUser.mockResolvedValue({
      id: "user-1",
      name: "Jan",
      email: "jan@firma.pl",
    });
  });

  it("the page is protected by access to the account module", async () => {
    await renderPage();
    expect(mockRequireModuleAccess).toHaveBeenCalledWith("account");
  });

  it("with no contribution shows the details and the password form only", async () => {
    await renderPage();
    expect(
      screen.getByText("account details Jan jan@firma.pl"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "change password" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/billing of/)).not.toBeInTheDocument();
  });

  it("a contribution to account.sections gets the userId of the signed-in user", async () => {
    mockRequireUser.mockResolvedValue({
      id: "user-42",
      name: "Ewa",
      email: "ewa@firma.pl",
    });
    setContributions([billingSection()]);
    await renderPage();
    expect(screen.getByText("billing of user-42")).toBeInTheDocument();
  });

  it("the contribution is rendered after the password form", async () => {
    setContributions([billingSection()]);
    await renderPage();
    const form = screen.getByRole("form", { name: "change password" });
    const section = screen.getByText("billing of user-1");
    expect(
      form.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("a contribution to another slot is not rendered on the account page", async () => {
    setContributions([{ ...billingSection(), slot: "dashboard.sections" }]);
    await renderPage();
    expect(screen.queryByText(/billing of/)).not.toBeInTheDocument();
  });

  it("the viewer comes from the module access context: a member does not see an owners-only module", async () => {
    setContributions([billingSection("billing")]);
    await renderPage();
    expect(screen.queryByText(/billing of/)).not.toBeInTheDocument();
  });

  it("an owner sees the contribution of an owners-only module", async () => {
    mockRequireModuleAccess.mockResolvedValue(
      memberContext({ orgRole: "owner" }),
    );
    setContributions([billingSection("billing")]);
    await renderPage();
    expect(screen.getByText("billing of user-1")).toBeInTheDocument();
  });

  it("a global admin without a membership sees a roles owner contribution", async () => {
    mockRequireModuleAccess.mockResolvedValue(
      memberContext({ orgRole: null, userRole: "admin" }),
    );
    setContributions([billingSection("account", ["owner"])]);
    await renderPage();
    expect(screen.getByText("billing of user-1")).toBeInTheDocument();
  });
});
