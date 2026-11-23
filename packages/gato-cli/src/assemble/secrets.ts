import type { ModuleManifest } from "../manifest/schema.js";

export const SECRET_KINDS = ["secret-32", "secret-64", "hex-32"] as const;

export type SecretKind = (typeof SECRET_KINDS)[number];

export type GeneratedVariable = { name: string; kind: SecretKind };

export function generateSecret(
  kind: SecretKind,
  randomBytes: (size: number) => Uint8Array,
): string {
  throw new Error(`not implemented: ${kind} ${String(randomBytes)}`);
}

export function generatedVariables(
  manifests: ModuleManifest[],
): GeneratedVariable[] {
  throw new Error(`not implemented: ${manifests.length}`);
}

export function withGeneratedSecrets(
  envText: string,
  variables: GeneratedVariable[],
  randomBytes: (size: number) => Uint8Array,
): string {
  throw new Error(`not implemented: ${envText.length} ${variables.length} ${String(randomBytes)}`);
}
