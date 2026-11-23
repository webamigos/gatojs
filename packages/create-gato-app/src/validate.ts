export const TITLE_MAX_LENGTH = 60;
export const EMAIL_MAX_LENGTH = 254;

const TITLE_FORBIDDEN_CHARACTERS = new Set(['"', "\\", "<", ">", "$", "`"]);
const FIRST_PRINTABLE = 0x20;
const DELETE = 0x7f;

function hasForbiddenCharacter(title: string): boolean {
  return Array.from(title).some((character) => {
    const code = character.charCodeAt(0);
    return (
      code < FIRST_PRINTABLE ||
      code === DELETE ||
      TITLE_FORBIDDEN_CHARACTERS.has(character)
    );
  });
}
const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const ENV_VALUE_FORBIDDEN = /[\s"'\\#$`]/;

export function titleError(title: string): string | null {
  const trimmed = title.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > TITLE_MAX_LENGTH ||
    hasForbiddenCharacter(title)
  ) {
    return `Title: use 1-${TITLE_MAX_LENGTH} characters without quotes, backslashes, <, >, $, backticks or control characters`;
  }
  return null;
}

export function adminEmailError(email: string): string | null {
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return "Admin email: expected an address like admin@example.com";
  }
  return null;
}

export function envValueError(label: string, value: string): string | null {
  if (value === "") {
    return `${label}: required`;
  }
  if (ENV_VALUE_FORBIDDEN.test(value)) {
    return `${label}: no spaces, quotes, backslashes, #, $ or backticks`;
  }
  return null;
}
