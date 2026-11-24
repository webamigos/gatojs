import type { ModuleManifest } from "../manifest/schema.js";

export const SECRET_KINDS = ["secret-32", "secret-64", "hex-32"] as const;

export type SecretKind = (typeof SECRET_KINDS)[number];

export type GeneratedVariable = { name: string; kind: SecretKind };

const AUTH_SECRET: GeneratedVariable = {
  name: "BETTER_AUTH_SECRET",
  kind: "secret-32",
};

const BYTES: Record<SecretKind, number> = {
  "secret-32": 32,
  "secret-64": 64,
  "hex-32": 32,
};

export function generateSecret(
  kind: SecretKind,
  randomBytes: (size: number) => Uint8Array,
): string {
  const bytes = Buffer.from(randomBytes(BYTES[kind]));
  return bytes.toString(kind === "hex-32" ? "hex" : "base64url");
}

export function generatedVariables(
  manifests: ModuleManifest[],
): GeneratedVariable[] {
  const variables = [AUTH_SECRET];
  for (const manifest of manifests) {
    for (const variable of manifest.env) {
      if (
        variable.generate !== undefined &&
        !variables.some((known) => known.name === variable.name)
      ) {
        variables.push({ name: variable.name, kind: variable.generate });
      }
    }
  }
  return variables;
}

export function withGeneratedSecrets(
  envText: string,
  variables: GeneratedVariable[],
  randomBytes: (size: number) => Uint8Array,
): string {
  let text = envText;
  for (const { name, kind } of variables) {
    const line = new RegExp(`^${name}=.*$`, "m");
    text = text.replace(line, () => `${name}=${generateSecret(kind, randomBytes)}`);
  }
  return text;
}
