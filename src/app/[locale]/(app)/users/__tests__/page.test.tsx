import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const {
  mockRequireModuleAccess,
  mockGetUserAccountsQuery,
  mockGetOrganizationMembersQuery,
  usersManagerProps,
  organizationMembersProps,
  mockEnv,
} = vi.hoisted(() => ({
  mockRequireModuleAccess: vi.fn(),
  mockGetUserAccountsQuery: vi.fn(),
  mockGetOrganizationMembersQuery: vi.fn(),
  usersManagerProps: vi.fn(),
  organizationMembersProps: vi.fn(),
  mockEnv: { ADMIN_IMPERSONATION: false },
}));

vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/shared/lib/auth/require-module-access", () => ({
  requireModuleAccess: mockRequireModuleAccess,
}));
vi.mock("@/features/users/services/queries/user-account-queries", () => ({
  getUserAccountsQuery: mockGetUserAccountsQuery,
}));
vi.mock(
  "@/features/organizations/services/queries/organization-queries",
  () => ({ getOrganizationMembersQuery: mockGetOrganizationMembersQuery }),
);
vi.mock("@/features/users/components/users-manager", () => ({
  UsersManager: (props: unknown) => {
    usersManagerProps(props);
    return <div>users-manager</div>;
  },
}));
vi.mock("@/features/organizations/components/organization-members", () => ({
  OrganizationMembers: (props: unknown) => {
    organizationMembersProps(props);
    return <div>organization-members</div>;
  },
}));

import UsersPage from "../page";

const params = Promise.resolve({ locale: "pl" });
const ACCOUNTS = [{ id: "u2", email: "u2@firma.pl" }];
const MEMBERS_DATA = {
  organizationName: "Org",
  currentUserId: "u1",
  currentRole: "owner",
  members: [],
  invitations: [],
};

function contextFor(userRole: string, orgRole: string | null = "member") {
  return {
    userId: "u1",
    organizationId: "org-1",
    orgRole,
    userRole,
  };
}

describe("/users", () => {
  beforeEach(() => {
    mockEnv.ADMIN_IMPERSONATION = false;
    mockGetUserAccountsQuery.mockResolvedValue(ACCOUNTS);
    mockGetOrganizationMembersQuery.mockResolvedValue(MEMBERS_DATA);
  });

  it("strona jest chroniona dostępem do modułu users", async () => {
    mockRequireModuleAccess.mockResolvedValue(contextFor("admin"));

    render(await UsersPage({ params }));

    expect(mockRequireModuleAccess).toHaveBeenCalledWith("users");
  });

  it.each([["superadmin"], ["admin"]])(
    "%s → UsersManager z listą wszystkich kont",
    async (userRole) => {
      mockRequireModuleAccess.mockResolvedValue(contextFor(userRole));

      render(await UsersPage({ params }));

      expect(screen.getByText("users-manager")).toBeInTheDocument();
      expect(
        screen.queryByText("organization-members"),
      ).not.toBeInTheDocument();
      expect(usersManagerProps).toHaveBeenCalledWith(
        expect.objectContaining({ users: ACCOUNTS, currentUserId: "u1" }),
      );
      expect(mockGetOrganizationMembersQuery).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["superadmin", false],
    ["superadmin", true],
    ["admin", false],
    ["admin", true],
  ] as const)(
    "%s przy ADMIN_IMPERSONATION=%s → UsersManager dostaje rolę bieżącego użytkownika i flagę impersonacji",
    async (userRole, adminImpersonation) => {
      mockEnv.ADMIN_IMPERSONATION = adminImpersonation;
      mockRequireModuleAccess.mockResolvedValue(contextFor(userRole));

      render(await UsersPage({ params }));

      expect(usersManagerProps).toHaveBeenCalledWith(
        expect.objectContaining({
          currentUserId: "u1",
          currentUserRole: userRole,
          adminImpersonation,
        }),
      );
    },
  );

  it.each([["owner"], ["admin"]])(
    "owner/admin organizacji (%s) bez roli globalnej → członkowie organizacji, bez listy kont",
    async (orgRole) => {
      mockRequireModuleAccess.mockResolvedValue(contextFor("user", orgRole));

      render(await UsersPage({ params }));

      expect(screen.getByText("organization-members")).toBeInTheDocument();
      expect(screen.queryByText("users-manager")).not.toBeInTheDocument();
      expect(mockGetUserAccountsQuery).not.toHaveBeenCalled();
    },
  );
});
