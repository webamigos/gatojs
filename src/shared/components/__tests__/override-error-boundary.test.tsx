import fs from "node:fs";
import path from "node:path";
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
import { isClientModule } from "../../../../scripts/lib/architecture/client-imports";
import { OverrideErrorBoundary } from "../override-error-boundary";

const PREFIX = "Component override failed to render:";
const thrown = new Error("boom");

function Boom(): never {
  throw thrown;
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

function boundaryLogCalls(): unknown[][] {
  return consoleError.mock.calls.filter((call) => call[0] === PREFIX);
}

describe("OverrideErrorBoundary", () => {
  it("is a client component: use client is its first statement", () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, "../override-error-boundary.tsx"),
      "utf8",
    );
    expect(isClientModule(source)).toBe(true);
  });

  it("renders a healthy child unchanged and not the fallback", () => {
    const { container } = render(
      <OverrideErrorBoundary
        handle="users.invite-dialog"
        source="crm"
        fallback={<p>core</p>}
      >
        <p>override</p>
      </OverrideErrorBoundary>,
    );
    expect(container.innerHTML).toBe("<p>override</p>");
    expect(boundaryLogCalls()).toEqual([]);
  });

  it("renders the fallback when its child throws", () => {
    const { container } = render(
      <OverrideErrorBoundary
        handle="users.invite-dialog"
        source="crm"
        fallback={<p>core</p>}
      >
        <Boom />
      </OverrideErrorBoundary>,
    );
    expect(container.innerHTML).toBe("<p>core</p>");
  });

  it("logs the prefix, the handle, the source and the error once", () => {
    render(
      <OverrideErrorBoundary
        handle="users.invite-dialog"
        source="src/gato.config.ts"
        fallback={<p>core</p>}
      >
        <Boom />
      </OverrideErrorBoundary>,
    );
    expect(consoleError).toHaveBeenCalledWith(
      PREFIX,
      "users.invite-dialog",
      "src/gato.config.ts",
      thrown,
    );
    expect(boundaryLogCalls()).toEqual([
      [PREFIX, "users.invite-dialog", "src/gato.config.ts", thrown],
    ]);
  });

  it("a failing boundary leaves its siblings rendered", () => {
    const { container } = render(
      <>
        <p>before</p>
        <OverrideErrorBoundary
          handle="users.invite-dialog"
          source="invoices"
          fallback={<p>core</p>}
        >
          <Boom />
        </OverrideErrorBoundary>
        <p>after</p>
      </>,
    );
    expect(container.innerHTML).toBe("<p>before</p><p>core</p><p>after</p>");
    expect(boundaryLogCalls()).toEqual([
      [PREFIX, "users.invite-dialog", "invoices", thrown],
    ]);
  });

  it("keeps the fallback after a failure, even when the child would render now", () => {
    let failing = true;
    function Flaky() {
      if (failing) {
        throw thrown;
      }
      return <p>recovered</p>;
    }
    const element = () => (
      <OverrideErrorBoundary
        handle="users.invite-dialog"
        source="crm"
        fallback={<p>core</p>}
      >
        <Flaky />
      </OverrideErrorBoundary>
    );
    const { rerender } = render(element());
    expect(screen.getByText("core")).toBeInTheDocument();
    failing = false;
    rerender(element());
    expect(screen.queryByText("recovered")).not.toBeInTheDocument();
    expect(screen.getByText("core")).toBeInTheDocument();
  });
});
