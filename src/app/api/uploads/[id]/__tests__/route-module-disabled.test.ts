// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const { mockReadUpload } = vi.hoisted(() => ({ mockReadUpload: vi.fn() }));

vi.mock("@/features/uploads/services/read-upload", () => ({
  readUploadForDownload: mockReadUpload,
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

import { GET } from "../route";

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mockReadUpload.mockReset();
  mockReadUpload.mockResolvedValue({
    status: 200,
    body: new Uint8Array([7, 8, 9]),
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'inline; filename="a.png"',
    },
  });
});

describe("GET /api/uploads/[id] with uploads disabled", () => {
  it("answers 404 with an empty body and does not read the upload", async () => {
    const response = await GET(
      new Request(`http://localhost/api/uploads/${ID}`),
      {
        params: Promise.resolve({ id: ID }),
      },
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(mockReadUpload).not.toHaveBeenCalled();
  });
});
