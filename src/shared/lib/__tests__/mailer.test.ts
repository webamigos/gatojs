import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
const sendMail = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail })));
const info = vi.hoisted(() => vi.fn());
const error = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(() => ({
  RESEND_API_KEY: undefined as string | undefined,
  SMTP_URL: undefined as string | undefined,
  EMAIL_FROM: "WA App <noreply@example.com>",
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("@react-email/render", () => ({
  render: vi.fn(async () => "<p>html</p>"),
}));
vi.mock("@/shared/lib/logger", () => ({
  logger: { info, error, warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/lib/env", () => ({ env: envMock }));

import {
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendWelcomeSetPasswordEmail,
} from "@/shared/lib/mailer";

describe("mailer", () => {
  beforeEach(() => {
    envMock.RESEND_API_KEY = undefined;
    envMock.SMTP_URL = undefined;
  });

  it("bez RESEND_API_KEY loguje { to, subject } i nie woła Resend", async () => {
    const result = await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.any(String), {
      to: "a@example.com",
      subject: "Zresetuj hasło",
    });
    expect(result).toEqual({ data: null });
  });

  it("loguje maile powitalne i zaproszenia bez klucza", async () => {
    await sendWelcomeSetPasswordEmail({
      to: "b@example.com",
      name: "Ala",
      resetUrl: "http://localhost/r",
    });
    await sendOrganizationInvitationEmail({
      to: "c@example.com",
      organizationName: "Acme",
      inviterName: "Ala",
      acceptUrl: "http://localhost/accept-invitation/1",
    });

    expect(send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(2);
  });

  it("z kluczem wysyła przez Resend z EMAIL_FROM", async () => {
    envMock.RESEND_API_KEY = "re_test";
    send.mockResolvedValue({ data: { id: "1" }, error: null });

    const result = await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "WA App <noreply@example.com>",
        to: ["a@example.com"],
        subject: "Zresetuj hasło",
      }),
    );
    expect(result).toEqual({ data: { id: "1" } });
  });

  it("błąd Resend zwraca error zamiast rzucać", async () => {
    envMock.RESEND_API_KEY = "re_test";
    send.mockResolvedValue({ data: null, error: { message: "bad" } });

    const result = await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(result).toHaveProperty("error");
    expect(error).toHaveBeenCalled();
  });

  it("SMTP_URL ma pierwszeństwo przed RESEND_API_KEY", async () => {
    envMock.SMTP_URL = "smtp://localhost:1025";
    envMock.RESEND_API_KEY = "re_test";
    sendMail.mockResolvedValue({ messageId: "smtp-1" });

    const result = await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(createTransport).toHaveBeenCalledWith("smtp://localhost:1025");
    expect(sendMail).toHaveBeenCalledWith({
      from: "WA App <noreply@example.com>",
      to: "a@example.com",
      subject: "Zresetuj hasło",
      html: "<p>html</p>",
    });
    expect(send).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(result).toEqual({ data: { id: "smtp-1" } });
  });

  it("błąd SMTP zwraca error zamiast rzucać", async () => {
    envMock.SMTP_URL = "smtp://localhost:1025";
    sendMail.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(result).toHaveProperty("error");
    expect(error).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
