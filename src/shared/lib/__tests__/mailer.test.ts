import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
const sendMail = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail })));
const info = vi.hoisted(() => vi.fn());
const error = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(() => ({
  MAIL_PROVIDER: undefined as "smtp" | "resend" | "console" | undefined,
  RESEND_API_KEY: undefined as string | undefined,
  SMTP_URL: undefined as string | undefined,
  SMTP_HOST: undefined as string | undefined,
  SMTP_PORT: 587,
  SMTP_USER: undefined as string | undefined,
  SMTP_PASS: undefined as string | undefined,
  SMTP_SECURE: false,
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
vi.mock("@/env", () => ({ env: envMock }));

type Mailer = typeof import("@/shared/lib/mailer");

let sendPasswordResetEmail: Mailer["sendPasswordResetEmail"];
let sendWelcomeSetPasswordEmail: Mailer["sendWelcomeSetPasswordEmail"];
let sendOrganizationInvitationEmail: Mailer["sendOrganizationInvitationEmail"];

describe("mailer", () => {
  beforeEach(async () => {
    envMock.MAIL_PROVIDER = undefined;
    envMock.RESEND_API_KEY = undefined;
    envMock.SMTP_URL = undefined;
    envMock.SMTP_HOST = undefined;
    envMock.SMTP_PORT = 587;
    envMock.SMTP_USER = undefined;
    envMock.SMTP_PASS = undefined;
    envMock.SMTP_SECURE = false;
    vi.resetModules();
    ({
      sendPasswordResetEmail,
      sendWelcomeSetPasswordEmail,
      sendOrganizationInvitationEmail,
    } = await import("@/shared/lib/mailer"));
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
    envMock.SMTP_URL = "smtp://127.0.0.1:1025";
    envMock.RESEND_API_KEY = "re_test";
    sendMail.mockResolvedValue({ messageId: "smtp-1" });

    const result = await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(createTransport.mock.calls).toStrictEqual([
      ["smtp://127.0.0.1:1025"],
    ]);
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

  it("SMTP_HOST alone → one transport with port 587, secure false and no auth", async () => {
    envMock.SMTP_HOST = "relay.internal";
    sendMail.mockResolvedValue({ messageId: "smtp-2" });

    const result = await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(createTransport.mock.calls).toStrictEqual([
      [{ host: "relay.internal", port: 587, secure: false }],
    ]);
    expect(sendMail).toHaveBeenCalledWith({
      from: "WA App <noreply@example.com>",
      to: "a@example.com",
      subject: "Zresetuj hasło",
      html: "<p>html</p>",
    });
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ data: { id: "smtp-2" } });
  });

  it("SMTP_HOST with SMTP_USER and SMTP_PASS → the transport gets auth", async () => {
    envMock.SMTP_HOST = "relay.internal";
    envMock.SMTP_USER = "app";
    envMock.SMTP_PASS = "pw";
    sendMail.mockResolvedValue({ messageId: "smtp-3" });

    await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(createTransport.mock.calls).toStrictEqual([
      [
        {
          host: "relay.internal",
          port: 587,
          secure: false,
          auth: { user: "app", pass: "pw" },
        },
      ],
    ]);
  });

  it("SMTP_HOST with port 465 and SMTP_SECURE → the transport uses them", async () => {
    envMock.SMTP_HOST = "relay.internal";
    envMock.SMTP_PORT = 465;
    envMock.SMTP_SECURE = true;
    sendMail.mockResolvedValue({ messageId: "smtp-4" });

    await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(createTransport.mock.calls).toStrictEqual([
      [{ host: "relay.internal", port: 465, secure: true }],
    ]);
  });

  it("SMTP_HOST wins over RESEND_API_KEY when MAIL_PROVIDER is unset", async () => {
    envMock.SMTP_HOST = "relay.internal";
    envMock.RESEND_API_KEY = "re_test";
    sendMail.mockResolvedValue({ messageId: "smtp-5" });

    await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("the SMTP transport is created once for several emails", async () => {
    envMock.SMTP_HOST = "relay.internal";
    sendMail.mockResolvedValue({ messageId: "smtp-6" });

    await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });
    await sendPasswordResetEmail({
      to: "b@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it("explicit console with SMTP_HOST set → no transport, no Resend, a log line and { data: null }", async () => {
    envMock.MAIL_PROVIDER = "console";
    envMock.SMTP_HOST = "relay.internal";
    envMock.RESEND_API_KEY = "re_test";

    const result = await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(info.mock.calls).toStrictEqual([
      [
        "[MAILER] mail provider is console, email not sent",
        { to: "a@example.com", subject: "Zresetuj hasło" },
      ],
    ]);
    expect(result).toEqual({ data: null });
  });

  it("explicit resend with SMTP_HOST set → sends through Resend, no SMTP transport", async () => {
    envMock.MAIL_PROVIDER = "resend";
    envMock.SMTP_HOST = "relay.internal";
    envMock.RESEND_API_KEY = "re_test";
    send.mockResolvedValue({ data: { id: "r-1" }, error: null });

    const result = await sendPasswordResetEmail({
      to: "a@example.com",
      resetUrl: "http://localhost/reset",
    });

    expect(createTransport).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "WA App <noreply@example.com>",
        to: ["a@example.com"],
      }),
    );
    expect(result).toEqual({ data: { id: "r-1" } });
  });
});
