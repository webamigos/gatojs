import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import {
  runWithRequestPrincipal,
  type RequestPrincipal,
} from "../request-principal";
import type { UserRole } from "../roles";
import { assertGlobalAdmin } from "../single-org-guard";

function principal(accountRole: UserRole): RequestPrincipal {
  return {
    channel: "mcp",
    userId: "u1",
    organizationId: "o1",
    accountRole,
    credentialId: "client-1",
    scopes: ["mcp:read"],
    correlationId: "corr-1",
  };
}

describe("assertGlobalAdmin nie czyta principala żądania", () => {
  it("rola z sesji user pod principalem superadmina → FORBIDDEN", () => {
    expect(() =>
      runWithRequestPrincipal(principal("superadmin"), () =>
        assertGlobalAdmin("user"),
      ),
    ).toThrow(APIError);
  });

  it("rola z sesji admin pod principalem zwykłego użytkownika → przepuszcza", () => {
    expect(() =>
      runWithRequestPrincipal(principal("user"), () =>
        assertGlobalAdmin("admin"),
      ),
    ).not.toThrow();
  });
});
