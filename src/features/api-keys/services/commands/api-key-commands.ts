"use server";

import { auditActor, trackAudit } from "@/shared/lib/audit";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { assertServiceModeConfirmed } from "@/shared/lib/auth/service-mode";
import { env } from "@/shared/lib/env";
import { prisma } from "@/shared/lib/prisma";
import type { OperationResult } from "@/shared/types/common";
import { DomainError, handleCommandError } from "@/shared/utils/error-handling";
import {
  apiKeyIdSchema,
  createApiKeySchema,
} from "../../contracts/api-key.schemas";
import { generateApiKey, hashApiKey } from "../api-key-secret";

const MODULE_KEY = "api-keys";
const ACTIVE_KEY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_NOT_FOUND = "Nie znaleziono klucza";

function pepper(): string {
  return (env as unknown as { API_KEY_PEPPER: string }).API_KEY_PEPPER;
}

export async function createApiKeyCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult<{ id: string; plaintext: string }>> {
  const context = await requireModuleAccess(MODULE_KEY);
  try {
    assertServiceModeConfirmed(context, confirmation);
    const parsed = createApiKeySchema().parse(input);
    const now = new Date();
    const expiresAt =
      parsed.expiresInDays === null
        ? null
        : new Date(now.getTime() + parsed.expiresInDays * DAY_MS);
    const { plaintext, displayPrefix } = generateApiKey();
    const created = await prisma.$transaction(async (tx) => {
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
          hashedKey: hashApiKey(plaintext, pepper()),
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
    return { success: true, data: { id: created.id, plaintext } };
  } catch (error) {
    return handleCommandError(error, "Nie udało się utworzyć klucza");
  }
}

export async function revokeApiKeyCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult> {
  const context = await requireModuleAccess(MODULE_KEY);
  try {
    assertServiceModeConfirmed(context, confirmation);
    const { id } = apiKeyIdSchema.parse(input);
    const key = await prisma.apiKey.findFirst({
      where: { id, organizationId: context.organizationId },
      select: { id: true, name: true, displayPrefix: true, scopes: true },
    });
    if (key === null) {
      throw new DomainError(KEY_NOT_FOUND);
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
    }
    return { success: true };
  } catch (error) {
    return handleCommandError(error, "Nie udało się unieważnić klucza");
  }
}

export async function deleteApiKeyCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult> {
  const context = await requireModuleAccess(MODULE_KEY);
  try {
    assertServiceModeConfirmed(context, confirmation);
    const { id } = apiKeyIdSchema.parse(input);
    const key = await prisma.apiKey.findFirst({
      where: { id, organizationId: context.organizationId },
      select: { id: true, name: true, displayPrefix: true, scopes: true },
    });
    if (key === null) {
      throw new DomainError(KEY_NOT_FOUND);
    }
    const { count } = await prisma.apiKey.deleteMany({
      where: { id, organizationId: context.organizationId },
    });
    if (count === 0) {
      throw new DomainError(KEY_NOT_FOUND);
    }
    await trackAudit({
      ...auditActor(context),
      action: "api_key.deleted",
      entityType: "api_key",
      entityId: id,
      oldData: { name: key.name, displayPrefix: key.displayPrefix },
    });
    return { success: true };
  } catch (error) {
    return handleCommandError(error, "Nie udało się usunąć klucza");
  }
}
