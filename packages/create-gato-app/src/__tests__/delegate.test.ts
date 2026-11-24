import { describe, expect, it } from "vitest";
import { gatoCreateCommand } from "../delegate.js";

describe("gatoCreateCommand", () => {
  it("buduje pełne wywołanie gato create z odpowiedziami w formie --flaga=wartość i kitem na końcu", () => {
    expect(
      gatoCreateCommand({
        nodePath: "/n",
        gatoBin: "/g.mjs",
        kitDir: "/k",
        projectDir: "/w/acme-shop",
        answers: { modules: ["uploads"], locales: ["pl", "en"], title: "Acme Shop", adminEmail: "a@b.co" },
        cliSource: "/c.tgz",
      }),
    ).toEqual({
      command: "/n",
      args: [
        "/g.mjs",
        "create",
        "/w/acme-shop",
        "--yes",
        "--no-install",
        "--no-git",
        "--modules=uploads",
        "--locales=pl,en",
        "--title=Acme Shop",
        "--admin-email=a@b.co",
        "--cli-source=/c.tgz",
        "--kit=/k",
      ],
    });
  });

  it("bez e-maila i źródła CLI pomija te dwie flagi, a pusta lista modułów daje --modules=", () => {
    expect(
      gatoCreateCommand({
        nodePath: "/n",
        gatoBin: "/g.mjs",
        kitDir: "/k",
        projectDir: "/w/acme-shop",
        answers: { modules: [], locales: ["pl"], title: "Acme Shop", adminEmail: null },
        cliSource: null,
      }),
    ).toEqual({
      command: "/n",
      args: [
        "/g.mjs",
        "create",
        "/w/acme-shop",
        "--yes",
        "--no-install",
        "--no-git",
        "--modules=",
        "--locales=pl",
        "--title=Acme Shop",
        "--kit=/k",
      ],
    });
  });

  it("kilka modułów łączy przecinkiem w podanej kolejności", () => {
    const { args } = gatoCreateCommand({
      nodePath: "/n",
      gatoBin: "/g.mjs",
      kitDir: "/k",
      projectDir: "/w/acme-shop",
      answers: { modules: ["demo", "needs-demo", "uploads"], locales: ["pl"], title: "-Acme", adminEmail: null },
      cliSource: null,
    });
    expect(args).toContain("--modules=demo,needs-demo,uploads");
    expect(args).toContain("--title=-Acme");
    expect(args).not.toContain("-Acme");
  });

  it("nigdy nie uruchamia wa.mjs kitu", () => {
    const { args } = gatoCreateCommand({
      nodePath: "/n",
      gatoBin: "/nm/gato-cli/dist/gato.mjs",
      kitDir: "/k",
      projectDir: "/w/app",
      answers: { modules: [], locales: ["pl"], title: "App", adminEmail: null },
      cliSource: null,
    });
    expect(args.some((arg) => arg.includes("wa.mjs"))).toBe(false);
  });
});
