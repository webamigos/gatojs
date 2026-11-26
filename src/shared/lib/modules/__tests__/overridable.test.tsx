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
import { isClientModule } from "../../../../../scripts/lib/architecture/client-imports";

const { overrides } = vi.hoisted(() => ({
  overrides: new Map<string, unknown>(),
}));

vi.mock("@/modules.client.generated", () => ({
  clientComponentOverrides: overrides,
}));

import { overridable } from "../overridable";

const PREFIX = "Component override failed to render:";

interface CardProps {
  label: string;
  count: number;
}

const baseRenders = vi.fn();

function RawCard(props: CardProps) {
  baseRenders();
  return <p>{`base ${props.label} ${props.count}`}</p>;
}

const anyOverridable = overridable as unknown as <P extends object>(
  handle: string,
  Base: ComponentType<P>,
) => ComponentType<P>;

const Card = anyOverridable<CardProps>("test.card", RawCard);

type Received = Record<string, unknown>;

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
    const { container } = render(<Card label="a" count={1} />);
    expect(screen.getByText("base a 1")).toBeInTheDocument();
    expect(container.innerHTML).toBe("<p>base a 1</p>");
    expect(overrideLogCalls()).toEqual([]);
  });

  it("an override registered for another handle leaves Base, rendered synchronously", () => {
    const loader = resolved(() => <p>other</p>);
    register("test.other", "replace", "crm", loader);
    render(<Card label="b" count={2} />);
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
    render(<Card label="c" count={3} />);
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
    render(<Card label="d" count={4} />);
    const wrapper = await screen.findByTestId("wrapper");
    expect(within(wrapper).getByText("wrapper d")).toBeInTheDocument();
    expect(within(wrapper).getByText("base d 4")).toBeInTheDocument();
    expect(screen.getAllByTestId("wrapper")).toHaveLength(1);
    expect(screen.getAllByText("base d 4")).toHaveLength(1);
    const received = seen.mock.lastCall?.[0] as Received;
    expect(received.Base).toBe(RawCard);
    expect(Object.keys(received).sort()).toEqual(["Base", "count", "label"]);
  });

  it("the handle is looked up at render: an override registered later is used on the next render", async () => {
    const { rerender } = render(<Card label="e" count={5} />);
    expect(screen.getByText("base e 5")).toBeInTheDocument();
    register(
      "test.card",
      "replace",
      "crm",
      resolved((props: Received) => <p>{`late ${String(props.label)}`}</p>),
    );
    rerender(<Card label="f" count={6} />);
    expect(await screen.findByText("late f")).toBeInTheDocument();
    expect(screen.queryByText("base f 6")).not.toBeInTheDocument();
  });

  it("loads the override once across re-renders and instances", async () => {
    const loader = resolved((props: Received) => (
      <p>{`cached ${String(props.label)}`}</p>
    ));
    register("test.card", "replace", "crm", loader);
    const { rerender } = render(<Card label="g" count={7} />);
    expect(await screen.findByText("cached g")).toBeInTheDocument();
    rerender(
      <>
        <Card label="h" count={8} />
        <Card label="i" count={9} />
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
    render(<Card label="j" count={10} />);
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
    render(<Card label="k" count={11} />);
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
        <Card label="l" count={12} />
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
