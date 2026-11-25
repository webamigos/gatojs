// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const { mockAuthenticateApiKey, mockReadOrganization } = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn(),
  mockReadOrganization: vi.fn(),
}));

vi.mock("@/features/api-keys/services/authenticate-api-key", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
}));
vi.mock("@/features/api-keys/services/organization-api", () => ({
  readOrganizationForApiKey: mockReadOrganization,
}));

const API_KEY_CONTEXT = {
  organizationId: "org-1",
  apiKeyId: "key-1",
  scopes: ["organization:read"],
};

async function loadRoute(apiKeysEnabled: boolean) {
  vi.resetModules();
  vi.doMock("@/modules.client.generated", async () => {
    const { applyGatoConfig } =
      await import("@/shared/lib/modules/gato-config");
    const modules: ModuleDef[] = [
      { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
      {
        key: "api-keys",
        nav: [],
        routePrefixes: ["/api-keys"],
        roles: ["owner", "admin"],
      },
    ];
    return {
      authClientPlugins: [],
      clientModules: applyGatoConfig(
        modules,
        apiKeysEnabled ? {} : { modules: { "api-keys": { enabled: false } } },
      ),
    };
  });
  return import("../route");
}

function requestWith(authorization: string | null) {
  const headers = new Headers();
  if (authorization !== null) {
    headers.set("authorization", authorization);
  }
  return new Request("http://localhost/api/v1/organization", { headers });
}

beforeEach(() => {
  mockAuthenticateApiKey.mockReset();
  mockReadOrganization.mockReset();
  mockAuthenticateApiKey.mockResolvedValue({
    ok: true,
    context: API_KEY_CONTEXT,
  });
  mockReadOrganization.mockResolvedValue({ id: "org-1" });
});

describe("GET /api/v1/organization with api-keys disabled", () => {
  it("answers 404 with an empty body and no-store for a valid-looking key", async () => {
    const { GET } = await loadRoute(false);

    const response = await GET(requestWith("Bearer gato_live_abc"));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 404 without an Authorization header, not 401", async () => {
    const { GET } = await loadRoute(false);

    const response = await GET(requestWith(null));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("does not authenticate the key nor read the organization", async () => {
    const { GET } = await loadRoute(false);

    await GET(requestWith("Bearer gato_live_abc"));

    expect(mockAuthenticateApiKey).not.toHaveBeenCalled();
    expect(mockReadOrganization).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/organization with api-keys enabled", () => {
  it("answers 200 with the organization read for the key context", async () => {
    const { GET } = await loadRoute(true);

    const response = await GET(requestWith("Bearer gato_live_abc"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "org-1" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockReadOrganization).toHaveBeenCalledWith(API_KEY_CONTEXT);
  });

  it("passes the authentication failure status and error through", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      ok: false,
      status: 401,
      error: "invalid_key",
    });
    const { GET } = await loadRoute(true);

    const response = await GET(requestWith("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_key" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockReadOrganization).not.toHaveBeenCalled();
  });
});
