import { logger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";
import { withoutTenantScope } from "@/shared/lib/tenant-scope";
import { knownApiScopes } from "./api-scopes";
import { apiKeyPepper } from "./api-key-pepper";
import { hashApiKey } from "./api-key-secret";

const BEARER_PREFIX = "Bearer ";

export interface ApiKeyContext {
  organizationId: string;
  apiKeyId: string;
  scopes: string[];
}

export type ApiKeyAuthResult =
  | { ok: true; context: ApiKeyContext }
  | {
      ok: false;
      status: 401 | 403;
      error: "missing" | "invalid" | "revoked" | "expired" | "scope";
    };

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = header.slice(BEARER_PREFIX.length);
  return token.trim() === "" ? null : token;
}

function touchLastUsedAt(apiKeyId: string, organizationId: string): void {
  void prisma.apiKey
    .update({
      where: { id: apiKeyId, organizationId },
      data: { lastUsedAt: new Date() },
    })
    .catch((error: unknown) => {
      logger.warn("Nie udało się zaktualizować lastUsedAt klucza API", {
        apiKeyId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

export async function authenticateApiKey(
  request: Request,
  requiredScope: string,
): Promise<ApiKeyAuthResult> {
  const token = readBearerToken(request);
  if (token === null) {
    return { ok: false, status: 401, error: "missing" };
  }
  const hashedKey = hashApiKey(token, apiKeyPepper());
  const record = await withoutTenantScope("api key lookup by hash", () =>
    prisma.apiKey.findUnique({
      where: { hashedKey },
      select: {
        id: true,
        organizationId: true,
        scopes: true,
        revokedAt: true,
        expiresAt: true,
      },
    }),
  );
  if (record === null) {
    return { ok: false, status: 401, error: "invalid" };
  }
  if (record.revokedAt !== null) {
    return { ok: false, status: 401, error: "revoked" };
  }
  if (record.expiresAt !== null && record.expiresAt <= new Date()) {
    return { ok: false, status: 401, error: "expired" };
  }
  const known = new Set(knownApiScopes());
  const scopes = record.scopes.filter((scope) => known.has(scope));
  if (!scopes.includes(requiredScope)) {
    return { ok: false, status: 403, error: "scope" };
  }
  touchLastUsedAt(record.id, record.organizationId);
  return {
    ok: true,
    context: {
      organizationId: record.organizationId,
      apiKeyId: record.id,
      scopes,
    },
  };
}
