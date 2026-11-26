// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const { mockCreateUpload, mockReadOrgContext } = vi.hoisted(() => ({
  mockCreateUpload: vi.fn(),
  mockReadOrgContext: vi.fn(),
}));

vi.mock("@/features/uploads/services/api-org-context", () => ({
  readOrgContextForApi: mockReadOrgContext,
}));
vi.mock("@/features/uploads/services/commands/create-upload", () => ({
  createUpload: mockCreateUpload,
}));
vi.mock("@/features/uploads/services/upload-purposes", () => ({
  maxUploadBytes: () => 5 * 1024 * 1024,
}));
vi.mock("@/modules.client.generated", async () => {
  const { applyGatoConfig } = await import("@/shared/lib/modules/gato-config");
  const modules: ModuleDef[] = [
    { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
    { key: "uploads", nav: [], routePrefixes: [] },
  ];
  return {
    authClientPlugins: [],
    clientModules: applyGatoConfig(modules, {
      modules: { uploads: { enabled: false } },
    }),
  };
});

import { POST, runtime } from "../route";

function requestWith(contentLength: string | null) {
  const headers = new Headers();
  if (contentLength !== null) {
    headers.set("content-length", contentLength);
  }
  const request = new Request("http://localhost/api/uploads", {
    method: "POST",
    headers,
  });
  const formData = vi.fn(async () => {
    const form = new FormData();
    form.set("purpose", "editor-image");
    return form;
  });
  Object.defineProperty(request, "formData", { value: formData });
  return { request, formData };
}

beforeEach(() => {
  mockReadOrgContext.mockReset();
  mockCreateUpload.mockReset();
  mockReadOrgContext.mockResolvedValue({
    ok: true,
    context: {
      userId: "user-1",
      organizationId: "org-a",
      orgRole: "owner",
      userRole: "user",
      serviceMode: false,
    },
  });
  mockCreateUpload.mockResolvedValue({
    status: 201,
    body: {
      id: "id-1",
      url: "/api/uploads/id-1",
      fileName: "a.png",
      mimeType: "image/png",
      size: 10,
    },
  });
});

describe("POST /api/uploads with uploads disabled", () => {
  it("answers 404 with an empty body without Content-Length, before the 411 check", async () => {
    const { request, formData } = requestWith(null);

    const response = await POST(request);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
    expect(mockReadOrgContext).not.toHaveBeenCalled();
    expect(mockCreateUpload).not.toHaveBeenCalled();
  });

  it("answers 404 with an empty body for a declared length of 10", async () => {
    const { request, formData } = requestWith("10");

    const response = await POST(request);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
    expect(mockReadOrgContext).not.toHaveBeenCalled();
    expect(mockCreateUpload).not.toHaveBeenCalled();
  });

  it("answers 404 instead of 413 for an oversized declared length", async () => {
    const { request } = requestWith(String(100 * 1024 * 1024));

    const response = await POST(request);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});

describe("/api/uploads route config", () => {
  it("runs on the Node.js runtime", () => {
    expect(runtime).toBe("nodejs");
  });
});
