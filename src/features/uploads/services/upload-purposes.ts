import { modules } from "@/modules.generated";
import type {
  ModuleDef,
  ModuleUploadPurpose,
} from "@/shared/lib/modules/define-module";

export const FORBIDDEN_MIME_TYPES: readonly string[] = [
  "image/svg+xml",
  "text/html",
  "application/xhtml+xml",
];

export function listUploadPurposes(): ModuleUploadPurpose[] {
  const purposes: ModuleUploadPurpose[] = [];
  const seenKeys = new Set<string>();
  const definitions: readonly ModuleDef[] = modules;
  for (const definition of definitions) {
    for (const purpose of definition.uploadPurposes ?? []) {
      if (seenKeys.has(purpose.key)) {
        throw new Error(`Duplicate upload purpose key: ${purpose.key}`);
      }
      const forbidden = purpose.mimeTypes.find((type) =>
        FORBIDDEN_MIME_TYPES.includes(type),
      );
      if (forbidden) {
        throw new Error(
          `Upload purpose ${purpose.key} declares forbidden type ${forbidden}`,
        );
      }
      seenKeys.add(purpose.key);
      purposes.push(purpose);
    }
  }
  return purposes;
}

export function resolveUploadPurpose(key: string): ModuleUploadPurpose | null {
  return listUploadPurposes().find((purpose) => purpose.key === key) ?? null;
}

export function maxUploadBytes(): number {
  return Math.max(...listUploadPurposes().map((purpose) => purpose.maxBytes));
}

export function objectKey(input: {
  organizationId: string;
  purpose: string;
  id: string;
  extension: string;
}): string {
  return `orgs/${input.organizationId}/${input.purpose}/${input.id}.${input.extension}`;
}
