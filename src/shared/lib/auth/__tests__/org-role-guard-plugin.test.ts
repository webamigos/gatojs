import { fc, test } from "@fast-check/vitest";
import { APIError } from "better-auth/api";
import { describe, expect, it, vi } from "vitest";
import { orgRoleGuardPlugin } from "../org-role-guard-plugin";

type HookContext = Record<string, unknown>;

interface Hook {
  matcher: (context: { path?: string }) => boolean;
  handler: (ctx: HookContext) => Promise<unknown>;
}

const INVITE = "/organization/invite-member";
const UPDATE_ROLE = "/organization/update-member-role";

function hooksOf(kind: "before" | "after"): Hook[] {
  const hooks = orgRoleGuardPlugin.hooks as unknown as Partial<
    Record<"before" | "after", Hook[]>
  >;
  return hooks[kind] ?? [];
}

function matching(kind: "before" | "after", path: string | undefined): Hook[] {
  return hooksOf(kind).filter((hook) => hook.matcher({ path }));
}

async function runGuard(path: string, body: unknown): Promise<unknown[]> {
  const hooks = matching("before", path);
  expect(hooks).toHaveLength(1);
  const findOne = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const results: unknown[] = [];
  for (const hook of hooks) {
    results.push(
      await hook.handler({
        path,
        body,
        headers: new Headers(),
        context: { adapter: { findOne, create, update } },
      }),
    );
  }
  return results;
}

async function rejection(path: string, body: unknown): Promise<unknown> {
  try {
    await runGuard(path, body);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("orgRoleGuardPlugin: identity and matchers", () => {
  it("has the id gato-org-role-guard", () => {
    expect(orgRoleGuardPlugin.id).toBe("gato-org-role-guard");
  });

  it.each([INVITE, UPDATE_ROLE])(
    "has exactly one before hook for %s",
    (path) => {
      expect(matching("before", path)).toHaveLength(1);
    },
  );

  it.each([
    "/organization/create",
    "/organization/remove-member",
    "/organization/leave",
    "/organization/accept-invitation",
    "/organization/add-member",
    "/organization/cancel-invitation",
    "/organization/update",
    "/organization/invite-member/",
    "/organization/update-member-role/x",
    "/admin/set-role",
    "/sign-up/email",
    "",
    undefined,
  ])("has no before hook for %j", (path) => {
    expect(matching("before", path)).toHaveLength(0);
  });

  it("has no after hooks", () => {
    expect(hooksOf("after")).toHaveLength(0);
  });

  test.prop([
    fc.string().filter((path) => path !== INVITE && path !== UPDATE_ROLE),
  ])("no other path matches a before hook", (path) => {
    expect(matching("before", path)).toHaveLength(0);
  });
});

describe("orgRoleGuardPlugin: a single organization role passes", () => {
  it.each([
    [INVITE, "owner"],
    [INVITE, "admin"],
    [INVITE, "member"],
    [UPDATE_ROLE, "owner"],
    [UPDATE_ROLE, "admin"],
    [UPDATE_ROLE, "member"],
  ])("%s with role %j resolves without throwing", async (path, role) => {
    await expect(
      runGuard(path, { email: "nowy@a.example", memberId: "mem-1", role }),
    ).resolves.toHaveLength(1);
  });
});

describe("orgRoleGuardPlugin: any other role is rejected with 400", () => {
  it.each([
    ["the list admin+member", { role: ["admin", "member"] }],
    ["the one-element list member", { role: ["member"] }],
    ["the one-element list admin", { role: ["admin"] }],
    ["an empty list", { role: [] }],
    ["the comma string member,member", { role: "member,member" }],
    ["the comma string admin,member", { role: "admin,member" }],
    ["superadmin", { role: "superadmin" }],
    ["user", { role: "user" }],
    ["Admin", { role: "Admin" }],
    ["admin with a trailing space", { role: "admin " }],
    ["an empty string", { role: "" }],
    ["a number", { role: 1 }],
    ["a null role", { role: null }],
    ["a missing role", { email: "nowy@a.example" }],
    ["a null body", null],
    ["no body", undefined],
  ])("%s", async (_label, body) => {
    for (const path of [INVITE, UPDATE_ROLE]) {
      const error = await rejection(path, body);

      expect(error).toBeInstanceOf(APIError);
      expect(error).toMatchObject({
        status: "BAD_REQUEST",
        statusCode: 400,
        message: "Invalid organization role",
      });
    }
  });

  it("does not touch the database before rejecting", async () => {
    const findOne = vi.fn();
    const create = vi.fn();
    const update = vi.fn();
    const [hook] = matching("before", INVITE);

    await expect(
      hook.handler({
        path: INVITE,
        body: { email: "nowy@a.example", role: ["admin", "member"] },
        headers: new Headers(),
        context: { adapter: { findOne, create, update } },
      }),
    ).rejects.toBeInstanceOf(APIError);

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test.prop([
    fc.oneof(
      fc
        .string()
        .filter((role) => !["owner", "admin", "member"].includes(role)),
      fc.array(fc.constantFrom("owner", "admin", "member"), { minLength: 1 }),
    ),
    fc.constantFrom(INVITE, UPDATE_ROLE),
  ])(
    "rejects every role that is not one of the three strings",
    async (role, path) => {
      const error = await rejection(path, { role });

      expect(error).toBeInstanceOf(APIError);
      expect(error).toMatchObject({ statusCode: 400 });
    },
  );
});
