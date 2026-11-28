import { AsyncLocalStorage } from "node:async_hooks";

const inviteSignupStorage = new AsyncLocalStorage<true>();

export function withInviteSignup<T>(run: () => Promise<T>): Promise<T> {
  return inviteSignupStorage.run(true, run);
}

export function isInviteSignup(): boolean {
  return inviteSignupStorage.getStore() === true;
}
