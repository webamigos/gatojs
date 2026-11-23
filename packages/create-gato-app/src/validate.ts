export const TITLE_MAX_LENGTH = 60;
export const EMAIL_MAX_LENGTH = 254;

export function titleError(title: string): string | null {
  throw new Error(`not implemented: ${title}`);
}

export function adminEmailError(email: string): string | null {
  throw new Error(`not implemented: ${email}`);
}

export function envValueError(label: string, value: string): string | null {
  throw new Error(`not implemented: ${label} ${value}`);
}
