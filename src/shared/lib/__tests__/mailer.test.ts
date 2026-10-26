import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
const info = vi.hoisted(() => vi.fn());
const error = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(() => ({
  RESEND_API_KEY: undefined as string | undefined,
  EMAIL_FROM: "WA App <noreply@example.com>",
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
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
});
