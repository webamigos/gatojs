import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/modules/gato-config", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/shared/lib/modules/gato-config")
  >()),
  emptyGatoConfig: {
    modules: {
      "api-keys": { enabled: false },
      "audit-logs": { enabled: false },
    },
  },
}));

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");
const hasKitModules = fs.existsSync(path.join(repoRoot, "kit/modules"));
const hasOptionalModules = [
  "api-keys",
  "audit-logs",
  "encryption",
  "uploads",
].every((key) =>
  fs.existsSync(path.join(repoRoot, "src/features", key, "module.ts")),
);

describe.skipIf(!hasKitModules || !hasOptionalModules)(
  "generated registries with api-keys and audit-logs disabled in the config",
  () => {
    it("modules has neither api-keys nor audit-logs", async () => {
      const { modules } = await import("@/modules.generated");
      expect(modules.map((moduleDef) => moduleDef.key)).toEqual([
        "account",
        "auth",
        "dashboard",
        "organizations",
        "users",
        "encryption",
        "uploads",
      ]);
    });

    it("clientModules has neither api-keys nor audit-logs", async () => {
      const { clientModules } = await import("@/modules.client.generated");
      expect(clientModules.map((moduleDef) => moduleDef.key)).toEqual([
        "account",
        "auth",
        "dashboard",
        "organizations",
        "users",
        "encryption",
        "uploads",
      ]);
    });

    it("moduleMessages has no api-keys or audit-logs loader in pl and en", async () => {
      const { moduleMessages } = await import("@/modules.generated");
      const expected = [
        "account",
        "auth",
        "dashboard",
        "organizations",
        "users",
        "uploads",
      ];
      expect(moduleMessages.pl.map((loader) => loader.key)).toEqual(expected);
      expect(moduleMessages.en.map((loader) => loader.key)).toEqual(expected);
    });

    it("authPlugins and auditSinks are empty", async () => {
      const { authPlugins, auditSinks } = await import("@/modules.generated");
      expect(authPlugins).toEqual([]);
      expect(auditSinks).toEqual([]);
    });

    it("moduleEnvSchemas holds only the encryption and uploads schemas", async () => {
      const { moduleEnvSchemas } = await import("@/modules.generated");
      const { envSchema: encryptionEnvSchema } = await vi.importActual<{
        envSchema: unknown;
      }>("@/features/encryption/env");
      const { envSchema: uploadsEnvSchema } = await vi.importActual<{
        envSchema: unknown;
      }>("@/features/uploads/env");
      expect(moduleEnvSchemas).toHaveLength(2);
      expect(moduleEnvSchemas[0]).toBe(encryptionEnvSchema);
      expect(moduleEnvSchemas[1]).toBe(uploadsEnvSchema);
    });

    it("authClientPlugins is empty", async () => {
      const { authClientPlugins } = await import("@/modules.client.generated");
      expect(authClientPlugins).toEqual([]);
    });
  },
);
