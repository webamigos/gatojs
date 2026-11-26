import fs from "node:fs";
import path from "node:path";
import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
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
import type { RegisteredContribution } from "@/shared/lib/modules/slots";

const {
  moduleSlots,
  throwingRegistry,
  rejectingRegistry,
  boomError,
  loadError,
} = vi.hoisted(() => {
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
      kind: "server",
    };
  }
  function text(value: string) {
    return function Text() {
      return <p>{value}</p>;
    };
  }
  const boomError = new Error("boom");
  function Boom(): never {
    throw boomError;
  }
  const loadError = new Error("load failed");
  function loaded(Component: ComponentType) {
    return () => Promise.resolve({ default: Component });
  }
  function rejecting() {
    return Promise.reject(loadError);
  }
  function contribution(
    id: string,
    slot: string,
    component: () => Promise<unknown>,
  ) {
    return {
      slot,
      id,
      priority: 1,
      roles: undefined,
      component,
      module: "dashboard",
      kind: "server",
    } as unknown as RegisteredContribution;
  }
  return {
    boomError,
    loadError,
    throwingRegistry: [
      contribution("dashboard.a", "dashboard.sections", loaded(text("a"))),
      contribution("dashboard.boom", "dashboard.sections", loaded(Boom)),
      contribution("dashboard.c", "dashboard.sections", loaded(text("c"))),
    ],
    rejectingRegistry: [
      contribution("dashboard.a", "dashboard.sections", loaded(text("a"))),
      contribution("dashboard.boom", "dashboard.sections", rejecting),
      contribution("dashboard.c", "dashboard.sections", loaded(text("c"))),
      contribution("dashboard.x", "account.sections", rejecting),
      contribution("dashboard.y", "account.sections", rejecting),
    ],
    moduleSlots: [
      entry("dashboard", "dashboard.b", "dashboard.sections", 10),
      entry("dashboard", "dashboard.c", "dashboard.sections", 10),
      entry("dashboard", "dashboard.a", "dashboard.sections", 20),
      entry("dashboard", "dashboard.owner-card", "account.sections", 5, [
        "owner",
      ]),
      entry("invoices", "invoices.unpaid-card", "account.sections", 6),
      entry("users", "users.card", "app.header.actions", 1),
    ] as unknown as RegisteredContribution[],
  };
});

vi.mock("@/modules.generated", () => ({ moduleSlots }));
vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
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
    clientModuleSlots: [],
    gatoBranding: {},
  };
});

import { logger } from "@/shared/lib/logger";
import { Slot } from "../slot";

const MEMBER: AccessContext = {
  userRole: "user",
  orgRole: "member",
  multiOrg: false,
};

function contributionTexts(): string[] {
  return screen
    .queryAllByTestId("contribution")
    .map((element) => element.textContent ?? "");
}

describe("Slot", () => {
  it("renders the contributions of the slot in registry order b, c, a", async () => {
    render(
      <>
        {await Slot({
          id: "dashboard.sections",
          context: { organizationId: "org-1" },
          viewer: MEMBER,
        })}
      </>,
    );
    expect(contributionTexts().map((text) => text.split(" ")[0])).toEqual([
      "dashboard.b",
      "dashboard.c",
      "dashboard.a",
    ]);
  });

  it("passes the context to each contribution as props", async () => {
    render(
      <>
        {await Slot({
          id: "dashboard.sections",
          context: { organizationId: "org-1" },
          viewer: MEMBER,
        })}
      </>,
    );
    expect(contributionTexts()).toHaveLength(3);
    for (const text of contributionTexts()) {
      expect(text).toContain("organizationId=org-1");
    }
  });

  it("with a visible contribution renders it and not the fallback", async () => {
    render(
      <>
        {await Slot({
          id: "dashboard.sections",
          context: { organizationId: "org-1" },
          viewer: MEMBER,
          fallback: <p>nothing here</p>,
        })}
      </>,
    );
    expect(screen.queryByText("nothing here")).not.toBeInTheDocument();
    expect(contributionTexts()).toHaveLength(3);
  });

  it("with no visible contribution renders the fallback", async () => {
    render(
      <>
        {await Slot({
          id: "account.sections",
          context: { userId: "user-1" },
          viewer: MEMBER,
          fallback: <p>nothing here</p>,
        })}
      </>,
    );
    expect(screen.getByText("nothing here")).toBeInTheDocument();
    expect(contributionTexts()).toEqual([]);
  });

  it("with no visible contribution and no fallback renders nothing", async () => {
    const { container } = render(
      <>
        {await Slot({
          id: "account.sections",
          context: { userId: "user-1" },
          viewer: MEMBER,
        })}
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a roles owner contribution to an owner with the userId context", async () => {
    render(
      <>
        {await Slot({
          id: "account.sections",
          context: { userId: "user-1" },
          viewer: { ...MEMBER, orgRole: "owner" },
          fallback: <p>nothing here</p>,
        })}
      </>,
    );
    expect(contributionTexts()).toEqual([
      "dashboard.owner-card organizationId=undefined userId=user-1",
    ]);
    expect(screen.queryByText("nothing here")).not.toBeInTheDocument();
  });

  it("hides a contribution of a module missing from clientModules even from a superadmin", async () => {
    render(
      <>
        {await Slot({
          id: "account.sections",
          context: { userId: "user-1" },
          viewer: { userRole: "superadmin", orgRole: null, multiOrg: false },
        })}
      </>,
    );
    expect(contributionTexts().map((text) => text.split(" ")[0])).toEqual([
      "dashboard.owner-card",
    ]);
  });

  it("hides a contribution of a module the viewer cannot access", async () => {
    render(
      <>
        {await Slot({
          id: "app.header.actions",
          context: { organizationId: "org-1" },
          viewer: { ...MEMBER, multiOrg: true },
          fallback: <p>nothing here</p>,
        })}
      </>,
    );
    expect(screen.getByText("nothing here")).toBeInTheDocument();
  });

  it("shows that contribution to an owner when MULTI_ORG is on", async () => {
    render(
      <>
        {await Slot({
          id: "app.header.actions",
          context: { organizationId: "org-2" },
          viewer: { ...MEMBER, orgRole: "owner", multiOrg: true },
        })}
      </>,
    );
    expect(contributionTexts()).toEqual([
      "users.card organizationId=org-2 userId=undefined",
    ]);
  });
});

describe("Slot: a failing contribution does not take down the host", () => {
  const registeredSlots = [...moduleSlots];
  let consoleError: MockInstance<typeof console.error>;

  function useRegistry(entries: readonly RegisteredContribution[]) {
    moduleSlots.splice(0, moduleSlots.length, ...entries);
  }

  function boundaryLogCalls(): unknown[][] {
    return consoleError.mock.calls.filter(
      (call) => call[0] === "Slot contribution failed to render:",
    );
  }

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    useRegistry(registeredSlots);
  });

  it("starts with import server-only", () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, "../slot.tsx"),
      "utf8",
    );
    expect(source.split("\n")[0]).toBe('import "server-only";');
  });

  it("a throwing component hides only itself: host, a and c render", async () => {
    useRegistry(throwingRegistry);
    const slot = await Slot({
      id: "dashboard.sections",
      context: { organizationId: "org-1" },
      viewer: MEMBER,
    });
    const { container } = render(
      <>
        <p>host</p>
        {slot}
      </>,
    );
    expect(container.innerHTML).toBe("<p>host</p><p>a</p><p>c</p>");
  });

  it("a throwing component is reported with its contribution id and error", async () => {
    useRegistry(throwingRegistry);
    render(
      <>
        {await Slot({
          id: "dashboard.sections",
          context: { organizationId: "org-1" },
          viewer: MEMBER,
        })}
      </>,
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Slot contribution failed to render:",
      "dashboard.boom",
      boomError,
    );
  });

  it("on the server a throwing component does not fail the page render: a and c are in the HTML", async () => {
    useRegistry(throwingRegistry);
    const slot = await Slot({
      id: "dashboard.sections",
      context: { organizationId: "org-1" },
      viewer: MEMBER,
    });
    const html = renderToString(
      <>
        <p>host</p>
        {slot}
      </>,
    );
    expect(html).toContain("<p>host</p>");
    expect(html).toContain("<p>a</p>");
    expect(html).toContain("<p>c</p>");
    expect(html.indexOf("<p>a</p>")).toBeLessThan(html.indexOf("<p>c</p>"));
  });

  it("a rejected loader does not reject the slot", async () => {
    useRegistry(rejectingRegistry);
    await expect(
      Slot({
        id: "dashboard.sections",
        context: { organizationId: "org-1" },
        viewer: MEMBER,
      }),
    ).resolves.toBeDefined();
  });

  it("a rejected loader is skipped: a and c render in order, not the fallback", async () => {
    useRegistry(rejectingRegistry);
    const { container } = render(
      <>
        <p>host</p>
        {await Slot({
          id: "dashboard.sections",
          context: { organizationId: "org-1" },
          viewer: MEMBER,
          fallback: <p>nothing here</p>,
        })}
      </>,
    );
    expect(container.innerHTML).toBe("<p>host</p><p>a</p><p>c</p>");
    expect(screen.queryByText("nothing here")).not.toBeInTheDocument();
  });

  it("a rejected loader is not rendered as a failing component", async () => {
    useRegistry(rejectingRegistry);
    render(
      <>
        {await Slot({
          id: "dashboard.sections",
          context: { organizationId: "org-1" },
          viewer: MEMBER,
        })}
      </>,
    );
    expect(boundaryLogCalls()).toEqual([]);
  });

  it("a rejected loader is logged once with the slot, the contribution and the error", async () => {
    useRegistry(rejectingRegistry);
    await Slot({
      id: "dashboard.sections",
      context: { organizationId: "org-1" },
      viewer: MEMBER,
    });
    expect(vi.mocked(logger.error)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "Slot contribution failed to load",
      expect.objectContaining({
        slot: "dashboard.sections",
        contribution: "dashboard.boom",
        error: loadError,
      }),
    );
  });

  it("when every visible loader rejects the slot renders the fallback", async () => {
    useRegistry(rejectingRegistry);
    const { container } = render(
      <>
        {await Slot({
          id: "account.sections",
          context: { userId: "user-1" },
          viewer: MEMBER,
          fallback: <p>nothing here</p>,
        })}
      </>,
    );
    expect(container.innerHTML).toBe("<p>nothing here</p>");
  });

  it("when every visible loader rejects each failure is logged with its contribution id", async () => {
    useRegistry(rejectingRegistry);
    await Slot({
      id: "account.sections",
      context: { userId: "user-1" },
      viewer: MEMBER,
      fallback: <p>nothing here</p>,
    });
    expect(vi.mocked(logger.error)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "Slot contribution failed to load",
      expect.objectContaining({
        slot: "account.sections",
        contribution: "dashboard.x",
      }),
    );
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "Slot contribution failed to load",
      expect.objectContaining({
        slot: "account.sections",
        contribution: "dashboard.y",
      }),
    );
  });

  it("when every visible loader rejects and there is no fallback the slot renders nothing", async () => {
    useRegistry(rejectingRegistry);
    const { container } = render(
      <>
        {await Slot({
          id: "account.sections",
          context: { userId: "user-1" },
          viewer: MEMBER,
        })}
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
