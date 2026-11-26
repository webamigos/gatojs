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
import { SlotErrorBoundary } from "../slot-error-boundary";

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
  return consoleError.mock.calls.filter(
    (call) => call[0] === "Slot contribution failed to render:",
  );
}

describe("SlotErrorBoundary", () => {
  it("is a client component: the file starts with use client", () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, "../slot-error-boundary.tsx"),
      "utf8",
    );
    expect(source.split("\n")[0]).toBe('"use client";');
  });

  it("renders a healthy child unchanged, without a wrapper", () => {
    const { container } = render(
      <SlotErrorBoundary contributionId="dashboard.ok">
        <p data-testid="ok">ok</p>
      </SlotErrorBoundary>,
    );
    expect(container.innerHTML).toBe('<p data-testid="ok">ok</p>');
    expect(boundaryLogCalls()).toEqual([]);
  });

  it("renders nothing when its child throws, and the error does not escape render", () => {
    const { container } = render(
      <SlotErrorBoundary contributionId="dashboard.boom">
        <Boom />
      </SlotErrorBoundary>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("logs the contribution id and the thrown error once", () => {
    render(
      <SlotErrorBoundary contributionId="dashboard.boom">
        <Boom />
      </SlotErrorBoundary>,
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Slot contribution failed to render:",
      "dashboard.boom",
      thrown,
    );
    expect(boundaryLogCalls()).toEqual([
      ["Slot contribution failed to render:", "dashboard.boom", thrown],
    ]);
  });

  it("a sibling boundary with a healthy child still renders it", () => {
    const { container } = render(
      <>
        <SlotErrorBoundary contributionId="dashboard.a">
          <p>a</p>
        </SlotErrorBoundary>
        <SlotErrorBoundary contributionId="dashboard.boom">
          <Boom />
        </SlotErrorBoundary>
        <SlotErrorBoundary contributionId="dashboard.c">
          <p>c</p>
        </SlotErrorBoundary>
      </>,
    );
    expect(container.innerHTML).toBe("<p>a</p><p>c</p>");
    expect(boundaryLogCalls()).toEqual([
      ["Slot contribution failed to render:", "dashboard.boom", thrown],
    ]);
  });

  it("keeps rendering nothing after a failure, even when the child would render now", () => {
    let failing = true;
    function Flaky() {
      if (failing) {
        throw thrown;
      }
      return <p>recovered</p>;
    }
    const { container, rerender } = render(
      <SlotErrorBoundary contributionId="dashboard.flaky">
        <Flaky />
      </SlotErrorBoundary>,
    );
    expect(container).toBeEmptyDOMElement();
    failing = false;
    rerender(
      <SlotErrorBoundary contributionId="dashboard.flaky">
        <Flaky />
      </SlotErrorBoundary>,
    );
    expect(screen.queryByText("recovered")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
