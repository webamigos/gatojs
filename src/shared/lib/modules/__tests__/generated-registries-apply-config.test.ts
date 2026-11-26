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

    it("moduleSubscribers has no entry of a disabled module", async () => {
      const { moduleSubscribers } = await import("@/modules.generated");
      expect(
        moduleSubscribers.map((entry: { module: string }) => entry.module),
      ).not.toContain("audit-logs");
      expect(
        moduleSubscribers.map((entry: { module: string }) => entry.module),
      ).not.toContain("api-keys");
    });

    it("moduleSlots constructs and has no contribution of a disabled module", async () => {
      const { moduleSlots } = await import("@/modules.generated");
      expect(Array.isArray(moduleSlots)).toBe(true);
      const owners = moduleSlots.map(
        (entry: { module: string }) => entry.module,
      );
      expect(owners).not.toContain("api-keys");
      expect(owners).not.toContain("audit-logs");
    });

    it("clientModuleSlots constructs and has no contribution of a disabled module", async () => {
      const { clientModuleSlots } = await import("@/modules.client.generated");
      expect(Array.isArray(clientModuleSlots)).toBe(true);
      const owners = clientModuleSlots.map(
        (entry: { module: string }) => entry.module,
      );
      expect(owners).not.toContain("api-keys");
      expect(owners).not.toContain("audit-logs");
    });

    it("authClientPlugins is empty", async () => {
      const { authClientPlugins } = await import("@/modules.client.generated");
      expect(authClientPlugins).toEqual([]);
    });

    it("gatoBranding is an empty object for a config without branding", async () => {
      const { gatoBranding } = await import("@/modules.client.generated");
      expect(gatoBranding).toEqual({});
    });
  },
);
