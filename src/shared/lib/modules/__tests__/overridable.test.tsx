import fs from "node:fs";
import path from "node:path";
import type { ComponentType } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import { isClientModule } from "../../../../../scripts/lib/architecture/client-imports";
import type { ModuleDef } from "../define-module";

const { overrides } = vi.hoisted(() => ({
  overrides: new Map<string, unknown>(),
}));

vi.mock("@/modules.client.generated", () => {
  const modules: ModuleDef[] = [
    { key: "crm", nav: [], routePrefixes: ["/crm"], roles: ["owner"] },
    { key: "invoices", nav: [], routePrefixes: ["/invoices"] },
    {
      key: "staff",
      nav: [],
      routePrefixes: ["/staff"],
      adminOnly: true,
      multiOrgRoles: ["owner"],
    },
  ];
  return {
    clientComponentOverrides: overrides,
    clientModules: modules,
  };
});

import { overridable } from "../overridable";

const PREFIX = "Component override failed to render:";

interface CardProps {
  label: string;
  count: number;
}

const baseRenders = vi.fn();

function RawCard(props: CardProps) {
  baseRenders(props);
  return <p>{`base ${props.label} ${props.count}`}</p>;
}

const anyOverridable = overridable as unknown as <P extends object>(
  handle: string,
  Base: ComponentType<P>,
) => ComponentType<P & { viewer: AccessContext }>;

const Card = anyOverridable<CardProps>("test.card", RawCard);

type Received = Record<string, unknown>;

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
  source: string,
  component: () => Promise<{ default: ComponentType<never> }>,
) {
  const registered = { handle, mode, component, source };
  overrides.set(handle, registered);
  return registered;
}

function resolved<P>(Component: ComponentType<P>) {
  return vi.fn(() =>
    Promise.resolve({ default: Component as ComponentType<never> }),
  );
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  overrides.clear();
  baseRenders.mockClear();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

function overrideLogCalls(): unknown[][] {
  return consoleError.mock.calls.filter((call) => call[0] === PREFIX);
}

describe("overridable", () => {
  it("is a client module: use client is its first statement", () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, "../overridable.tsx"),
      "utf8",
    );
    expect(isClientModule(source)).toBe(true);
  });

  it("without an override renders Base synchronously with its props", () => {
    const { container } = render(<Card label="a" count={1} viewer={OWNER} />);
    expect(screen.getByText("base a 1")).toBeInTheDocument();
    expect(container.innerHTML).toBe("<p>base a 1</p>");
    expect(overrideLogCalls()).toEqual([]);
  });

  it("without an override Base receives exactly the handle props, without viewer", () => {
    render(<Card label="a" count={1} viewer={OWNER} />);
    const received = baseRenders.mock.lastCall?.[0] as Received;
    expect(received).toEqual({ label: "a", count: 1 });
    expect(Object.keys(received).sort()).toEqual(["count", "label"]);
  });

  it("an override registered for another handle leaves Base, rendered synchronously", () => {
    const loader = resolved(() => <p>other</p>);
    register("test.other", "replace", "crm", loader);
    render(<Card label="b" count={2} viewer={OWNER} />);
    expect(screen.getByText("base b 2")).toBeInTheDocument();
    expect(screen.queryByText("other")).not.toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
  });

  it("replace renders the replacement with the same props and no Base", async () => {
    const seen = vi.fn();
    function Replacement(props: Received) {
      seen(props);
      return (
        <p>{`replacement ${String(props.label)} ${String(props.count)}`}</p>
      );
    }
    register("test.card", "replace", "crm", resolved(Replacement));
    render(<Card label="c" count={3} viewer={OWNER} />);
    expect(await screen.findByText("replacement c 3")).toBeInTheDocument();
    expect(screen.queryByText(/^base/)).not.toBeInTheDocument();
    expect(baseRenders).not.toHaveBeenCalled();
    const received = seen.mock.lastCall?.[0] as Received;
    expect(received).toEqual({ label: "c", count: 3 });
    expect(Object.keys(received).sort()).toEqual(["count", "label"]);
  });

  it("wrap renders the wrapper with the props and the raw Base, and Base inside it once", async () => {
    const seen = vi.fn();
    function Wrapper(props: CardProps & { Base: ComponentType<CardProps> }) {
      seen(props);
      const { Base, ...rest } = props;
      return (
        <section data-testid="wrapper">
          <span>{`wrapper ${props.label}`}</span>
          <Base {...rest} />
        </section>
      );
    }
    register("test.card", "wrap", "crm", resolved(Wrapper));
    render(<Card label="d" count={4} viewer={OWNER} />);
    const wrapper = await screen.findByTestId("wrapper");
    expect(within(wrapper).getByText("wrapper d")).toBeInTheDocument();
    expect(within(wrapper).getByText("base d 4")).toBeInTheDocument();
    expect(screen.getAllByTestId("wrapper")).toHaveLength(1);
    expect(screen.getAllByText("base d 4")).toHaveLength(1);
    const received = seen.mock.lastCall?.[0] as Received;
    expect(received.Base).toBe(RawCard);
    expect(Object.keys(received).sort()).toEqual(["Base", "count", "label"]);
    const baseReceived = baseRenders.mock.lastCall?.[0] as Received;
    expect(baseReceived).toEqual({ label: "d", count: 4 });
    expect(Object.keys(baseReceived).sort()).toEqual(["count", "label"]);
  });

  it("the handle is looked up at render: an override registered later is used on the next render", async () => {
    const { rerender } = render(<Card label="e" count={5} viewer={OWNER} />);
    expect(screen.getByText("base e 5")).toBeInTheDocument();
    register(
      "test.card",
      "replace",
      "crm",
      resolved((props: Received) => <p>{`late ${String(props.label)}`}</p>),
    );
    rerender(<Card label="f" count={6} viewer={OWNER} />);
    expect(await screen.findByText("late f")).toBeInTheDocument();
    expect(screen.queryByText("base f 6")).not.toBeInTheDocument();
  });

  it("loads the override once across re-renders and instances", async () => {
    const loader = resolved((props: Received) => (
      <p>{`cached ${String(props.label)}`}</p>
    ));
    register("test.card", "replace", "crm", loader);
    const { rerender } = render(<Card label="g" count={7} viewer={OWNER} />);
    expect(await screen.findByText("cached g")).toBeInTheDocument();
    rerender(
      <>
        <Card label="h" count={8} viewer={OWNER} />
        <Card label="i" count={9} viewer={OWNER} />
      </>,
    );
    expect(await screen.findByText("cached h")).toBeInTheDocument();
    expect(await screen.findByText("cached i")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe("overridable: a failing override falls back to Base", () => {
  it("a throwing replacement renders Base and logs the handle, the source and the error", async () => {
    const thrown = new Error("replacement broke");
    function Broken(): never {
      throw thrown;
    }
    register("test.card", "replace", "crm", resolved(Broken));
    render(<Card label="j" count={10} viewer={OWNER} />);
    expect(await screen.findByText("base j 10")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      PREFIX,
      "test.card",
      "crm",
      thrown,
    );
    expect(overrideLogCalls()).toEqual([[PREFIX, "test.card", "crm", thrown]]);
  });

  it("a throwing wrapper renders Base once and logs the source of the override", async () => {
    const thrown = new Error("wrapper broke");
    function BrokenWrapper(): never {
      throw thrown;
    }
    register(
      "test.card",
      "wrap",
      "src/gato.config.ts",
      resolved(BrokenWrapper),
    );
    render(<Card label="k" count={11} viewer={OWNER} />);
    expect(await screen.findByText("base k 11")).toBeInTheDocument();
    expect(screen.getAllByText("base k 11")).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledWith(
      PREFIX,
      "test.card",
      "src/gato.config.ts",
      thrown,
    );
  });

  it("a rejected loader renders Base and logs the load error", async () => {
    const loadError = new Error("chunk failed");
    register("test.card", "replace", "invoices", () =>
      Promise.reject(loadError),
    );
    const { container } = render(
      <>
        <p>host</p>
        <Card label="l" count={12} viewer={OWNER} />
      </>,
    );
    expect(await screen.findByText("base l 12")).toBeInTheDocument();
    expect(screen.getByText("host")).toBeInTheDocument();
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(consoleError).toHaveBeenCalledWith(
      PREFIX,
      "test.card",
      "invoices",
      loadError,
    );
  });
});

describe("overridable: an override shows only to a viewer with access to its module", () => {
  it("an override from a module limited to owners leaves Base for a member, without loading or logging", () => {
    const loader = resolved(() => <p>crm card</p>);
    register("test.card", "replace", "crm", loader);
    const { container } = render(<Card label="m" count={13} viewer={MEMBER} />);
    expect(container.innerHTML).toBe("<p>base m 13</p>");
    expect(loader).not.toHaveBeenCalled();
    expect(overrideLogCalls()).toEqual([]);
  });

  it("a member does not see the replacement even after the loader would have resolved", async () => {
    const loader = resolved(() => <p>crm card</p>);
    register("test.card", "replace", "crm", loader);
    render(<Card label="n" count={14} viewer={MEMBER} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("base n 14")).toBeInTheDocument();
    expect(screen.queryByText("crm card")).not.toBeInTheDocument();
  });

  it("the same override renders the replacement for an owner", async () => {
    register(
      "test.card",
      "replace",
      "crm",
      resolved(() => <p>crm card</p>),
    );
    render(<Card label="o" count={15} viewer={OWNER} />);
    expect(await screen.findByText("crm card")).toBeInTheDocument();
    expect(screen.queryByText("base o 15")).not.toBeInTheDocument();
  });

  it("a wrapper from a module limited to owners is not rendered for a member: Base alone", () => {
    const loader = resolved(() => <section data-testid="wrapper" />);
    register("test.card", "wrap", "crm", loader);
    const { container } = render(<Card label="p" count={16} viewer={MEMBER} />);
    expect(container.innerHTML).toBe("<p>base p 16</p>");
    expect(screen.queryByTestId("wrapper")).not.toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
  });

  it("an override from a module missing from the client registry leaves Base, even for a superadmin", () => {
    const loader = resolved(() => <p>ghost card</p>);
    register("test.card", "replace", "ghost", loader);
    const { container } = render(
      <Card
        label="q"
        count={17}
        viewer={{ userRole: "superadmin", orgRole: null, multiOrg: false }}
      />,
    );
    expect(container.innerHTML).toBe("<p>base q 17</p>");
    expect(loader).not.toHaveBeenCalled();
    expect(overrideLogCalls()).toEqual([]);
  });

  it("an override from src/gato.config.ts renders for a user without a membership", async () => {
    register(
      "test.card",
      "replace",
      "src/gato.config.ts",
      resolved(() => <p>config card</p>),
    );
    render(
      <Card
        label="r"
        count={18}
        viewer={{ userRole: "user", orgRole: null, multiOrg: false }}
      />,
    );
    expect(await screen.findByText("config card")).toBeInTheDocument();
    expect(screen.queryByText("base r 18")).not.toBeInTheDocument();
  });

  it("an override from an adminOnly module renders for a global admin without a membership", async () => {
    register(
      "test.card",
      "replace",
      "staff",
      resolved(() => <p>staff card</p>),
    );
    render(
      <Card
        label="s"
        count={19}
        viewer={{ userRole: "admin", orgRole: null, multiOrg: false }}
      />,
    );
    expect(await screen.findByText("staff card")).toBeInTheDocument();
    expect(screen.queryByText("base s 19")).not.toBeInTheDocument();
  });

  it("an override from an adminOnly module leaves Base for a user who is a member", () => {
    const loader = resolved(() => <p>staff card</p>);
    register("test.card", "replace", "staff", loader);
    const { container } = render(<Card label="t" count={20} viewer={MEMBER} />);
    expect(container.innerHTML).toBe("<p>base t 20</p>");
    expect(loader).not.toHaveBeenCalled();
  });

  it("the viewer is checked at render: the same override shows after the viewer becomes an owner", async () => {
    register(
      "test.card",
      "replace",
      "crm",
      resolved(() => <p>crm card</p>),
    );
    const { rerender } = render(<Card label="u" count={21} viewer={MEMBER} />);
    expect(screen.getByText("base u 21")).toBeInTheDocument();
    rerender(<Card label="u" count={21} viewer={OWNER} />);
    expect(await screen.findByText("crm card")).toBeInTheDocument();
  });
});
