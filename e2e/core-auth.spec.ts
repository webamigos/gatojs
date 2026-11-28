import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./env";
import {
  extractLink,
  getLastMail,
  LABELS,
  setNewPassword,
  signIn,
} from "./helpers";

const JAN = {
  name: "Jan Testowy",
  email: "jan@test.pl",
  password: "JanPassword123!",
  newPassword: "JanNewPassword456!",
};

test.describe.configure({ mode: "serial" });

test.describe("rdzeń: AUTH_PUBLIC_SIGNUP=false, MULTI_ORG=false", () => {
  test("admin zaprasza Jana, Jan ustawia hasło i loguje się", async ({
    page,
  }) => {
    await signIn(page, E2E_ADMIN.email, E2E_ADMIN.password);

    await page.goto("/users");
    await page.getByRole("button", { name: LABELS.inviteUser }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Imię i nazwisko").fill(JAN.name);
    await dialog.getByLabel("Email").fill(JAN.email);
    await dialog.getByRole("button", { name: LABELS.inviteSubmit }).click();
    await expect(page.getByText(LABELS.invited)).toBeVisible();
    await expect(page.getByRole("cell", { name: JAN.email })).toBeVisible();

    const mail = await getLastMail(JAN.email);
    const link = extractLink(mail, "/api/auth/reset-password/");
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page).toHaveURL(/\/set-password\?token=/);
    await setNewPassword(page, page.url(), JAN.password);

    await signIn(page, JAN.email, JAN.password);
    await expect(page.getByText(`Witaj, ${JAN.name}`)).toBeVisible();

    const usersResponse = await page.goto("/users");
    expect(usersResponse?.status()).toBe(404);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });

  test("rejestracja bez zaproszenia zwraca 403", async ({
    request,
    baseURL,
  }) => {
    const response = await request.post("/api/auth/sign-up/email", {
      headers: { Origin: baseURL! },
      data: {
        name: "Intruz",
        email: "intruz@test.pl",
        password: "IntruzPassword123!",
      },
    });
    expect(response.status()).toBe(403);
  });

  test("reset hasła przez forgot-password", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel(LABELS.email).fill(JAN.email);
    await page.getByRole("button", { name: LABELS.sendLink }).click();
    await expect(page.getByText("Jeśli konto istnieje")).toBeVisible();

    await expect
      .poll(async () => (await getLastMail(JAN.email)).Subject)
      .toBe("Zresetuj hasło");
    const mail = await getLastMail(JAN.email);
    await setNewPassword(
      page,
      extractLink(mail, "/api/auth/reset-password/"),
      JAN.newPassword,
    );
    await expect(page).toHaveURL(/\/sign-in$/);

    await signIn(page, JAN.email, JAN.newPassword);
    await expect(page.getByText(`Witaj, ${JAN.name}`)).toBeVisible();
  });
});
