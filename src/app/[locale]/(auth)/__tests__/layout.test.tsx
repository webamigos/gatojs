import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { generatedBranding } = vi.hoisted(() => ({
  generatedBranding: {} as {
    logo?: { src: string; alt: string; width: number; height: number };
  },
}));

vi.mock("@/modules.client.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.client.generated")>()),
  gatoBranding: generatedBranding,
}));

import AuthLayout from "../layout";

async function renderLayout() {
  return render(
    await AuthLayout({ children: <form aria-label="Sign in form" /> }),
  );
}

describe("AuthLayout", () => {
  beforeEach(() => {
    delete generatedBranding.logo;
  });

  it("without a logo renders the children and no image", async () => {
    await renderLayout();

    expect(
      screen.getByRole("form", { name: "Sign in form" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("without a logo renders no project name", async () => {
    await renderLayout();

    expect(screen.queryByText("WA App")).toBeNull();
  });

  it("with a logo renders the logo image with its alt and the children", async () => {
    generatedBranding.logo = {
      src: "/logo.svg",
      alt: "Acme",
      width: 120,
      height: 32,
    };
    await renderLayout();

    const logo = screen.getByRole("img", { name: "Acme" });
    expect(logo).toHaveAttribute("alt", "Acme");
    expect(logo.getAttribute("src")).toContain("/logo.svg");
    expect(logo).toHaveAttribute("width", "120");
    expect(logo).toHaveAttribute("height", "32");
    expect(
      screen.getByRole("form", { name: "Sign in form" }),
    ).toBeInTheDocument();
  });

  it("with a logo the logo comes before the children", async () => {
    generatedBranding.logo = {
      src: "/logo.svg",
      alt: "Acme",
      width: 120,
      height: 32,
    };
    await renderLayout();

    const logo = screen.getByRole("img", { name: "Acme" });
    const form = screen.getByRole("form", { name: "Sign in form" });
    expect(
      logo.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
