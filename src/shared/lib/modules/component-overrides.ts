import type { ComponentType } from "react";
import {
  CORE_SLOTS_CONFIG_KEY,
  enabledModuleEntries,
  GatoConfigError,
  type GatoComponentOverride,
  type GatoConfig,
  type ModuleEntry,
} from "./gato-config";

// WHY: empty in the core; a host module adds its handles here by declaration merging.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ComponentHandleMap {}

export type ComponentHandle = keyof ComponentHandleMap & string;

export type ComponentHandleProps<H extends ComponentHandle> =
  ComponentHandleMap[H];

export type OverrideMode = "replace" | "wrap";

export type WrapperProps<P> = P & { Base: ComponentType<P> };

export interface ComponentHandleDefinition {
  id: string;
}

export type OverrideComponentProps = Record<string, unknown>;

export type OverrideComponentLoader = () => Promise<{
  default: ComponentType<OverrideComponentProps>;
}>;

export interface ComponentOverride {
  handle: string;
  mode: OverrideMode;
  component: OverrideComponentLoader;
}

export type ReplaceOverrideInput<H extends ComponentHandle> = {
  replace: () => Promise<{ default: ComponentType<ComponentHandleProps<H>> }>;
};

export type WrapOverrideInput<H extends ComponentHandle> = {
  wrap: () => Promise<{
    default: ComponentType<WrapperProps<ComponentHandleProps<H>>>;
  }>;
};

export interface ComponentsModule {
  componentHandles?: readonly ComponentHandleDefinition[];
  componentOverrides?: readonly ComponentOverride[];
}

export interface RegisteredComponentOverride extends ComponentOverride {
  source: string;
}

export const CONFIG_OVERRIDE_SOURCE = "src/gato.config.ts";

export class ComponentOverrideError extends Error {
  name = "ComponentOverrideError";
}

export function defineComponentHandle<H extends ComponentHandle>(
  id: H,
): ComponentHandleDefinition {
  return { id };
}

export function defineComponentOverride<H extends ComponentHandle>(
  handle: H,
  input: ReplaceOverrideInput<H> | WrapOverrideInput<H>,
): ComponentOverride {
  if ("replace" in input) {
    return {
      handle,
      mode: "replace",
      component: input.replace as OverrideComponentLoader,
    };
  }
  return {
    handle,
    mode: "wrap",
    component: input.wrap as OverrideComponentLoader,
  };
}

interface DeclaredHandle {
  owner: string;
  id: string;
}

interface SourcedOverride {
  module: string;
  override: ComponentOverride;
}

const CONFIG_CHOICES = ["replace", "wrap", "module"] as const;

type ConfigChoice = (typeof CONFIG_CHOICES)[number];

function declaredHandles(
  entries: readonly ModuleEntry<ComponentsModule>[],
): DeclaredHandle[] {
  return entries.flatMap((entry) =>
    (entry.value.componentHandles ?? []).map(({ id }) => ({
      owner: entry.module,
      id,
    })),
  );
}

function sourcedOverrides(
  entries: readonly ModuleEntry<ComponentsModule>[],
): SourcedOverride[] {
  return entries.flatMap((entry) =>
    (entry.value.componentOverrides ?? []).map((override) => ({
      module: entry.module,
      override,
    })),
  );
}

function overridesOf(
  overrides: readonly SourcedOverride[],
  handle: string,
): SourcedOverride[] {
  return overrides.filter(({ override }) => override.handle === handle);
}

function duplicateHandles(
  declared: readonly DeclaredHandle[],
): { id: string; owners: string[] }[] {
  const ownersById = new Map<string, string[]>();
  for (const { owner, id } of declared) {
    ownersById.set(id, [...(ownersById.get(id) ?? []), owner]);
  }
  return [...ownersById]
    .filter(([, owners]) => owners.length > 1)
    .map(([id, owners]) => ({ id, owners }));
}

function structuralProblems(
  declared: readonly DeclaredHandle[],
  overrides: readonly SourcedOverride[],
): string[] {
  const ids = new Set(declared.map(({ id }) => id));
  return [
    ...declared
      .filter(({ owner, id }) => !id.startsWith(`${owner}.`))
      .map(
        ({ owner, id }) =>
          `component handles must start with "${owner}.": ${id}`,
      ),
    ...duplicateHandles(declared).map(
      ({ id, owners }) =>
        `duplicate component handle: ${id} (declared by ${owners.join(" and ")})`,
    ),
    ...overrides
      .filter(({ override }) => !ids.has(override.handle))
      .map(
        ({ module, override }) =>
          `unknown component handle: ${override.handle} (overridden by ${module})`,
      ),
  ];
}

function configChoiceOf(value: unknown): ConfigChoice | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    return undefined;
  }
  return CONFIG_CHOICES.find((choice) => choice === keys[0]);
}

function configValueProblems(
  path: string,
  handle: string,
  value: unknown,
  enabledOverrides: readonly SourcedOverride[],
): string[] {
  if (value === null) {
    return [];
  }
  const choice = configChoiceOf(value);
  if (choice === undefined) {
    return [`${path}: set exactly one of replace, wrap or module, or null`];
  }
  const chosen = (value as Record<ConfigChoice, unknown>)[choice];
  if (choice !== "module") {
    return typeof chosen === "function"
      ? []
      : [`${path}.${choice}: must be a lazy import, () => import("…")`];
  }
  const hasOverride = overridesOf(enabledOverrides, handle).some(
    ({ module }) => module === chosen,
  );
  return hasOverride
    ? []
    : [
        `${path}.module: ${String(chosen)} has no enabled override of ${handle}`,
      ];
}

export function componentConfigProblems(
  entries: readonly ModuleEntry<ComponentsModule>[],
  config: GatoConfig,
): string[] {
  const declared = declaredHandles(entries);
  const enabledOverrides = sourcedOverrides(
    enabledModuleEntries(entries, config),
  );
  return Object.entries(config.modules ?? {})
    .filter(([key]) => key !== CORE_SLOTS_CONFIG_KEY)
    .flatMap(([key, moduleConfig]) =>
      Object.entries(moduleConfig.components ?? {}).flatMap(
        ([handle, value]) => {
          const path = `modules.${key}.components.${handle}`;
          const isDeclared = declared.some(
            ({ owner, id }) => owner === key && id === handle,
          );
          if (!isDeclared) {
            return [`${path}: unknown component handle: ${handle}`];
          }
          return configValueProblems(path, handle, value, enabledOverrides);
        },
      ),
    );
}

function configuredComponents(
  config: GatoConfig,
  owner: string,
): Record<string, GatoComponentOverride | null> {
  return config.modules?.[owner]?.components ?? {};
}

function conflictProblems(
  declared: readonly DeclaredHandle[],
  enabledOverrides: readonly SourcedOverride[],
  config: GatoConfig,
): string[] {
  return declared
    .filter(
      ({ owner, id }) =>
        !Object.hasOwn(configuredComponents(config, owner), id),
    )
    .map(({ owner, id }) => ({
      owner,
      id,
      modules: overridesOf(enabledOverrides, id).map(({ module }) => module),
    }))
    .filter(({ modules }) => modules.length > 1)
    .map(
      ({ owner, id, modules }) =>
        `${id} is overridden by both ${modules.join(" and ")}; choose one under modules.${owner}.components in ${CONFIG_OVERRIDE_SOURCE}`,
    );
}

function registered(
  override: ComponentOverride,
  source: string,
): RegisteredComponentOverride {
  return {
    handle: override.handle,
    mode: override.mode,
    component: override.component,
    source,
  };
}

function configuredOverride(
  handle: string,
  value: GatoComponentOverride,
  enabledOverrides: readonly SourcedOverride[],
): RegisteredComponentOverride | undefined {
  if ("replace" in value) {
    return {
      handle,
      mode: "replace",
      component: value.replace as OverrideComponentLoader,
      source: CONFIG_OVERRIDE_SOURCE,
    };
  }
  if ("wrap" in value) {
    return {
      handle,
      mode: "wrap",
      component: value.wrap as OverrideComponentLoader,
      source: CONFIG_OVERRIDE_SOURCE,
    };
  }
  const chosen = overridesOf(enabledOverrides, handle).find(
    ({ module }) => module === value.module,
  );
  return chosen === undefined
    ? undefined
    : registered(chosen.override, chosen.module);
}

function resolvedOverride(
  { owner, id }: DeclaredHandle,
  enabledOverrides: readonly SourcedOverride[],
  config: GatoConfig,
): RegisteredComponentOverride | undefined {
  const components = configuredComponents(config, owner);
  if (Object.hasOwn(components, id)) {
    const value = components[id];
    return value === null
      ? undefined
      : configuredOverride(id, value, enabledOverrides);
  }
  const [single] = overridesOf(enabledOverrides, id);
  return single === undefined
    ? undefined
    : registered(single.override, single.module);
}

export function componentOverrideRegistry(
  entries: readonly ModuleEntry<ComponentsModule>[],
  config: GatoConfig,
): ReadonlyMap<string, RegisteredComponentOverride> {
  const declared = declaredHandles(entries);
  const problems = structuralProblems(declared, sourcedOverrides(entries));
  if (problems.length > 0) {
    throw new ComponentOverrideError(problems.join("\n"));
  }
  const configProblems = componentConfigProblems(entries, config);
  if (configProblems.length > 0) {
    throw new GatoConfigError(configProblems);
  }
  const enabledOverrides = sourcedOverrides(
    enabledModuleEntries(entries, config),
  );
  const conflicts = conflictProblems(declared, enabledOverrides, config);
  if (conflicts.length > 0) {
    throw new ComponentOverrideError(conflicts.join("\n"));
  }
  const registry = new Map<string, RegisteredComponentOverride>();
  for (const handle of declared) {
    const override = resolvedOverride(handle, enabledOverrides, config);
    if (override !== undefined) {
      registry.set(handle.id, override);
    }
  }
  return registry;
}
