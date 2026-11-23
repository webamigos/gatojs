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

export function shellQuote(value: string): string {
  throw new Error(`not implemented: ${value}`);
}

export function displayDir(cwd: string, projectDir: string): string {
  throw new Error(`not implemented: ${cwd} ${projectDir}`);
}

export function nextSteps(outcome: Outcome): string[] {
  throw new Error(`not implemented: ${outcome.dir}`);
}
