import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/middleware", () => ({ default: () => () => undefined }));
vi.mock("@/i18n/routing", () => ({ routing: {} }));

import { config } from "@/proxy";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("matcher proxy.ts", () => {
  it.each([
    "/api-keys",
    "/apikeys",
    "/api-docs",
    "/dashboard",
    "/",
    "/en/api-keys",
    "/audit-log",
  ])("uruchamia middleware i18n dla %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each([
    "/api",
    "/api/uploads",
    "/api/v1/organization",
    "/api/auth/sign-in/email",
    "/_next/static/chunk.js",
    "/_vercel/insights",
    "/favicon.ico",
  ])("pomija middleware i18n dla %s", (url) => {
    expect(matches(url)).toBe(false);
  });
});
