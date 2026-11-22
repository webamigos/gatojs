import { dirname, join } from "node:path";

function gatoEntryOf(packageJson: unknown): unknown {
  if (typeof packageJson !== "object" || packageJson === null) {
    return undefined;
  }
  const bin = (packageJson as { bin?: unknown }).bin;
  if (typeof bin !== "object" || bin === null) {
    return undefined;
  }
  return (bin as { gato?: unknown }).gato;
}

export function gatoBinPath(
  packageJsonPath: string,
  packageJson: unknown,
): string {
  const entry = gatoEntryOf(packageJson);
  if (typeof entry !== "string") {
    throw new Error(
      `gato-cli at ${packageJsonPath} has no "gato" bin; reinstall create-gato-app`,
    );
  }
  return join(dirname(packageJsonPath), entry);
}
