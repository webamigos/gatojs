// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSession,
  mockMemberFindFirst,
  mockOrganizationFindUnique,
  mockUploadCreate,
  mockPutObject,
  mockDeleteObject,
  mockTrackAudit,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockMemberFindFirst: vi.fn(),
  mockOrganizationFindUnique: vi.fn(),
  mockUploadCreate: vi.fn(),
  mockPutObject: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockTrackAudit: vi.fn(),
  mockRedirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/shared/lib/env", () => ({ env: { MULTI_ORG: false } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));
vi.mock("@/shared/lib/prisma", () => ({
  prisma: {
    member: { findFirst: mockMemberFindFirst },
    organization: { findUnique: mockOrganizationFindUnique },
    upload: { create: mockUploadCreate },
  },
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
          resizeImage: { maxWidth: 1200 },
        },
        {
          key: "private-scan",
          mimeTypes: ["image/png"],
          maxBytes: 5 * 1024 * 1024,
          visibility: "organization",
        },
      ],
    },
  ],
}));

import { createUpload } from "../create-upload";
import { readOrgContextForApi as readFromModule } from "../../api-org-context";

async function makePng(width = 40, height = 30): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 10, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer(),
  );
}

function formWith(
  fields: Record<string, string | File | Uint8Array>,
  fileName = "photo.png",
): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value instanceof Uint8Array) {
      form.set(
        name,
        new File([new Uint8Array(value)], fileName, { type: "image/png" }),
      );
    } else {
      form.set(name, value);
    }
  }
  return form;
}

function signIn(input: {
  userId?: string;
  organizationId?: string | null;
  userRole?: string;
  memberRole?: string | null;
}) {
  mockGetSession.mockResolvedValue({
    user: { id: input.userId ?? "user-1", role: input.userRole ?? "user" },
    session: {
      activeOrganizationId:
        input.organizationId === undefined ? "org-a" : input.organizationId,
    },
  });
  const memberRole =
    input.memberRole === undefined ? "owner" : input.memberRole;
  mockMemberFindFirst.mockResolvedValue(
    memberRole === null ? null : { role: memberRole },
  );
  mockOrganizationFindUnique.mockResolvedValue({ id: "org-a" });
}

beforeEach(() => {
  mockPutObject.mockResolvedValue(undefined);
  mockDeleteObject.mockResolvedValue(undefined);
  mockTrackAudit.mockResolvedValue(undefined);
  mockUploadCreate.mockImplementation(async (args: { data: object }) => ({
    ...args.data,
    createdAt: new Date("2026-03-01T12:00:00.000Z"),
  }));
  signIn({});
});

describe("readOrgContextForApi", () => {
  it("zwraca kontekst organizacji dla członka", async () => {
    signIn({ memberRole: "member" });

    const result = await readFromModule();

    expect(result).toEqual({
      ok: true,
      context: {
        userId: "user-1",
        organizationId: "org-a",
        orgRole: "member",
        userRole: "user",
        serviceMode: false,
      },
    });
  });

  it("zwraca 401 bez sesji i nie przekierowuje", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await readFromModule();

    expect(result).toEqual({ ok: false, status: 401 });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("zwraca 403, gdy sesja nie ma aktywnej organizacji", async () => {
    signIn({ organizationId: null });

    expect(await readFromModule()).toEqual({ ok: false, status: 403 });
  });

  it("zwraca 403, gdy zwykły użytkownik nie należy do organizacji", async () => {
    signIn({ memberRole: null });

    expect(await readFromModule()).toEqual({ ok: false, status: 403 });
  });
});

describe("createUpload autoryzacja", () => {
  it("zwraca 401 bez sesji, bez przekierowania i bez zapisu", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await createUpload(
      formWith({ file: await makePng(), purpose: "editor-image" }),
    );

    expect(result.status).toBe(401);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  it("zwraca 403 bez aktywnej organizacji i nie zapisuje", async () => {
    signIn({ organizationId: null });

    const result = await createUpload(
      formWith({ file: await makePng(), purpose: "editor-image" }),
    );

    expect(result.status).toBe(403);
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });
});

describe("createUpload walidacja wejścia", () => {
  it("zwraca 400 bez pola file", async () => {
    const result = await createUpload(formWith({ purpose: "editor-image" }));

    expect(result.status).toBe(400);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it("zwraca 400, gdy file jest tekstem, a nie plikiem", async () => {
    const result = await createUpload(
      formWith({ file: "to nie jest plik", purpose: "editor-image" }),
    );

    expect(result.status).toBe(400);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it("zwraca 400 dla nieznanego celu", async () => {
    const result = await createUpload(
      formWith({ file: await makePng(), purpose: "nieznany-cel" }),
    );

    expect(result.status).toBe(400);
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  it("zwraca 400 bez pola purpose", async () => {
    const result = await createUpload(formWith({ file: await makePng() }));

    expect(result.status).toBe(400);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it("zwraca 400 dla pustego pliku", async () => {
    const result = await createUpload(
      formWith({ file: new Uint8Array(0), purpose: "editor-image" }),
    );

    expect(result.status).toBe(400);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it("zwraca 415 dla typu spoza listy celu", async () => {
    const result = await createUpload(
      formWith(
        {
          file: new TextEncoder().encode("<html><script>1</script></html>"),
          purpose: "editor-image",
        },
        "x.html",
      ),
    );

    expect(result.status).toBe(415);
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  it("zwraca 413 dla pliku większego niż limit celu", async () => {
    const png = await makePng();
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    oversized.set(png);

    const result = await createUpload(
      formWith({ file: oversized, purpose: "editor-image" }),
    );

    expect(result.status).toBe(413);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it("zwraca 400 invalid_image dla uszkodzonego obrazu", async () => {
    const truncated = (await makePng(400, 400)).slice(0, 70);

    const result = await createUpload(
      formWith({ file: truncated, purpose: "editor-image" }),
    );

    expect(result).toEqual({ status: 400, body: { error: "invalid_image" } });
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });
});

describe("createUpload zapis", () => {
  it("zapisuje PNG jako editor-image: 201, url, rekord organizacji A i obiekt", async () => {
    const result = await createUpload(
      formWith({ file: await makePng(), purpose: "editor-image" }),
    );

    expect(result.status).toBe(201);
    if (result.status !== 201) {
      return;
    }
    const { id } = result.body;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.body.url).toBe(`/api/uploads/${id}`);
    expect(result.body.fileName).toBe("photo.png");
    expect(result.body.mimeType).toBe("image/jpeg");
    expect(mockPutObject).toHaveBeenCalledTimes(1);
    const [key, body, contentType] = mockPutObject.mock.calls[0]!;
    expect(key).toBe(`orgs/org-a/editor-image/${id}.jpg`);
    expect(contentType).toBe("image/jpeg");
    expect((body as Uint8Array).length).toBe(result.body.size);
    expect(mockUploadCreate).toHaveBeenCalledTimes(1);
    expect(mockUploadCreate.mock.calls[0]![0].data).toEqual({
      id,
      organizationId: "org-a",
      uploadedById: "user-1",
      purpose: "editor-image",
      key: `orgs/org-a/editor-image/${id}.jpg`,
      fileName: "photo.png",
      mimeType: "image/jpeg",
      size: result.body.size,
      visibility: "PUBLIC",
    });
  });

  it("zapisuje audyt upload.created dla organizacji i użytkownika", async () => {
    const result = await createUpload(
      formWith({ file: await makePng(), purpose: "editor-image" }),
    );

    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit.mock.calls[0]![0]).toMatchObject({
      action: "upload.created",
      organizationId: "org-a",
      actorUserId: "user-1",
      entityId: result.status === 201 ? result.body.id : "brak",
    });
  });

  it("pozwala wgrać plik zwykłemu członkowi", async () => {
    signIn({ memberRole: "member" });

    const result = await createUpload(
      formWith({ file: await makePng(), purpose: "editor-image" }),
    );

    expect(result.status).toBe(201);
  });

  it("ignoruje organizationId z formularza", async () => {
    const result = await createUpload(
      formWith({
        file: await makePng(),
        purpose: "editor-image",
        organizationId: "org-b",
      }),
    );

    expect(result.status).toBe(201);
    expect(mockUploadCreate.mock.calls[0]![0].data.organizationId).toBe(
      "org-a",
    );
    expect(mockPutObject.mock.calls[0]![0]).toMatch(/^orgs\/org-a\//);
  });

  it("ustawia widoczność ORGANIZATION i zachowuje png dla celu organizacyjnego bez resize", async () => {
    const result = await createUpload(
      formWith({ file: await makePng(), purpose: "private-scan" }),
    );

    expect(result.status).toBe(201);
    const data = mockUploadCreate.mock.calls[0]![0].data;
    expect(data.visibility).toBe("ORGANIZATION");
    expect(data.mimeType).toBe("image/png");
    expect(data.key).toMatch(/^orgs\/org-a\/private-scan\/[0-9a-f-]{36}\.png$/);
  });
});

describe("createUpload tryb serwisowy", () => {
  const asSuperadmin = () =>
    signIn({ userRole: "superadmin", memberRole: null });
  const confirmation = (organizationId: string) =>
    JSON.stringify({ serviceModeConfirmed: true, organizationId });

  it("zwraca 403 z komunikatem bez potwierdzenia i nic nie zapisuje", async () => {
    asSuperadmin();

    const result = await createUpload(
      formWith({ file: await makePng(), purpose: "editor-image" }),
    );

    expect(result).toEqual({
      status: 403,
      body: { error: "Potwierdź zmianę w trybie serwisowym" },
    });
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(mockUploadCreate).not.toHaveBeenCalled();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("zapisuje z potwierdzeniem aktywnej organizacji", async () => {
    asSuperadmin();

    const result = await createUpload(
      formWith({
        file: await makePng(),
        purpose: "editor-image",
        serviceModeConfirmation: confirmation("org-a"),
      }),
    );

    expect(result.status).toBe(201);
    expect(mockUploadCreate.mock.calls[0]![0].data.organizationId).toBe(
      "org-a",
    );
  });

  it("zwraca 403 przy potwierdzeniu innej organizacji", async () => {
    asSuperadmin();

    const result = await createUpload(
      formWith({
        file: await makePng(),
        purpose: "editor-image",
        serviceModeConfirmation: confirmation("org-b"),
      }),
    );

    expect(result.status).toBe(403);
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  it("zwraca 403, gdy członek podaje potwierdzenie nieaktualnej organizacji", async () => {
    const result = await createUpload(
      formWith({
        file: await makePng(),
        purpose: "editor-image",
        serviceModeConfirmation: confirmation("org-b"),
      }),
    );

    expect(result.status).toBe(403);
    expect(mockPutObject).not.toHaveBeenCalled();
  });
});

describe("createUpload awarie zależności", () => {
  it("usuwa obiekt z tym samym kluczem i zwraca 500, gdy zapis rekordu pada", async () => {
    mockUploadCreate.mockRejectedValue(new Error("db down"));

    const result = await createUpload(
      formWith({ file: await makePng(), purpose: "editor-image" }),
    );

    expect(result.status).toBe(500);
    expect(typeof (result.body as { error: string }).error).toBe("string");
    expect(mockPutObject).toHaveBeenCalledTimes(1);
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    expect(mockDeleteObject.mock.calls[0]![0]).toBe(
      mockPutObject.mock.calls[0]![0],
    );
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("zwraca 500 bez rekordu, gdy zapis obiektu pada", async () => {
    mockPutObject.mockRejectedValue(new Error("s3 down"));

    const result = await createUpload(
      formWith({ file: await makePng(), purpose: "editor-image" }),
    );

    expect(result.status).toBe(500);
    expect(mockUploadCreate).not.toHaveBeenCalled();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });
});
