import { describe, expect, it, vi } from "vitest";
import { fc, test } from "@fast-check/vitest";

const { mockCurrentLocale } = vi.hoisted(() => ({
  mockCurrentLocale: vi.fn(),
}));

vi.mock("@/i18n/server-locale", () => ({
  currentLocale: () => mockCurrentLocale(),
}));

import { DomainError, handleCommandError } from "@/shared/utils/error-handling";
import type { OrgContext } from "../org-context";
import {
  assertServiceModeConfirmed,
  ServiceModeConfirmationError,
} from "../service-mode";

const memberContext: OrgContext = {
  userId: "user-1",
  organizationId: "org-1",
  orgRole: "admin",
  userRole: "admin",
  serviceMode: false,
};

const serviceContext: OrgContext = {
  userId: "super-1",
  organizationId: "org-1",
  orgRole: "owner",
  userRole: "superadmin",
  serviceMode: true,
};

describe("ServiceModeConfirmationError", () => {
  it("jest błędem domenowym", () => {
    const error = new ServiceModeConfirmationError();
    expect(error).toBeInstanceOf(DomainError);
  });

  it("w en handleCommandError zwraca komunikat po angielsku", async () => {
    mockCurrentLocale.mockResolvedValue("en");

    const result = await handleCommandError(
      new ServiceModeConfirmationError(),
      "fallback",
    );

    expect(result).toEqual({
      success: false,
      error: "Confirm the change in service mode",
    });
  });

  it("w pl handleCommandError zwraca komunikat po polsku", async () => {
    mockCurrentLocale.mockResolvedValue("pl");

    const result = await handleCommandError(
      new ServiceModeConfirmationError(),
      "fallback",
    );

    expect(result).toEqual({
      success: false,
      error: "Potwierdź zmianę w trybie serwisowym",
    });
  });

  it("ma nazwę ServiceModeConfirmationError i jest błędem domenowym", () => {
    const error = new ServiceModeConfirmationError();
    expect(error.name).toBe("ServiceModeConfirmationError");
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("assertServiceModeConfirmed", () => {
  it("poza trybem serwisowym przepuszcza brak potwierdzenia", () => {
    expect(() =>
      assertServiceModeConfirmed(memberContext, undefined),
    ).not.toThrow();
  });

  it("poza trybem serwisowym przepuszcza potwierdzenie aktywnej organizacji", () => {
    expect(() =>
      assertServiceModeConfirmed(memberContext, {
        serviceModeConfirmed: true,
        organizationId: "org-1",
      }),
    ).not.toThrow();
  });

  it("poza trybem serwisowym odrzuca potwierdzenie innej organizacji", () => {
    expect(() =>
      assertServiceModeConfirmed(memberContext, {
        serviceModeConfirmed: true,
        organizationId: "org-2",
      }),
    ).toThrow(ServiceModeConfirmationError);
  });

  it("poza trybem serwisowym odrzuca potwierdzenie z id użytkownika zamiast organizacji", () => {
    expect(() =>
      assertServiceModeConfirmed(memberContext, {
        serviceModeConfirmed: true,
        organizationId: "user-1",
      }),
    ).toThrow(ServiceModeConfirmationError);
  });

  it("poza trybem serwisowym porównuje z organizacją z kontekstu, a nie ze stałą", () => {
    const otherOrgContext: OrgContext = {
      ...memberContext,
      organizationId: "org-2",
    };
    expect(() =>
      assertServiceModeConfirmed(otherOrgContext, {
        serviceModeConfirmed: true,
        organizationId: "org-2",
      }),
    ).not.toThrow();
    expect(() =>
      assertServiceModeConfirmed(otherOrgContext, {
        serviceModeConfirmed: true,
        organizationId: "org-1",
      }),
    ).toThrow(ServiceModeConfirmationError);
  });

  it("w trybie serwisowym przepuszcza potwierdzenie aktywnej organizacji", () => {
    expect(() =>
      assertServiceModeConfirmed(serviceContext, {
        serviceModeConfirmed: true,
        organizationId: "org-1",
      }),
    ).not.toThrow();
  });

  it.each([
    ["brak potwierdzenia", undefined],
    ["null", null],
    ["napis yes", "yes"],
    ["true", true],
    ["pusty obiekt", {}],
    [
      "serviceModeConfirmed: false",
      { serviceModeConfirmed: false, organizationId: "org-1" },
    ],
    [
      "serviceModeConfirmed jako napis",
      { serviceModeConfirmed: "true", organizationId: "org-1" },
    ],
    [
      "serviceModeConfirmed jako 1",
      { serviceModeConfirmed: 1, organizationId: "org-1" },
    ],
    ["brak organizationId", { serviceModeConfirmed: true }],
    [
      "inna organizacja",
      { serviceModeConfirmed: true, organizationId: "org-2" },
    ],
    [
      "id użytkownika zamiast organizacji",
      { serviceModeConfirmed: true, organizationId: "super-1" },
    ],
    [
      "organizationId z innym zapisem",
      { serviceModeConfirmed: true, organizationId: "ORG-1" },
    ],
    [
      "organizationId z przedrostkiem",
      { serviceModeConfirmed: true, organizationId: "org-10" },
    ],
    [
      "pusty organizationId",
      { serviceModeConfirmed: true, organizationId: "" },
    ],
  ])("w trybie serwisowym odrzuca: %s", (_label, confirmation) => {
    expect(() =>
      assertServiceModeConfirmed(serviceContext, confirmation),
    ).toThrow(ServiceModeConfirmationError);
  });

  it("w trybie serwisowym rzuca komunikat „Potwierdź zmianę w trybie serwisowym”", () => {
    expect(() => assertServiceModeConfirmed(serviceContext, undefined)).toThrow(
      "Potwierdź zmianę w trybie serwisowym",
    );
  });

  it("porównuje z organizacją z kontekstu, a nie ze stałą", () => {
    const otherOrgContext: OrgContext = {
      ...serviceContext,
      organizationId: "org-2",
    };
    expect(() =>
      assertServiceModeConfirmed(otherOrgContext, {
        serviceModeConfirmed: true,
        organizationId: "org-2",
      }),
    ).not.toThrow();
    expect(() =>
      assertServiceModeConfirmed(otherOrgContext, {
        serviceModeConfirmed: true,
        organizationId: "org-1",
      }),
    ).toThrow(ServiceModeConfirmationError);
  });

  test.prop([fc.string()])(
    "poza trybem serwisowym brak potwierdzenia nigdy nie rzuca",
    (organizationId) => {
      expect(() =>
        assertServiceModeConfirmed(
          { ...memberContext, organizationId },
          undefined,
        ),
      ).not.toThrow();
    },
  );

  test.prop([fc.string({ minLength: 1 })])(
    "poza trybem serwisowym przepuszcza potwierdzenie dowolnej aktywnej organizacji",
    (organizationId) => {
      expect(() =>
        assertServiceModeConfirmed(
          { ...memberContext, organizationId },
          { serviceModeConfirmed: true, organizationId },
        ),
      ).not.toThrow();
    },
  );

  test.prop([fc.boolean(), fc.string(), fc.string()])(
    "w trybie serwisowym i poza nim rzuca dla każdej organizacji innej niż aktywna",
    (serviceMode, activeOrganizationId, confirmedOrganizationId) => {
      fc.pre(activeOrganizationId !== confirmedOrganizationId);
      expect(() =>
        assertServiceModeConfirmed(
          {
            ...serviceContext,
            serviceMode,
            organizationId: activeOrganizationId,
          },
          {
            serviceModeConfirmed: true,
            organizationId: confirmedOrganizationId,
          },
        ),
      ).toThrow(ServiceModeConfirmationError);
    },
  );

  test.prop([fc.string({ minLength: 1 })])(
    "w trybie serwisowym przepuszcza potwierdzenie dowolnej aktywnej organizacji",
    (organizationId) => {
      expect(() =>
        assertServiceModeConfirmed(
          { ...serviceContext, organizationId },
          { serviceModeConfirmed: true, organizationId },
        ),
      ).not.toThrow();
    },
  );

  test.prop([fc.anything()])(
    "w trybie serwisowym odrzuca dowolną wartość, która nie jest potwierdzeniem",
    (confirmation) => {
      expect(() =>
        assertServiceModeConfirmed(serviceContext, confirmation),
      ).toThrow(ServiceModeConfirmationError);
    },
  );
});
