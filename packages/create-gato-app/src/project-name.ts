import { basename, resolve } from "node:path";

const PROJECT_NAME_PATTERN = /^[a-z][a-z0-9-]{1,49}$/;

export function assertProjectName(cwd: string, target: string): void {
  const name = basename(resolve(cwd, target));
  if (!PROJECT_NAME_PATTERN.test(name)) {
    throw new Error(
      `Project name "${name}": use lowercase letters, digits and hyphens, start with a letter, 2-50 characters`,
    );
  }
}
