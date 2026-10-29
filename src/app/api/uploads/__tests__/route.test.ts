// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "../route";

const LIMIT = 5 * 1024 * 1024 + 65536;

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
  mockReadOrgContext.mockResolvedValue({
    ok: true,
    context: {
      userId: "user-1",
      organizationId: "org-a",
      orgRole: "member",
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
      mimeType: "image/jpeg",
      size: 10,
    },
  });
});

describe("POST /api/uploads", () => {
  it("zwraca 411 length_required bez Content-Length", async () => {
    const { request, formData } = requestWith(null);

    const response = await POST(request);

    expect(response.status).toBe(411);
    expect(await response.json()).toEqual({ error: "length_required" });
    expect(formData).not.toHaveBeenCalled();
    expect(mockCreateUpload).not.toHaveBeenCalled();
  });

  it("zwraca 411 length_required dla nienumerycznego Content-Length", async () => {
    const { request, formData } = requestWith("abc");

    const response = await POST(request);

    expect(response.status).toBe(411);
    expect(await response.json()).toEqual({ error: "length_required" });
    expect(formData).not.toHaveBeenCalled();
  });

  it("zwraca 413 too_large przy limit + 1 i nie czyta ciała", async () => {
    const { request, formData } = requestWith(String(LIMIT + 1));

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "too_large" });
    expect(formData).not.toHaveBeenCalled();
    expect(mockCreateUpload).not.toHaveBeenCalled();
  });

  it("przepuszcza dokładnie limit", async () => {
    const { request, formData } = requestWith(String(LIMIT));

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(formData).toHaveBeenCalledTimes(1);
    expect(mockCreateUpload).toHaveBeenCalledTimes(1);
  });

  it("zwraca 400 invalid_input dla niepoprawnego multipart", async () => {
    const { request, formData } = requestWith("100");
    formData.mockRejectedValue(new TypeError("bad multipart"));

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_input" });
    expect(mockCreateUpload).not.toHaveBeenCalled();
  });

  it("przekazuje status i body z createUpload bez zmian", async () => {
    mockCreateUpload.mockResolvedValue({
      status: 415,
      body: { error: "unsupported_type" },
    });
    const { request } = requestWith("100");

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_type" });
  });

  it("przekazuje 201 z ciałem odpowiedzi", async () => {
    const { request } = requestWith("100");

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "id-1",
      url: "/api/uploads/id-1",
      fileName: "a.png",
      mimeType: "image/jpeg",
      size: 10,
    });
  });

  it("zwraca 401 bez sesji i nie czyta ciała", async () => {
    mockReadOrgContext.mockResolvedValue({ ok: false, status: 401 });
    const { request, formData } = requestWith("100");

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(formData).not.toHaveBeenCalled();
    expect(mockCreateUpload).not.toHaveBeenCalled();
  });

  it("zwraca 403 bez organizacji i nie czyta ciała", async () => {
    mockReadOrgContext.mockResolvedValue({ ok: false, status: 403 });
    const { request, formData } = requestWith("100");

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
    expect(mockCreateUpload).not.toHaveBeenCalled();
  });
});
