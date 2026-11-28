import { AsyncLocalStorage } from "node:async_hooks";

interface InviteSignupRecord {
  memberId: string | null;
}

export interface InviteSignupOutcome<T> {
  result: T;
  memberId: string | null;
}

const INVITE_SIGNUP_STORE_KEY = Symbol.for("gatojs.auth.invite-signup");

type GlobalWithInviteSignupStore = typeof globalThis & {
  [key: symbol]: unknown;
};

// WHY: the production server bundles this module into several chunks (users command and auth hook),
// so every copy must share one store or the hook would not see the scope opened by the command.
function sharedInviteSignupStorage(): AsyncLocalStorage<InviteSignupRecord> {
  const globalStore = globalThis as GlobalWithInviteSignupStore;
  const existing = globalStore[INVITE_SIGNUP_STORE_KEY];
  if (existing instanceof AsyncLocalStorage) {
    return existing as AsyncLocalStorage<InviteSignupRecord>;
  }
  const created = new AsyncLocalStorage<InviteSignupRecord>();
  globalStore[INVITE_SIGNUP_STORE_KEY] = created;
  return created;
}

const inviteSignupStorage = sharedInviteSignupStorage();

export async function withInviteSignup<T>(
  run: () => Promise<T>,
): Promise<InviteSignupOutcome<T>> {
  const record: InviteSignupRecord = { memberId: null };
  const result = await inviteSignupStorage.run(record, run);
  return { result, memberId: record.memberId };
}

export function isInviteSignup(): boolean {
  return inviteSignupStorage.getStore() !== undefined;
}

export function recordInviteSignupMember(memberId: string | null): void {
  const record = inviteSignupStorage.getStore();
  if (record) {
    record.memberId = memberId;
  }
}
