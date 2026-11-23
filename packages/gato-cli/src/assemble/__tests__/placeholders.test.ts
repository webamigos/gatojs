import { describe, expect, it } from "vitest";
import { applyPlaceholders } from "../placeholders.js";
import { testConfig } from "./manifests.js";

const names = { name: "Acme Shop", slug: "acme-shop", snake: "acme_shop" };

describe("applyPlaceholders", () => {
  it("podmienia kazde wystapienie wszystkich trzech placeholderow", () => {
    expect(
      applyPlaceholders(
        "src/shared/config/project.ts",
        "WA App wa-app wa_app WA App",
        testConfig,
        names,
      ),
    ).toBe("Acme Shop acme-shop acme_shop Acme Shop");
  });

  it("podmienia wiele wystapien tego samego placeholdera", () => {
    expect(
      applyPlaceholders(
        "README.md",
        "wa-app/wa-app wa_app_wa_app",
        testConfig,
        names,
      ),
    ).toBe("acme-shop/acme-shop acme_shop_acme_shop");
  });

  it("plik spoza placeholderFiles zostaje bez zmian", () => {
    expect(
      applyPlaceholders("src/x.test.ts", '"WA App" wa-app', testConfig, names),
    ).toBe('"WA App" wa-app');
  });

  it("dopasowanie sciezki jest dokladne a nie przez prefiks", () => {
    expect(
      applyPlaceholders("README.md.bak", "WA App", testConfig, names),
    ).toBe("WA App");
  });

  it("wartosci placeholderow pochodza z konfiguracji", () => {
    const config = {
      ...testConfig,
      placeholders: {
        projectName: "Kit",
        projectSlug: "kit-slug",
        projectSnake: "kit_snake",
      },
    };
    expect(
      applyPlaceholders(
        "README.md",
        "Kit kit-slug kit_snake WA App",
        config,
        names,
      ),
    ).toBe("Acme Shop acme-shop acme_shop WA App");
  });
});
