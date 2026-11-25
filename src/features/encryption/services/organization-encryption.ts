import "server-only";

import { decryptContent, encryptContent } from "@gatojs/crypto";
import { Prisma } from "@/generated/prisma/client";
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

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

// WHY: Prisma 7 runs this upsert as SELECT then INSERT, not ON CONFLICT, so a concurrent first
// writer gets P2002; re-reading the row it stored gives every caller the same saved data key.
async function wrappedKeyForWrite(organizationId: string): Promise<string> {
  const stored = await storedWrappedKey(organizationId);
  if (stored !== null) {
    return stored;
  }
  const { wrappedKey } = await encryptionKeyProvider().generateDataKey();
  try {
    const row = await prisma.organizationDataKey.upsert({
      where: { organizationId },
      create: { organizationId, wrappedKey },
      update: {},
      select: { wrappedKey: true },
    });
    return row.wrappedKey;
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
    const concurrentlyStored = await storedWrappedKey(organizationId);
    if (concurrentlyStored === null) {
      throw error;
    }
    return concurrentlyStored;
  }
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
