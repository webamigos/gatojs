import "server-only";

import { decryptContent, encryptContent } from "@gatojs/crypto";
import { prisma } from "@/shared/lib/prisma";
import {
  encryptionKeyProvider,
  ensureEncryptionAvailable,
} from "./encryption-key-provider";

export class OrganizationDataKeyMissingError extends Error {
  name = "OrganizationDataKeyMissingError";

  constructor(organizationId: string) {
    super(`Organization ${organizationId} has no data key`);
  }
}

async function storedWrappedKey(
  organizationId: string,
): Promise<string | null> {
  const row = await prisma.organizationDataKey.findUnique({
    where: { organizationId },
    select: { wrappedKey: true },
  });
  return row?.wrappedKey ?? null;
}

// WHY: upsert with an empty update keeps the row a concurrent first write stored, so both callers
// end up with the same data key instead of one ciphertext under a key that was never saved.
async function wrappedKeyForWrite(organizationId: string): Promise<string> {
  const stored = await storedWrappedKey(organizationId);
  if (stored !== null) {
    return stored;
  }
  const { wrappedKey } = await encryptionKeyProvider().generateDataKey();
  const row = await prisma.organizationDataKey.upsert({
    where: { organizationId },
    create: { organizationId, wrappedKey },
    update: {},
    select: { wrappedKey: true },
  });
  return row.wrappedKey;
}

export async function encryptForOrganization(
  organizationId: string,
  plaintext: string,
): Promise<string> {
  await ensureEncryptionAvailable();
  const wrappedKey = await wrappedKeyForWrite(organizationId);
  const dataKey = await encryptionKeyProvider().unwrapDataKey(wrappedKey);
  return encryptContent(plaintext, dataKey);
}

export async function decryptForOrganization(
  organizationId: string,
  ciphertext: string,
): Promise<string> {
  await ensureEncryptionAvailable();
  const wrappedKey = await storedWrappedKey(organizationId);
  if (wrappedKey === null) {
    throw new OrganizationDataKeyMissingError(organizationId);
  }
  const dataKey = await encryptionKeyProvider().unwrapDataKey(wrappedKey);
  return decryptContent(ciphertext, dataKey);
}
