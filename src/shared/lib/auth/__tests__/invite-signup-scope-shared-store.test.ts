// @vitest-environment node
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const INVITE_SIGNUP_STORE_KEY = Symbol.for("gatojs.auth.invite-signup");

async function loadModuleCopy() {
  vi.resetModules();
  const scope = await import("../invite-signup-scope");
  return {
    withInviteSignup: scope.withInviteSignup,
    isInviteSignup: scope.isInviteSignup,
    recordInviteSignupMember: scope.recordInviteSignupMember,
  };
}

type ModuleCopy = Awaited<ReturnType<typeof loadModuleCopy>>;

function clearSharedInviteSignupStore() {
  Reflect.deleteProperty(globalThis, INVITE_SIGNUP_STORE_KEY);
}

function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

let copyA: ModuleCopy;
let copyB: ModuleCopy;

beforeEach(async () => {
  clearSharedInviteSignupStore();
  copyA = await loadModuleCopy();
  copyB = await loadModuleCopy();
});

afterEach(() => {
  clearSharedInviteSignupStore();
  vi.resetModules();
});

describe("withInviteSignup with several module copies in one process", () => {
  it("the copies are separate module instances", () => {
    expect(copyA.withInviteSignup).not.toBe(copyB.withInviteSignup);
    expect(copyA.isInviteSignup).not.toBe(copyB.isInviteSignup);
    expect(copyA.recordInviteSignupMember).not.toBe(
      copyB.recordInviteSignupMember,
    );
  });

  it("registers the store under the gatojs.auth.invite-signup global key", async () => {
    await copyA.withInviteSignup(async () => undefined);
    await copyB.withInviteSignup(async () => undefined);

    expect(Reflect.get(globalThis, INVITE_SIGNUP_STORE_KEY)).toBeInstanceOf(
      AsyncLocalStorage,
    );
  });

  it("copy B's isInviteSignup() is true inside a scope opened by copy A", async () => {
    const outcome = await copyA.withInviteSignup(async () =>
      copyB.isInviteSignup(),
    );

    expect(outcome.result).toBe(true);
  });

  it("copy A's isInviteSignup() is true inside a scope opened by copy B, also after an await", async () => {
    const outcome = await copyB.withInviteSignup(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return copyA.isInviteSignup();
    });

    expect(outcome.result).toBe(true);
  });

  it("copy B's isInviteSignup() is false outside any scope", () => {
    expect(copyA.isInviteSignup()).toBe(false);
    expect(copyB.isInviteSignup()).toBe(false);
  });

  it("after copy A's scope resolves, copy B's isInviteSignup() is false again", async () => {
    await expect(copyA.withInviteSignup(async () => "done")).resolves.toEqual({
      result: "done",
      memberId: null,
    });

    expect(copyB.isInviteSignup()).toBe(false);
  });

  it("after copy A's scope rejects, copy B's isInviteSignup() is false again", async () => {
    await expect(
      copyA.withInviteSignup(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(copyB.isInviteSignup()).toBe(false);
  });

  it("copy A's scope does not leak into a parallel chain checked by copy B", async () => {
    const gate = deferred();

    const scoped = copyA.withInviteSignup(async () => {
      await gate.promise;
      return copyB.isInviteSignup();
    });
    const outside = await Promise.resolve().then(() => copyB.isInviteSignup());
    gate.release();

    expect(outside).toBe(false);
    expect((await scoped).result).toBe(true);
  });

  it("copy B's recordInviteSignupMember inside copy A's scope comes back as copy A's memberId", async () => {
    const outcome = await copyA.withInviteSignup(async () => {
      copyB.recordInviteSignupMember("mem-1");
      return "user-1";
    });

    expect(outcome).toEqual({ result: "user-1", memberId: "mem-1" });
  });

  it("copy A's recordInviteSignupMember inside a copy B scope nested in a copy A scope goes to the inner outcome only", async () => {
    let innerMemberId: string | null | undefined;

    const outer = await copyA.withInviteSignup(async () => {
      const inner = await copyB.withInviteSignup(async () => {
        copyA.recordInviteSignupMember("inner");
      });
      innerMemberId = inner.memberId;
    });

    expect(innerMemberId).toBe("inner");
    expect(outer.memberId).toBeNull();
  });

  it("copy B's recordInviteSignupMember outside any scope does not throw and copy A's next scope starts with memberId null", async () => {
    expect(() => copyB.recordInviteSignupMember("stray")).not.toThrow();

    await expect(copyA.withInviteSignup(async () => "x")).resolves.toEqual({
      result: "x",
      memberId: null,
    });
  });

  it("a copy uses the store already registered under the gatojs.auth.invite-signup global key", async () => {
    clearSharedInviteSignupStore();
    const injected = new AsyncLocalStorage<{ memberId: string | null }>();
    Reflect.set(globalThis, Symbol.for("gatojs.auth.invite-signup"), injected);
    const copy = await loadModuleCopy();
    const record = { memberId: null as string | null };

    const inside = injected.run(record, () => {
      copy.recordInviteSignupMember("mem-injected");
      return copy.isInviteSignup();
    });

    expect(inside).toBe(true);
    expect(record.memberId).toBe("mem-injected");
    expect(copy.isInviteSignup()).toBe(false);
    expect(Reflect.get(globalThis, INVITE_SIGNUP_STORE_KEY)).toBe(injected);
    const outcome = await copy.withInviteSignup(async () =>
      injected.getStore(),
    );
    expect(outcome.result).toEqual({ memberId: null });
  });
});
