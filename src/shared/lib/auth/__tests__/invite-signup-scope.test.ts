import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import {
  isInviteSignup,
  recordInviteSignupMember,
  withInviteSignup,
} from "../invite-signup-scope";

function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("isInviteSignup / withInviteSignup", () => {
  it("outside any scope → false", () => {
    expect(isInviteSignup()).toBe(false);
  });

  it("inside the scope before the first await → true", async () => {
    const { result } = await withInviteSignup(async () => isInviteSignup());

    expect(result).toBe(true);
  });

  it("inside the scope after an await → true", async () => {
    const { result } = await withInviteSignup(async () => {
      await Promise.resolve();
      return isInviteSignup();
    });

    expect(result).toBe(true);
  });

  it("inside the scope after awaiting a timer → true", async () => {
    const { result } = await withInviteSignup(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return isInviteSignup();
    });

    expect(result).toBe(true);
  });

  it("resolves the run result with memberId null when nothing was recorded, and isInviteSignup() is false afterwards", async () => {
    const outcome = await withInviteSignup(async () => "x");

    expect(outcome).toEqual({ result: "x", memberId: null });
    expect(isInviteSignup()).toBe(false);
  });

  it("a rejecting run → withInviteSignup rejects with the same error, then isInviteSignup() is false", async () => {
    const boom = new Error("boom");

    const reason = await withInviteSignup(async () => {
      recordInviteSignupMember("mem-lost");
      throw boom;
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(reason).toBe(boom);
    expect(isInviteSignup()).toBe(false);
  });

  it("code running in parallel outside the scope sees false while the scope is still open", async () => {
    const gate = deferred();
    const inside: boolean[] = [];

    const scoped = withInviteSignup(async () => {
      inside.push(isInviteSignup());
      await gate.promise;
      inside.push(isInviteSignup());
    });
    const outsideWhileScopeOpen = await Promise.resolve().then(() =>
      isInviteSignup(),
    );
    gate.release();
    await scoped;

    expect(outsideWhileScopeOpen).toBe(false);
    expect(inside).toEqual([true, true]);
    expect(isInviteSignup()).toBe(false);
  });

  it("two scopes at once: finishing the first does not close the second", async () => {
    const gate = deferred();

    const first = withInviteSignup(async () => "first");
    const second = withInviteSignup(async () => {
      await gate.promise;
      return isInviteSignup();
    });
    await first;
    gate.release();

    expect((await second).result).toBe(true);
    expect(isInviteSignup()).toBe(false);
  });

  it("nested scope: after it finishes the outer one is still → true", async () => {
    const { result } = await withInviteSignup(async () => {
      await withInviteSignup(async () => undefined);
      return isInviteSignup();
    });

    expect(result).toBe(true);
  });

  test.prop([fc.anything()])(
    "any value returned by run comes back unchanged as result with memberId null, and the scope does not leak",
    async (value) => {
      const outcome = await withInviteSignup(async () => value);

      expect(outcome.result).toBe(value);
      expect(outcome.memberId).toBeNull();
      expect(isInviteSignup()).toBe(false);
    },
  );
});

describe("recordInviteSignupMember", () => {
  it("a member recorded inside the scope comes back as the outcome's memberId next to the result", async () => {
    const outcome = await withInviteSignup(async () => {
      recordInviteSignupMember("mem-1");
      return "user-1";
    });

    expect(outcome).toEqual({ result: "user-1", memberId: "mem-1" });
  });

  it("a member recorded after an await inside the scope comes back as the outcome's memberId", async () => {
    const outcome = await withInviteSignup(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      recordInviteSignupMember("mem-late");
      return 7;
    });

    expect(outcome).toEqual({ result: 7, memberId: "mem-late" });
  });

  it("the memberId is the recorded member id, not the run result", async () => {
    const outcome = await withInviteSignup(async () => {
      recordInviteSignupMember("mem-2");
      return { user: { id: "user-2" } };
    });

    expect(outcome.memberId).toBe("mem-2");
    expect(outcome.result).toEqual({ user: { id: "user-2" } });
  });

  it("the last recorded value wins, including an explicit null", async () => {
    const replaced = await withInviteSignup(async () => {
      recordInviteSignupMember("mem-a");
      recordInviteSignupMember("mem-b");
    });
    const cleared = await withInviteSignup(async () => {
      recordInviteSignupMember("mem-a");
      recordInviteSignupMember(null);
    });

    expect(replaced.memberId).toBe("mem-b");
    expect(cleared.memberId).toBeNull();
  });

  it("outside a scope it does not throw and a later scope still starts with memberId null", async () => {
    expect(() => recordInviteSignupMember("m")).not.toThrow();

    const outcome = await withInviteSignup(async () => "after");

    expect(outcome).toEqual({ result: "after", memberId: null });
    expect(isInviteSignup()).toBe(false);
  });

  it("a member recorded inside a finished scope does not carry over to the next scope", async () => {
    await withInviteSignup(async () => {
      recordInviteSignupMember("mem-first");
    });

    const next = await withInviteSignup(async () => "second");

    expect(next).toEqual({ result: "second", memberId: null });
  });

  it("nested scopes: the inner record goes to the inner outcome, the outer outcome stays null", async () => {
    let innerMemberId: string | null | undefined;

    const outer = await withInviteSignup(async () => {
      const inner = await withInviteSignup(async () => {
        recordInviteSignupMember("inner");
        return "inner-result";
      });
      innerMemberId = inner.memberId;
      return inner.result;
    });

    expect(innerMemberId).toBe("inner");
    expect(outer).toEqual({ result: "inner-result", memberId: null });
  });

  it("nested scopes: the outer record stays with the outer outcome, the inner one keeps its own", async () => {
    let innerMemberId: string | null | undefined;

    const outer = await withInviteSignup(async () => {
      recordInviteSignupMember("outer");
      const inner = await withInviteSignup(async () => {
        recordInviteSignupMember("inner");
      });
      innerMemberId = inner.memberId;
    });

    expect(innerMemberId).toBe("inner");
    expect(outer.memberId).toBe("outer");
  });

  it("nested scopes: an inner scope without a record does not see the outer record", async () => {
    let innerMemberId: string | null | undefined;

    const outer = await withInviteSignup(async () => {
      recordInviteSignupMember("outer");
      const inner = await withInviteSignup(async () => undefined);
      innerMemberId = inner.memberId;
    });

    expect(innerMemberId).toBeNull();
    expect(outer.memberId).toBe("outer");
  });

  it("two parallel scopes each recording their own id get their own id back", async () => {
    const gateA = deferred();
    const gateB = deferred();

    const first = withInviteSignup(async () => {
      await gateA.promise;
      recordInviteSignupMember("mem-a");
      return "a";
    });
    const second = withInviteSignup(async () => {
      recordInviteSignupMember("mem-b");
      await gateB.promise;
      return "b";
    });
    gateA.release();
    const firstOutcome = await first;
    gateB.release();
    const secondOutcome = await second;

    expect(firstOutcome).toEqual({ result: "a", memberId: "mem-a" });
    expect(secondOutcome).toEqual({ result: "b", memberId: "mem-b" });
  });

  test.prop([fc.string({ minLength: 1 }), fc.string({ minLength: 1 })])(
    "two parallel scopes return exactly the id each of them recorded",
    async (firstId, secondId) => {
      const [first, second] = await Promise.all([
        withInviteSignup(async () => {
          await Promise.resolve();
          recordInviteSignupMember(firstId);
        }),
        withInviteSignup(async () => {
          recordInviteSignupMember(secondId);
          await Promise.resolve();
        }),
      ]);

      expect(first.memberId).toBe(firstId);
      expect(second.memberId).toBe(secondId);
    },
  );
});
