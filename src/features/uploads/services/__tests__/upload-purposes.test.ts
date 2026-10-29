import { test } from "@fast-check/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fc from "fast-check";

const { mockModules } = vi.hoisted(() => ({
  mockModules: [] as unknown[],
}));

vi.mock("@/modules.generated", () => ({ modules: mockModules }));

import {
  FORBIDDEN_MIME_TYPES,
  listUploadPurposes,
  maxUploadBytes,
  objectKey,
  resolveUploadPurpose,
} from "../upload-purposes";

const editorImage = {
  key: "editor-image",
  mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 5 * 1024 * 1024,
  visibility: "public",
  resizeImage: { maxWidth: 1200 },
};

function setModules(...purposes: unknown[][]) {
  mockModules.length = 0;
  purposes.forEach((uploadPurposes, index) => {
    mockModules.push({
      key: `m${index}`,
      nav: [],
      routePrefixes: [],
      uploadPurposes,
    });
  });
  mockModules.push({ key: "bez-celow", nav: [], routePrefixes: [] });
}

describe("FORBIDDEN_MIME_TYPES", () => {
  it.each([
    "image/svg+xml",
    "text/html",
    "application/xhtml+xml",
    "application/xml",
    "text/xml",
  ])("zawiera %s", (type) => {
    expect(FORBIDDEN_MIME_TYPES).toContain(type);
  });
});

describe("listUploadPurposes", () => {
  beforeEach(() => setModules([editorImage]));

  it("zwraca cele ze wszystkich modułów", () => {
    setModules(
      [editorImage],
      [
        {
          key: "avatar",
          mimeTypes: ["image/png"],
          maxBytes: 10,
          visibility: "organization",
        },
      ],
    );
    expect(listUploadPurposes().map((p) => p.key)).toEqual([
      "editor-image",
      "avatar",
    ]);
  });

  it.each([
    "image/svg+xml",
    "text/html",
    "application/xhtml+xml",
    "application/xml",
    "text/xml",
  ])("rzuca z nazwą celu, gdy cel deklaruje %s", (type) => {
    setModules([
      {
        key: "zly-cel",
        mimeTypes: ["image/png", type],
        maxBytes: 10,
        visibility: "public",
      },
    ]);
    expect(() => listUploadPurposes()).toThrow(/zly-cel/);
  });

  it("rzuca z nazwą celu, gdy dwa moduły deklarują ten sam klucz", () => {
    setModules(
      [editorImage],
      [
        {
          key: "editor-image",
          mimeTypes: ["image/png"],
          maxBytes: 10,
          visibility: "public",
        },
      ],
    );
    expect(() => listUploadPurposes()).toThrow(/editor-image/);
  });
});

describe("resolveUploadPurpose", () => {
  beforeEach(() => setModules([editorImage]));

  it("zwraca definicję znanego celu", () => {
    expect(resolveUploadPurpose("editor-image")).toEqual(editorImage);
  });

  it("zwraca null dla nieznanego celu", () => {
    expect(resolveUploadPurpose("x")).toBeNull();
  });
});

describe("maxUploadBytes", () => {
  it("dla samego editor-image to 5242880", () => {
    setModules([editorImage]);
    expect(maxUploadBytes()).toBe(5242880);
  });

  it("zwraca największy limit, gdy największy jest w środku", () => {
    setModules(
      [
        {
          key: "a",
          mimeTypes: ["image/png"],
          maxBytes: 100,
          visibility: "public",
        },
      ],
      [
        {
          key: "b",
          mimeTypes: ["image/png"],
          maxBytes: 9000,
          visibility: "public",
        },
        {
          key: "c",
          mimeTypes: ["image/png"],
          maxBytes: 50,
          visibility: "public",
        },
      ],
    );
    expect(maxUploadBytes()).toBe(9000);
  });

  it("zwraca największy limit, gdy największy jest pierwszy", () => {
    setModules(
      [
        {
          key: "a",
          mimeTypes: ["image/png"],
          maxBytes: 9000,
          visibility: "public",
        },
      ],
      [
        {
          key: "b",
          mimeTypes: ["image/png"],
          maxBytes: 100,
          visibility: "public",
        },
      ],
    );
    expect(maxUploadBytes()).toBe(9000);
  });
});

describe("objectKey", () => {
  it("składa klucz orgs/<org>/<cel>/<id>.<rozszerzenie>", () => {
    expect(
      objectKey({
        organizationId: "o1",
        purpose: "editor-image",
        id: "u1",
        extension: "jpg",
      }),
    ).toBe("orgs/o1/editor-image/u1.jpg");
  });

  test.prop([fc.uuid(), fc.uuid(), fc.constantFrom("jpg", "png", "webp")])(
    "zaczyna się od orgs/<organizationId>/ i nie zawiera ..",
    (organizationId, id, extension) => {
      const key = objectKey({
        organizationId,
        purpose: "editor-image",
        id,
        extension,
      });
      expect(key.startsWith(`orgs/${organizationId}/`)).toBe(true);
      expect(key).not.toContain("..");
    },
  );
});
