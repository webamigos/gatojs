import { expect, type Page } from "@playwright/test";
import { MAILPIT_URL } from "./env";

export const LABELS = {
  email: "Email",
  name: "Imię i nazwisko",
  signInSubmit: "Zaloguj się",
  signUpSubmit: "Zarejestruj się",
  sendLink: "Wyślij link",
  savePassword: "Zapisz nowe hasło",
  inviteUser: "Zaproś użytkownika",
  inviteSubmit: "Wyślij zaproszenie",
  invited: "Zaproszenie wysłane",
  createOrganization: "Utwórz organizację",
  orgSwitcher: "Organizacja",
} as const;

type MailpitAddress = { Address: string };
type MailpitSummary = { ID: string; To: MailpitAddress[]; Subject: string };
type MailpitMessage = {
  ID: string;
  Subject: string;
  HTML: string;
  Text: string;
};

export async function clearMailbox(): Promise<void> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`mailpit DELETE /messages zwrócił ${response.status}`);
  }
}

export async function getLastMail(to: string): Promise<MailpitMessage> {
  const recipient = to.toLowerCase();
  let latest: MailpitSummary | undefined;

  await expect
    .poll(
      async () => {
        const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
        const body = (await response.json()) as { messages: MailpitSummary[] };
        latest = body.messages.find((message) =>
          message.To.some(
            (address) => address.Address.toLowerCase() === recipient,
          ),
        );
        return latest?.ID;
      },
      { message: `brak maila do ${to}`, timeout: 15_000 },
    )
    .toBeTruthy();

  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${latest!.ID}`);
  return (await response.json()) as MailpitMessage;
}

export function extractLink(mail: MailpitMessage, fragment: string): string {
  const links = [...mail.HTML.matchAll(/href="([^"]+)"/g)].map((match) =>
    match[1].replaceAll("&amp;", "&"),
  );
  const link = links.find((href) => href.includes(fragment));
  if (!link) {
    throw new Error(
      `Brak linku zawierającego ${fragment} w mailu "${mail.Subject}"`,
    );
  }
  return link;
}

export async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel(LABELS.email).fill(email);
  await page.locator("input#password").fill(password);
  await page.getByRole("button", { name: LABELS.signInSubmit }).click();
  await page.waitForURL("**/dashboard");
}

export async function signUp(
  page: Page,
  user: { name: string; email: string; password: string },
): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel(LABELS.name).fill(user.name);
  await page.getByLabel(LABELS.email).fill(user.email);
  await page.locator("input#password").fill(user.password);
  await page.getByRole("button", { name: LABELS.signUpSubmit }).click();
  await page.waitForURL(/\/(sign-in|dashboard)$/);
}

export async function setNewPassword(
  page: Page,
  link: string,
  password: string,
): Promise<void> {
  await page.goto(link);
  await page.locator("input#password").fill(password);
  await page.locator("input#confirm").fill(password);
  await page.getByRole("button", { name: LABELS.savePassword }).click();
  await page.waitForURL("**/sign-in");
}
