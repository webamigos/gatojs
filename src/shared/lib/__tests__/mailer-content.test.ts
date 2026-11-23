import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});

vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn() };
  },
}));
vi.mock("@/shared/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/env", () => ({
  env: {
    SMTP_URL: "smtp://localhost:1025",
    RESEND_API_KEY: undefined,
    EMAIL_FROM: "Gato Test <noreply@example.com>",
  },
}));
vi.mock("@/shared/config/project", () => ({
  project: { name: "Gato Test", slug: "gato-test" },
}));

import {
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendWelcomeSetPasswordEmail,
} from "@/shared/lib/mailer";

const RESET_URL =
  "https://app.test/api/auth/reset-password/tok123?callbackURL=%2Freset-password";
const ACCEPT_URL = "https://app.test/accept-invitation/inv-1";
const POLISH_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

type SentMail = { to: string; subject: string; html: string };

function sentMail(): SentMail {
  expect(sendMail).toHaveBeenCalledTimes(1);
  return sendMail.mock.calls[0][0] as SentMail;
}

function textOf(html: string): string {
  const text =
    new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  return text.replace(/\s+/g, " ");
}

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue({ messageId: "smtp-1" });
});

describe("sendPasswordResetEmail", () => {
  it("en: temat Reset your password, treść po angielsku z linkiem resetu", async () => {
    await sendPasswordResetEmail({
      to: "ann@example.com",
      resetUrl: RESET_URL,
      locale: "en",
    });

    const mail = sentMail();
    const text = textOf(mail.html);
    expect(mail.to).toBe("ann@example.com");
    expect(mail.subject).toBe("Reset your password");
    expect(text).toContain(
      "We received a request to reset the password for your account.",
    );
    expect(text).toContain("Click the button below to set a new password:");
    expect(text).toContain("Reset password");
    expect(text).toContain(
      "If you didn't ask to reset your password, ignore this email. The link expires in 48 hours.",
    );
    expect(mail.html).toContain(`href="${RESET_URL}"`);
  });

  it("en: w treści i temacie nie ma polskiego tekstu", async () => {
    await sendPasswordResetEmail({
      to: "ann@example.com",
      resetUrl: RESET_URL,
      locale: "en",
    });

    const mail = sentMail();
    expect(mail.subject).not.toMatch(POLISH_LETTERS);
    expect(textOf(mail.html)).not.toMatch(POLISH_LETTERS);
    expect(textOf(mail.html)).not.toContain("Zresetuj");
  });

  it("pl: temat Zresetuj hasło, treść po polsku z linkiem resetu", async () => {
    await sendPasswordResetEmail({
      to: "ann@example.com",
      resetUrl: RESET_URL,
      locale: "pl",
    });

    const mail = sentMail();
    const text = textOf(mail.html);
    expect(mail.subject).toBe("Zresetuj hasło");
    expect(text).toContain(
      "Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta.",
    );
    expect(text).toContain(
      "Kliknij poniższy przycisk, aby ustawić nowe hasło:",
    );
    expect(text).toContain(
      "Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość. Link wygaśnie za 48 godzin.",
    );
    expect(text).not.toContain("Reset password");
    expect(mail.html).toContain(`href="${RESET_URL}"`);
  });
});

describe("sendWelcomeSetPasswordEmail", () => {
  it("en z imieniem Ann: temat Welcome to <nazwa projektu>, powitanie Hi Ann,", async () => {
    await sendWelcomeSetPasswordEmail({
      to: "ann@example.com",
      name: "Ann",
      resetUrl: RESET_URL,
      locale: "en",
    });

    const mail = sentMail();
    const text = textOf(mail.html);
    expect(mail.subject).toBe("Welcome to Gato Test");
    expect(text).toContain("Hi Ann,");
    expect(text).toContain(
      "An account was created for you in Gato Test. To finish setting it up, set your password:",
    );
    expect(text).toContain("Set password");
    expect(text).toContain(
      "If you weren't expecting this email, ignore it. The link is valid for 48 hours.",
    );
    expect(mail.html).toContain(`href="${RESET_URL}"`);
    expect(text).not.toMatch(POLISH_LETTERS);
  });

  it("en z innym imieniem: powitanie używa podanego imienia", async () => {
    await sendWelcomeSetPasswordEmail({
      to: "zoe@example.com",
      name: "Zoe",
      resetUrl: RESET_URL,
      locale: "en",
    });

    const text = textOf(sentMail().html);
    expect(text).toContain("Hi Zoe,");
    expect(text).not.toContain("Hi Ann,");
    expect(text).not.toContain("Hi,");
  });

  it("en bez imienia: powitanie Hi,", async () => {
    await sendWelcomeSetPasswordEmail({
      to: "ann@example.com",
      resetUrl: RESET_URL,
      locale: "en",
    });

    const text = textOf(sentMail().html);
    expect(text).toContain("Hi,");
    expect(text).not.toContain("Hi undefined");
  });

  it("pl z imieniem Ann: temat Witamy w <nazwa projektu>, powitanie Cześć Ann,", async () => {
    await sendWelcomeSetPasswordEmail({
      to: "ann@example.com",
      name: "Ann",
      resetUrl: RESET_URL,
      locale: "pl",
    });

    const mail = sentMail();
    const text = textOf(mail.html);
    expect(mail.subject).toBe("Witamy w Gato Test");
    expect(text).toContain("Cześć Ann,");
    expect(text).toContain(
      "Utworzono dla Ciebie konto w Gato Test. Aby dokończyć zakładanie konta, ustaw swoje hasło:",
    );
    expect(text).toContain("Ustaw hasło");
  });

  it("pl bez imienia: powitanie Cześć,", async () => {
    await sendWelcomeSetPasswordEmail({
      to: "ann@example.com",
      resetUrl: RESET_URL,
      locale: "pl",
    });

    expect(textOf(sentMail().html)).toContain("Cześć,");
  });
});

describe("sendOrganizationInvitationEmail", () => {
  it("en z zapraszającym Bob do Acme: temat Invitation to Acme, treść Bob invited you to join Acme.", async () => {
    await sendOrganizationInvitationEmail({
      to: "new@example.com",
      organizationName: "Acme",
      inviterName: "Bob",
      acceptUrl: ACCEPT_URL,
      locale: "en",
    });

    const mail = sentMail();
    const text = textOf(mail.html);
    expect(mail.subject).toBe("Invitation to Acme");
    expect(text).toContain("Hi,");
    expect(text).toContain("Bob invited you to join Acme.");
    expect(text).not.toContain("You've been invited to join Acme.");
    expect(text).toContain("Accept invitation");
    expect(text).toContain("If you weren't expecting this email, ignore it.");
    expect(mail.html).toContain(`href="${ACCEPT_URL}"`);
    expect(text).not.toMatch(POLISH_LETTERS);
  });

  it("en z innym zapraszającym: treść używa jego imienia", async () => {
    await sendOrganizationInvitationEmail({
      to: "new@example.com",
      organizationName: "Initech",
      inviterName: "Carol",
      acceptUrl: ACCEPT_URL,
      locale: "en",
    });

    const mail = sentMail();
    expect(mail.subject).toBe("Invitation to Initech");
    expect(textOf(mail.html)).toContain("Carol invited you to join Initech.");
  });

  it("en bez zapraszającego: treść You've been invited to join Acme.", async () => {
    await sendOrganizationInvitationEmail({
      to: "new@example.com",
      organizationName: "Acme",
      acceptUrl: ACCEPT_URL,
      locale: "en",
    });

    const text = textOf(sentMail().html);
    expect(text).toContain("You've been invited to join Acme.");
    expect(text).not.toContain("invited you to join");
  });

  it("pl z zapraszającym Bob do Acme: temat Zaproszenie do Acme, treść po polsku", async () => {
    await sendOrganizationInvitationEmail({
      to: "new@example.com",
      organizationName: "Acme",
      inviterName: "Bob",
      acceptUrl: ACCEPT_URL,
      locale: "pl",
    });

    const mail = sentMail();
    const text = textOf(mail.html);
    expect(mail.subject).toBe("Zaproszenie do Acme");
    expect(text).toContain("Bob zaprasza Cię do organizacji Acme.");
    expect(text).toContain("Przyjmij zaproszenie");
    expect(text).toContain(
      "Jeśli nie spodziewałeś się tej wiadomości, zignoruj ją.",
    );
  });

  it("pl bez zapraszającego: treść Zaproszono Cię do organizacji Acme.", async () => {
    await sendOrganizationInvitationEmail({
      to: "new@example.com",
      organizationName: "Acme",
      acceptUrl: ACCEPT_URL,
      locale: "pl",
    });

    expect(textOf(sentMail().html)).toContain(
      "Zaproszono Cię do organizacji Acme.",
    );
  });
});
