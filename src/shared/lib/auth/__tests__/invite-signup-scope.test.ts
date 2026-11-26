import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { isInviteSignup, withInviteSignup } from "../invite-signup-scope";

function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("isInviteSignup / withInviteSignup", () => {
  it("poza jakimkolwiek zakresem → false", () => {
    expect(isInviteSignup()).toBe(false);
  });

  it("w zakresie przed pierwszym await → true", async () => {
    const seen = await withInviteSignup(async () => isInviteSignup());

    expect(seen).toBe(true);
  });

  it("w zakresie po await → true", async () => {
    const seen = await withInviteSignup(async () => {
      await Promise.resolve();
      return isInviteSignup();
    });

    expect(seen).toBe(true);
  });

  it("w zakresie po await na timerze → true", async () => {
    const seen = await withInviteSignup(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return isInviteSignup();
    });

    expect(seen).toBe(true);
  });

  it("zwraca wynik run, a po rozstrzygnięciu isInviteSignup() → false", async () => {
    const result = await withInviteSignup(async () => "x");

    expect(result).toBe("x");
    expect(isInviteSignup()).toBe(false);
  });

  it("odrzucenie run → withInviteSignup odrzuca tym samym błędem, a potem isInviteSignup() → false", async () => {
    const boom = new Error("boom");

    const reason = await withInviteSignup(async () => {
      throw boom;
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(reason).toBe(boom);
    expect(isInviteSignup()).toBe(false);
  });

  it("kod uruchomiony równolegle poza zakresem widzi false, gdy zakres jeszcze trwa", async () => {
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

  it("dwa zakresy naraz: zakończenie pierwszego nie zamyka drugiego", async () => {
    const gate = deferred();

    const first = withInviteSignup(async () => "first");
    const second = withInviteSignup(async () => {
      await gate.promise;
      return isInviteSignup();
    });
    await first;
    gate.release();

    expect(await second).toBe(true);
    expect(isInviteSignup()).toBe(false);
  });

  it("zagnieżdżony zakres: po jego zakończeniu zewnętrzny wciąż → true", async () => {
    const seen = await withInviteSignup(async () => {
      await withInviteSignup(async () => undefined);
      return isInviteSignup();
    });

    expect(seen).toBe(true);
  });

  test.prop([fc.anything()])(
    "dowolna wartość zwrócona przez run wraca bez zmian, a zakres nie przecieka",
    async (value) => {
      const result = await withInviteSignup(async () => value);

      expect(result).toBe(value);
      expect(isInviteSignup()).toBe(false);
    },
  );
});
