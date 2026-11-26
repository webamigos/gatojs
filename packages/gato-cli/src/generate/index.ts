import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { compareCodePoint } from "../compare.js";
import { readKitState, registeredModules } from "../manifest/kit-state.js";
import { renderLocales, renderRegistry } from "./registry.js";
import type { RegistryModule } from "./registry.js";
import { regionTargets, renderRegionTarget } from "./targets.js";

const SERVER_REGISTRY = "src/modules.generated.ts";
const CLIENT_REGISTRY = "src/modules.client.generated.ts";
const LOCALES_FILE = "src/i18n/locales.generated.ts";
const GATO_CONFIG_FILE = "src/gato.config.ts";
export const GENERATED_FILES: readonly string[] = [
  SERVER_REGISTRY,
  CLIENT_REGISTRY,
  LOCALES_FILE,
];
const FEATURE_GLOB = /^src\/features\/([^/*]+)\//;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function detectFeature(
  projectDir: string,
  name: string,
  configuredLocales: string[],
): Promise<RegistryModule> {
  const base = join(projectDir, "src", "features", name);
  const locales: string[] = [];
  for (const locale of configuredLocales) {
    if (await exists(join(base, "i18n", `${locale}.json`))) {
      locales.push(locale);
    }
  }
  return {
    name,
    hasModuleTs: await exists(join(base, "module.ts")),
    hasEnv: await exists(join(base, "env.ts")),
    hasAuth: await exists(join(base, "auth.ts")),
    hasAuthClient: await exists(join(base, "auth-client.ts")),
    hasAuditSink: await exists(join(base, "audit-sink.ts")),
    hasEvents: await exists(join(base, "events.ts")),
    hasSubscribers: await exists(join(base, "subscribers.ts")),
    hasCommandHooks: await exists(join(base, "command-hooks.ts")),
    hasSlots: await exists(join(base, "slots.ts")),
    hasClientSlots: await exists(join(base, "client-slots.ts")),
    hasComponents: await exists(join(base, "components.ts")),
    locales,
  };
}

async function featureEntries(
  projectDir: string,
  files: string[][],
  configuredLocales: string[],
): Promise<RegistryModule[]> {
  const seen = new Set<string>();
  const entries: RegistryModule[] = [];
  for (const globs of files) {
    const names = [
      ...new Set(
        globs
          .map((glob) => FEATURE_GLOB.exec(glob)?.[1])
          .filter((n): n is string => !!n),
      ),
    ].sort(compareCodePoint);
    for (const name of names) {
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      const entry = await detectFeature(projectDir, name, configuredLocales);
      entries.push(entry);
    }
  }
  return entries;
}

export async function generate(
  projectDir: string,
): Promise<{ changed: string[] }> {
  const state = await readKitState(projectDir);
  const manifests = registeredModules(state);
  const features = await featureEntries(
    projectDir,
    manifests.map((m) => m.files),
    state.locales,
  );
  const registry = renderRegistry(features, state.locales, {
    hasGatoConfig: await exists(join(projectDir, GATO_CONFIG_FILE)),
  });

  const pending: { file: string; current: string | null; next: string }[] = [];
  for (const [file, next] of [
    [SERVER_REGISTRY, registry.server],
    [CLIENT_REGISTRY, registry.client],
    [LOCALES_FILE, renderLocales(state.locales)],
  ] as const) {
    const current = await readFile(join(projectDir, file), "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      },
    );
    pending.push({ file, current, next });
  }
  for (const target of regionTargets) {
    const rendered = await renderRegionTarget(target, {
      modules: manifests,
      projectDir,
      project: state.project,
    });
    if (rendered) {
      pending.push(rendered);
    }
  }

  const changed = pending.filter((p) => p.current !== p.next);
  for (const { file, next } of changed) {
    const target = join(projectDir, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, next);
  }
  return { changed: changed.map((p) => p.file) };
}
