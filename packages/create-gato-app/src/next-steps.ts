import { isAbsolute, relative } from "node:path";

export type Outcome = {
  dir: string;
  git: boolean;
  installed: boolean;
  committed: boolean;
  dockerUp: boolean;
  profiles: string[];
  migrated: boolean;
  adminCreated: boolean;
  adminEmail: string | null;
};

const SAFE_WORD = /^[A-Za-z0-9_./@%+=:,-]+$/;
const ADMIN_EMAIL_PLACEHOLDER = "<your-email>";
export const MANUAL_COMMIT =
  'git add -A && git commit -m "chore: initial commit"';

export function shellQuote(value: string): string {
  if (SAFE_WORD.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function displayDir(cwd: string, projectDir: string): string {
  const path = relative(cwd, projectDir);
  if (path === "") {
    return ".";
  }
  return path.startsWith("..") || isAbsolute(path) ? projectDir : path;
}

function composeUp(profiles: string[]): string {
  const flags = profiles
    .map((profile) => `--profile ${shellQuote(profile)} `)
    .join("");
  return `docker compose ${flags}up -d`;
}

export function nextSteps(outcome: Outcome): string[] {
  const steps: string[] = [];
  if (outcome.dir !== ".") {
    steps.push(`cd ${shellQuote(outcome.dir)}`);
  }
  if (!outcome.installed) {
    steps.push("npm install");
  }
  if (!outcome.dockerUp) {
    steps.push(composeUp(outcome.profiles));
  }
  if (!outcome.migrated) {
    steps.push("npx prisma migrate dev --name init");
  }
  if (outcome.git && !outcome.committed) {
    steps.push(MANUAL_COMMIT);
  }
  if (!outcome.adminCreated) {
    const email =
      outcome.adminEmail === null
        ? ADMIN_EMAIL_PLACEHOLDER
        : shellQuote(outcome.adminEmail);
    steps.push(`npm run admin:create -- --email ${email}`);
  }
  steps.push("npm run dev");
  return steps;
}
