"use server";

import { auditActor, trackAudit } from "@/shared/lib/audit";
import { defineCommand } from "@/shared/lib/commands/define-command";
import { runCommand } from "@/shared/lib/commands/run-command";
import { prisma } from "@/shared/lib/prisma";
import type { OperationResult } from "@/shared/types/common";
import { DomainError } from "@/shared/utils/error-handling";
import {
  apiKeyIdSchema,
  createApiKeySchema,
} from "../../contracts/api-key.schemas";
import { apiKeyPepper } from "../api-key-pepper";
import { generateApiKey, hashApiKey } from "../api-key-secret";

const MODULE_KEY = "api-keys";
const ACTIVE_KEY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_NOT_FOUND = "Nie znaleziono klucza";

async function findOrganizationKey(id: string, organizationId: string) {
  const key = await prisma.apiKey.findFirst({
    where: { id, organizationId },
    select: { name: true, displayPrefix: true, revokedAt: true },
  });
  if (key === null) {
    throw new DomainError(KEY_NOT_FOUND);
  }
  return key;
}

const createApiKey = defineCommand({
  key: "api-keys.create",
  module: MODULE_KEY,
  access: "module",
  input: createApiKeySchema(),
  failureMessage: "Nie udało się utworzyć klucza",
  events: ["api-keys.created"],
  run: async (
    parsed,
    context,
    emit,
  ): Promise<OperationResult<{ id: string; plaintext: string }>> => {
    const now = new Date();
    const expiresAt =
      parsed.expiresInDays === null
        ? null
        : new Date(now.getTime() + parsed.expiresInDays * DAY_MS);
    const { plaintext, displayPrefix } = generateApiKey();
    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.organizationId}))`;
      const activeKeys = await tx.apiKey.count({
        where: {
          organizationId: context.organizationId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });
      if (activeKeys >= ACTIVE_KEY_LIMIT) {
        throw new DomainError("Osiągnięto limit 10 aktywnych kluczy");
      }
      return tx.apiKey.create({
        data: {
          organizationId: context.organizationId,
          createdById: context.userId,
          name: parsed.name,
          displayPrefix,
          hashedKey: hashApiKey(plaintext, apiKeyPepper()),
          scopes: parsed.scopes,
          expiresAt,
        },
        select: { id: true },
      });
    });
    await trackAudit({
      ...auditActor(context),
      action: "api_key.created",
      entityType: "api_key",
      entityId: created.id,
      newData: { name: parsed.name, scopes: parsed.scopes, displayPrefix },
    });
    emit("api-keys.created", {
      apiKeyId: created.id,
      name: parsed.name,
      scopes: parsed.scopes,
    });
    return { success: true, data: { id: created.id, plaintext } };
  },
});

const revokeApiKey = defineCommand({
  key: "api-keys.revoke",
  module: MODULE_KEY,
  access: "module",
  input: apiKeyIdSchema,
  failureMessage: "Nie udało się unieważnić klucza",
  events: ["api-keys.revoked"],
  run: async ({ id }, context, emit): Promise<OperationResult> => {
    const key = await findOrganizationKey(id, context.organizationId);
    if (key.revokedAt !== null) {
      return { success: true };
    }
    const { count } = await prisma.apiKey.updateMany({
      where: { id, organizationId: context.organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count > 0) {
      await trackAudit({
        ...auditActor(context),
        action: "api_key.revoked",
        entityType: "api_key",
        entityId: id,
        oldData: { name: key.name, displayPrefix: key.displayPrefix },
      });
      emit("api-keys.revoked", { apiKeyId: id });
    }
    return { success: true };
  },
});

const deleteApiKey = defineCommand({
  key: "api-keys.delete",
  module: MODULE_KEY,
  access: "module",
  input: apiKeyIdSchema,
  failureMessage: "Nie udało się usunąć klucza",
  events: ["api-keys.deleted"],
  run: async ({ id }, context, emit): Promise<OperationResult> => {
    const key = await findOrganizationKey(id, context.organizationId);
    const { count } = await prisma.apiKey.deleteMany({
      where: { id, organizationId: context.organizationId },
    });
    if (count > 0) {
      await trackAudit({
        ...auditActor(context),
        action: "api_key.deleted",
        entityType: "api_key",
        entityId: id,
        oldData: { name: key.name, displayPrefix: key.displayPrefix },
      });
      emit("api-keys.deleted", { apiKeyId: id });
    }
    return { success: true };
  },
});

export async function createApiKeyCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult<{ id: string; plaintext: string }>> {
  return runCommand(createApiKey, input, confirmation);
}

export async function revokeApiKeyCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult> {
  return runCommand(revokeApiKey, input, confirmation);
}

export async function deleteApiKeyCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult> {
  return runCommand(deleteApiKey, input, confirmation);
}
