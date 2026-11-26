// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const {
  mockReadOrgContext,
  mockUploadCreate,
  mockPutObject,
  mockDeleteObject,
  mockTrackAudit,
} = vi.hoisted(() => ({
  mockReadOrgContext: vi.fn(),
  mockUploadCreate: vi.fn(),
  mockPutObject: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockTrackAudit: vi.fn(),
}));

vi.mock("@/env", () => ({ env: { MULTI_ORG: false } }));
vi.mock("../../api-org-context", () => ({
  readOrgContextForApi: mockReadOrgContext,
}));
vi.mock("@/shared/lib/prisma", () => ({
  prisma: { upload: { create: mockUploadCreate } },
}));
vi.mock("../../storage", () => ({
  putObject: mockPutObject,
  deleteObject: mockDeleteObject,
}));
vi.mock("@/shared/lib/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/audit")>()),
  trackAudit: (event: unknown) => mockTrackAudit(event),
}));
vi.mock("@/shared/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/modules.generated", () => ({
  auditSinks: [],
  modules: [
    {
      key: "uploads",
      nav: [],
      routePrefixes: [],
      uploadPurposes: [
        {
          key: "editor-image",
          mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          maxBytes: 5 * 1024 * 1024,
          visibility: "public",
        },
      ],
    },
  ],
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

import { createUpload } from "../create-upload";

async function validForm(): Promise<FormData> {
  const png = await sharp({
    create: {
      width: 4,
      height: 3,
      channels: 3,
      background: { r: 10, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(png)], "photo.png", { type: "image/png" }),
  );
  form.set("purpose", "editor-image");
  return form;
}

beforeEach(() => {
  mockReadOrgContext.mockReset();
  mockReadOrgContext.mockResolvedValue({
    ok: true,
    context: {
      userId: "user-1",
      organizationId: "org-1",
      orgRole: "owner",
      userRole: "user",
      serviceMode: false,
    },
  });
  mockUploadCreate.mockReset();
  mockUploadCreate.mockResolvedValue({ id: "id-1" });
  mockPutObject.mockReset();
  mockPutObject.mockResolvedValue(undefined);
  mockDeleteObject.mockReset();
  mockTrackAudit.mockReset();
});

describe("createUpload with uploads disabled", () => {
  it("answers 404 not_found for a valid file", async () => {
    const result = await createUpload(await validForm());

    expect(result).toEqual({ status: 404, body: { error: "not_found" } });
  });

  it("does not read the session, store the object nor create a row", async () => {
    await createUpload(await validForm());

    expect(mockReadOrgContext).not.toHaveBeenCalled();
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(mockUploadCreate).not.toHaveBeenCalled();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("answers 404 not_found before the session check rejects an anonymous caller", async () => {
    mockReadOrgContext.mockResolvedValue({ ok: false, status: 401 });

    const result = await createUpload(await validForm());

    expect(result).toEqual({ status: 404, body: { error: "not_found" } });
  });
});
