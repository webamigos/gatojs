// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadUpload } = vi.hoisted(() => ({ mockReadUpload: vi.fn() }));

vi.mock("@/features/uploads/services/read-upload", () => ({
  readUploadForDownload: mockReadUpload,
}));

import { GET } from "../route";

const ID = "11111111-1111-4111-8111-111111111111";

function call(id: string) {
  return GET(new Request(`http://localhost/api/uploads/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  mockReadUpload.mockReset();
});

describe("GET /api/uploads/[id]", () => {
  it("przekazuje id z adresu i zwraca 200 z ciałem i nagłówkami", async () => {
    mockReadUpload.mockResolvedValue({
      status: 200,
      body: new Uint8Array([7, 8, 9]),
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="a.png"',
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });

    const response = await call(ID);

    expect(mockReadUpload).toHaveBeenCalledWith(ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="a.png"',
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(response.headers.get("content-security-policy")).toBe(
      "sandbox; default-src 'none'",
    );
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      7, 8, 9,
    ]);
  });

  it("zwraca 404 bez ciała pliku, gdy odczyt zwrócił 404", async () => {
    mockReadUpload.mockResolvedValue({ status: 404 });

    const response = await call(ID);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-disposition")).toBeNull();
  });
});
