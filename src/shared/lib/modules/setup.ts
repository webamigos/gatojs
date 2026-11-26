import { moduleSetups } from "@/modules.generated";
import { logger } from "@/shared/lib/logger";
import type { ModuleEntry } from "@/shared/lib/modules/gato-config";
import { prisma } from "@/shared/lib/prisma";
import { withoutTenantScope } from "@/shared/lib/tenant-scope";

export interface OrganizationSetupContext {
  organizationId: string;
}

export interface ModuleSetup {
  onOrganizationCreated?(
    context: OrganizationSetupContext,
  ): Promise<void> | void;
  seed?(context: OrganizationSetupContext): Promise<void> | void;
}

export interface ModuleSetupEntry extends ModuleEntry<ModuleSetup> {
  version: string;
}

export type SetupHook = "onOrganizationCreated" | "seed";

export interface OrganizationSetupResult {
  ran: string[];
  skipped: string[];
  failed: string[];
}

export interface MissingSetup {
  organizationId: string;
  module: string;
}

export interface MissingSetupOptions {
  organizationId?: string;
  module?: string;
  modules?: readonly ModuleSetupEntry[];
}

export class OrganizationSetupError extends Error {
  name = "OrganizationSetupError";
}

export function defineSetup<const S extends ModuleSetup>(setup: S): S {
  return setup;
}

function registeredSetups(): readonly ModuleSetupEntry[] {
  return moduleSetups;
}

function entriesWithHook(
  modules: readonly ModuleSetupEntry[],
  hook: SetupHook,
): ModuleSetupEntry[] {
  return modules.filter((entry) => entry.value[hook] !== undefined);
}

async function finishedModules(
  organizationId: string,
  moduleKeys: string[],
): Promise<Set<string>> {
  const rows = await prisma.organizationModuleSetup.findMany({
    where: { organizationId, moduleKey: { in: moduleKeys } },
    select: { moduleKey: true },
  });
  return new Set(rows.map((row) => row.moduleKey));
}

async function recordFinished(
  organizationId: string,
  entry: ModuleSetupEntry,
): Promise<void> {
  await prisma.organizationModuleSetup.upsert({
    where: {
      organizationId_moduleKey: { organizationId, moduleKey: entry.module },
    },
    create: {
      organizationId,
      moduleKey: entry.module,
      moduleVersion: entry.version,
      finishedAt: new Date(),
    },
    update: { moduleVersion: entry.version, finishedAt: new Date() },
  });
}

async function runHook(
  organizationId: string,
  entry: ModuleSetupEntry,
  hook: SetupHook,
): Promise<boolean> {
  try {
    await entry.value[hook]?.({ organizationId });
    if (hook === "onOrganizationCreated") {
      await recordFinished(organizationId, entry);
    }
    return true;
  } catch (error) {
    logger.error("Organization setup failed", {
      organizationId,
      module: entry.module,
      hook,
      error,
    });
    return false;
  }
}

export async function runOrganizationSetup(
  organizationId: string,
  options: { hook: SetupHook; modules?: readonly ModuleSetupEntry[] },
): Promise<OrganizationSetupResult> {
  const { hook } = options;
  const entries = entriesWithHook(options.modules ?? registeredSetups(), hook);
  const result: OrganizationSetupResult = { ran: [], skipped: [], failed: [] };
  if (entries.length === 0) {
    return result;
  }
  const finished =
    hook === "onOrganizationCreated"
      ? await finishedModules(
          organizationId,
          entries.map((entry) => entry.module),
        )
      : new Set<string>();
  for (const entry of entries) {
    if (finished.has(entry.module)) {
      result.skipped.push(entry.module);
      continue;
    }
    const succeeded = await runHook(organizationId, entry, hook);
    (succeeded ? result.ran : result.failed).push(entry.module);
  }
  return result;
}

function candidateEntries(options: MissingSetupOptions): ModuleSetupEntry[] {
  const entries = entriesWithHook(
    options.modules ?? registeredSetups(),
    "onOrganizationCreated",
  );
  if (options.module === undefined) {
    return entries;
  }
  const selected = entries.filter((entry) => entry.module === options.module);
  if (selected.length === 0) {
    throw new OrganizationSetupError(
      `Module ${options.module} has no organization setup or is disabled`,
    );
  }
  return selected;
}

async function organizationIds(organizationId?: string): Promise<string[]> {
  const organizations = await prisma.organization.findMany({
    where: organizationId ? { id: organizationId } : {},
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (organizationId && organizations.length === 0) {
    throw new OrganizationSetupError(
      `Organization ${organizationId} not found`,
    );
  }
  return organizations.map((organization) => organization.id);
}

function setupKey(organizationId: string, module: string): string {
  return JSON.stringify([organizationId, module]);
}

async function finishedPairs(moduleKeys: string[]): Promise<Set<string>> {
  const rows = await withoutTenantScope(
    "setup:organizations lists the setup rows of every organization",
    () =>
      prisma.organizationModuleSetup.findMany({
        where: { moduleKey: { in: moduleKeys } },
        select: { organizationId: true, moduleKey: true },
      }),
  );
  return new Set(
    rows.map((row) => setupKey(row.organizationId, row.moduleKey)),
  );
}

async function missingSetupEntries(
  options: MissingSetupOptions,
): Promise<{ organizationId: string; entries: ModuleSetupEntry[] }[]> {
  const entries = candidateEntries(options);
  const organizations = await organizationIds(options.organizationId);
  if (entries.length === 0) {
    return [];
  }
  const finished = await finishedPairs(entries.map((entry) => entry.module));
  return organizations.map((organizationId) => ({
    organizationId,
    entries: entries.filter(
      (entry) => !finished.has(setupKey(organizationId, entry.module)),
    ),
  }));
}

export async function missingOrganizationSetups(
  options: MissingSetupOptions,
): Promise<MissingSetup[]> {
  const organizations = await missingSetupEntries(options);
  return organizations.flatMap(({ organizationId, entries }) =>
    entries.map((entry) => ({ organizationId, module: entry.module })),
  );
}

export async function runMissingOrganizationSetups(
  options: MissingSetupOptions,
): Promise<{ ran: MissingSetup[]; failed: MissingSetup[] }> {
  const ran: MissingSetup[] = [];
  const failed: MissingSetup[] = [];
  for (const { organizationId, entries } of await missingSetupEntries(
    options,
  )) {
    const result = await runOrganizationSetup(organizationId, {
      hook: "onOrganizationCreated",
      modules: entries,
    });
    ran.push(...result.ran.map((module) => ({ organizationId, module })));
    failed.push(...result.failed.map((module) => ({ organizationId, module })));
  }
  return { ran, failed };
}
