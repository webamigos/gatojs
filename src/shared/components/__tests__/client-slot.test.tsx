import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { render, screen } from "@testing-library/react";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const { clientModuleSlots, countedLoader, boomError, loadError } = vi.hoisted(
  () => {
    function card(label: string) {
      return function Card(props: Record<string, unknown>) {
        return (
          <p data-testid="contribution">
            {`${label} organizationId=${String(props.organizationId)} userId=${String(props.userId)}`}
          </p>
        );
      };
    }
    function entry(
      module: string,
      id: string,
      slot: string,
      priority: number,
      roles?: string[],
    ) {
      const Component = card(id);
      return {
        slot,
        id,
        priority,
        roles,
        component: () => Promise.resolve({ default: Component }),
        module,
        kind: "client",
      };
    }
    const boomError = new Error("boom");
    function Boom(): never {
      throw boomError;
    }
    const loadError = new Error("load failed");
    const Counted = card("dashboard.counted");
    const countedLoader = vi.fn(() => Promise.resolve({ default: Counted }));
    return {
      countedLoader,
      boomError,
      loadError,
      clientModuleSlots: [
        entry("dashboard", "dashboard.b", "dashboard.sections", 10),
        entry("dashboard", "dashboard.c", "dashboard.sections", 10),
        entry("dashboard", "dashboard.a", "dashboard.sections", 20),
        entry("dashboard", "dashboard.owner-card", "account.sections", 5, [
          "owner",
        ]),
        entry("invoices", "invoices.unpaid-card", "account.sections", 6),
        entry("users", "users.card", "app.header.actions", 1),
        {
          slot: "users.toolbar",
          id: "dashboard.counted",
          priority: 1,
          roles: undefined,
          component: countedLoader,
          module: "dashboard",
          kind: "client",
        },
        {
          slot: "dashboard.broken",
          id: "dashboard.rejecting",
          priority: 1,
          roles: undefined,
          component: () => Promise.reject(loadError),
          module: "dashboard",
          kind: "client",
        },
        entry("dashboard", "dashboard.healthy", "dashboard.broken", 2),
        {
          slot: "dashboard.throwing",
          id: "dashboard.boom",
          priority: 1,
          roles: undefined,
          component: () => Promise.resolve({ default: Boom }),
          module: "dashboard",
          kind: "client",
        },
        entry("dashboard", "dashboard.fine", "dashboard.throwing", 2),
      ],
    };
  },
);

vi.mock("@/modules.client.generated", () => {
  const modules: ModuleDef[] = [
    { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
    {
      key: "users",
      nav: [],
      routePrefixes: ["/users"],
      adminOnly: true,
      multiOrgRoles: ["owner", "admin"],
    },
  ];
  return {
    authClientPlugins: [],
    clientModules: modules,
    clientModuleSlots,
    gatoBranding: {},
  };
});

import { ClientSlot } from "../client-slot";

const MEMBER: AccessContext = {
  userRole: "user",
  orgRole: "member",
  multiOrg: false,
};

const ORG_CONTEXT = { organizationId: "org-1" };

const AnyClientSlot = ClientSlot as unknown as (props: {
  id: string;
  context: Record<string, unknown>;
  viewer: AccessContext;
  fallback?: ReactNode;
}) => ReactNode;

function contributionTexts(): string[] {
  return screen
    .queryAllByTestId("contribution")
    .map((element) => element.textContent ?? "");
}

describe("ClientSlot", () => {
  it("renders the lazy contributions of the slot in registry order b, c, a", async () => {
    render(
      <AnyClientSlot
        id="dashboard.sections"
        context={{ organizationId: "org-1" }}
        viewer={MEMBER}
      />,
    );
    expect(await screen.findAllByTestId("contribution")).toHaveLength(3);
    expect(contributionTexts().map((text) => text.split(" ")[0])).toEqual([
      "dashboard.b",
      "dashboard.c",
      "dashboard.a",
    ]);
  });

  it("passes the context to each contribution as props", async () => {
    render(
      <AnyClientSlot
        id="dashboard.sections"
        context={{ organizationId: "org-1" }}
        viewer={MEMBER}
      />,
    );
    expect(
      await screen.findByText(
        "dashboard.b organizationId=org-1 userId=undefined",
      ),
    ).toBeInTheDocument();
    expect(contributionTexts()).toEqual([
      "dashboard.b organizationId=org-1 userId=undefined",
      "dashboard.c organizationId=org-1 userId=undefined",
      "dashboard.a organizationId=org-1 userId=undefined",
    ]);
  });

  it("with a visible contribution renders it and not the fallback", async () => {
    render(
      <AnyClientSlot
        id="dashboard.sections"
        context={{ organizationId: "org-1" }}
        viewer={MEMBER}
        fallback={<p>nothing here</p>}
      />,
    );
    expect(await screen.findAllByTestId("contribution")).toHaveLength(3);
    expect(screen.queryByText("nothing here")).not.toBeInTheDocument();
  });

  it("with no visible contribution renders the fallback", () => {
    render(
      <AnyClientSlot
        id="account.sections"
        context={{ userId: "user-1" }}
        viewer={MEMBER}
        fallback={<p>nothing here</p>}
      />,
    );
    expect(screen.getByText("nothing here")).toBeInTheDocument();
    expect(contributionTexts()).toEqual([]);
  });

  it("with no visible contribution and no fallback renders nothing", () => {
    const { container } = render(
      <AnyClientSlot
        id="account.sections"
        context={{ userId: "user-1" }}
        viewer={MEMBER}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a roles owner contribution to an owner with the userId context", async () => {
    render(
      <AnyClientSlot
        id="account.sections"
        context={{ userId: "user-1" }}
        viewer={{ ...MEMBER, orgRole: "owner" }}
        fallback={<p>nothing here</p>}
      />,
    );
    expect(
      await screen.findByText(
        "dashboard.owner-card organizationId=undefined userId=user-1",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("nothing here")).not.toBeInTheDocument();
  });

  it("hides a contribution of a module missing from clientModules even from a superadmin", async () => {
    render(
      <AnyClientSlot
        id="account.sections"
        context={{ userId: "user-1" }}
        viewer={{ userRole: "superadmin", orgRole: null, multiOrg: false }}
      />,
    );
    expect(await screen.findAllByTestId("contribution")).toHaveLength(1);
    expect(contributionTexts()).toEqual([
      "dashboard.owner-card organizationId=undefined userId=user-1",
    ]);
  });

  it("hides a contribution of a module the viewer cannot access", () => {
    render(
      <AnyClientSlot
        id="app.header.actions"
        context={{ organizationId: "org-1" }}
        viewer={{ ...MEMBER, multiOrg: true }}
        fallback={<p>nothing here</p>}
      />,
    );
    expect(screen.getByText("nothing here")).toBeInTheDocument();
  });

  it("shows that contribution to an owner when MULTI_ORG is on", async () => {
    render(
      <AnyClientSlot
        id="app.header.actions"
        context={{ organizationId: "org-2" }}
        viewer={{ ...MEMBER, orgRole: "owner", multiOrg: true }}
      />,
    );
    expect(
      await screen.findByText(
        "users.card organizationId=org-2 userId=undefined",
      ),
    ).toBeInTheDocument();
  });

  it("loads a contribution once across re-renders", async () => {
    const { rerender } = render(
      <AnyClientSlot
        id="users.toolbar"
        context={{ organizationId: "org-1" }}
        viewer={MEMBER}
      />,
    );
    expect(
      await screen.findByText(
        "dashboard.counted organizationId=org-1 userId=undefined",
      ),
    ).toBeInTheDocument();
    rerender(
      <AnyClientSlot
        id="users.toolbar"
        context={{ organizationId: "org-3" }}
        viewer={MEMBER}
      />,
    );
    expect(
      await screen.findByText(
        "dashboard.counted organizationId=org-3 userId=undefined",
      ),
    ).toBeInTheDocument();
    expect(countedLoader).toHaveBeenCalledTimes(1);
  });
});

describe("ClientSlot: a failing contribution hides only itself", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("a rejected lazy loader next to a healthy contribution: the healthy one renders", async () => {
    render(
      <AnyClientSlot
        id="dashboard.broken"
        context={ORG_CONTEXT}
        viewer={MEMBER}
        fallback={<p>nothing here</p>}
      />,
    );
    expect(
      await screen.findByText(
        "dashboard.healthy organizationId=org-1 userId=undefined",
      ),
    ).toBeInTheDocument();
    expect(contributionTexts()).toEqual([
      "dashboard.healthy organizationId=org-1 userId=undefined",
    ]);
    expect(screen.queryByText("nothing here")).not.toBeInTheDocument();
  });

  it("a rejected lazy loader is reported by the boundary of that contribution", async () => {
    render(
      <AnyClientSlot
        id="dashboard.broken"
        context={ORG_CONTEXT}
        viewer={MEMBER}
      />,
    );
    await screen.findByText(
      "dashboard.healthy organizationId=org-1 userId=undefined",
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Slot contribution failed to render:",
      "dashboard.rejecting",
      loadError,
    );
  });

  it("a throwing component next to a healthy contribution: the healthy one renders", async () => {
    const { container } = render(
      <>
        <p>host</p>
        <AnyClientSlot
          id="dashboard.throwing"
          context={ORG_CONTEXT}
          viewer={MEMBER}
        />
      </>,
    );
    expect(
      await screen.findByText(
        "dashboard.fine organizationId=org-1 userId=undefined",
      ),
    ).toBeInTheDocument();
    expect(contributionTexts()).toEqual([
      "dashboard.fine organizationId=org-1 userId=undefined",
    ]);
    expect(screen.getByText("host")).toBeInTheDocument();
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(consoleError).toHaveBeenCalledWith(
      "Slot contribution failed to render:",
      "dashboard.boom",
      boomError,
    );
  });
});

describe("ClientSlot: only client slot ids", () => {
  it("server slot ids are type errors for ClientSlot", () => {
    const ctx = ORG_CONTEXT;
    const sections = (
      // @ts-expect-error dashboard.sections is a server slot, not in ClientSlotContextMap
      <ClientSlot id="dashboard.sections" context={ctx} viewer={MEMBER} />
    );
    const headerActions = (
      // @ts-expect-error app.header.actions is a server slot, not in ClientSlotContextMap
      <ClientSlot id="app.header.actions" context={ctx} viewer={MEMBER} />
    );
    expect([sections.props.id, headerActions.props.id]).toEqual([
      "dashboard.sections",
      "app.header.actions",
    ]);
  });
});
