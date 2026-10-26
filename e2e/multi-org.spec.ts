import { expect, test } from "@playwright/test";
import { LABELS, signIn, signUp } from "./helpers";

const ANIA = {
  name: "Ania",
  email: "ania@test.pl",
  password: "AniaPassword123!",
};
const BARTEK = {
  name: "Bartek",
  email: "bartek@test.pl",
  password: "BartekPassword123!",
};

test.describe.configure({ mode: "serial" });

test.describe("MULTI_ORG=true, AUTH_PUBLIC_SIGNUP=true", () => {
  test("rejestracja Ani tworzy jej organizację i pokazuje OrgSwitcher", async ({
    page,
  }) => {
    await signUp(page, ANIA);
    await signIn(page, ANIA.email, ANIA.password);

    const orgSwitcher = page.getByRole("group", {
      name: LABELS.orgSwitcher,
    });
    await expect(orgSwitcher).toBeVisible();
    await expect(
      orgSwitcher.getByRole("button", { name: LABELS.createOrganization }),
    ).toBeVisible();

    await page.goto("/users");
    await expect(
      page.getByRole("heading", { name: "Ania — organizacja" }),
    ).toBeVisible();
    await expect(page.getByText(ANIA.email)).toBeVisible();
  });

  test("rejestracja Bartka tworzy osobną organizację bez Ani", async ({
    page,
  }) => {
    await signUp(page, BARTEK);
    await signIn(page, BARTEK.email, BARTEK.password);

    await page.goto("/users");
    await expect(
      page.getByRole("heading", { name: "Bartek — organizacja" }),
    ).toBeVisible();
    await expect(page.getByText(BARTEK.email)).toBeVisible();
    await expect(page.getByText(ANIA.email)).toHaveCount(0);
    await expect(page.getByText(ANIA.name, { exact: true })).toHaveCount(0);
  });
});
