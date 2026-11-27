import type { ComponentType } from "react";
import type {
  ComponentHandle,
  ModuleKey,
  NavItemId,
  PermissionKey,
  SlotId,
} from "@/extension-points.generated";
import type { OrgRole } from "@/shared/lib/auth/roles";
import type {
  ModuleDef,
  ModuleNavItem,
  ModulePermission,
} from "./define-module";

export interface GatoNavOverride {
  order?: number;
  hidden?: boolean;
}

export interface GatoModuleAccess {
  roles?: OrgRole[];
  adminOnly?: boolean;
  multiOrgRoles?: OrgRole[];
}

export interface GatoSlotOverride {
  priority: number;
}

export type GatoComponentLoader = () => Promise<{
  default: ComponentType<never>;
}>;

export type GatoComponentOverride =
  | { replace: GatoComponentLoader }
  | { wrap: GatoComponentLoader }
  | { module: string };

export interface GatoModuleConfig {
  enabled?: boolean;
  nav?: Record<string, GatoNavOverride>;
  access?: GatoModuleAccess;
  permissions?: Record<string, OrgRole[]>;
  slots?: Record<string, Record<string, GatoSlotOverride | null>>;
  components?: Record<string, GatoComponentOverride | null>;
}

export interface GatoLogo {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface GatoBranding {
  logo?: GatoLogo;
}

export interface GatoConfig {
  modules?: Record<string, GatoModuleConfig>;
  branding?: GatoBranding;
}

export interface ProjectGatoModuleConfig extends Omit<
  GatoModuleConfig,
  "nav" | "permissions" | "slots" | "components"
> {
  nav?: Partial<Record<NavItemId, GatoNavOverride>>;
  permissions?: Partial<Record<PermissionKey, OrgRole[]>>;
  slots?: Partial<Record<SlotId, Record<string, GatoSlotOverride | null>>>;
  components?: Partial<Record<ComponentHandle, GatoComponentOverride | null>>;
}

export interface ProjectGatoConfig extends Omit<GatoConfig, "modules"> {
  modules?: Partial<
    Record<ModuleKey | typeof CORE_SLOTS_CONFIG_KEY, ProjectGatoModuleConfig>
  >;
}

export interface ModuleEntry<T> {
  module: string;
  value: T;
}

export const emptyGatoConfig: GatoConfig = {};

export const CORE_SLOTS_CONFIG_KEY = "app";

export const UNDISABLEABLE_MODULES: readonly string[] = [
  "auth",
  "organizations",
];

export function defineGatoConfig(config: ProjectGatoConfig): GatoConfig {
  return config;
}

export class GatoConfigError extends Error {
  name = "GatoConfigError";
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Invalid src/gato.config.ts:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
    this.problems = problems;
  }
}

function moduleProblems(
  moduleDef: ModuleDef,
  moduleConfig: GatoModuleConfig,
): string[] {
  const key = moduleDef.key;
  const problems: string[] = [];
  if (moduleConfig.enabled === false && UNDISABLEABLE_MODULES.includes(key)) {
    problems.push(`modules.${key}.enabled: ${key} cannot be disabled`);
  }
  const navIds = new Set(moduleDef.nav.map((item) => item.id));
  for (const navId of Object.keys(moduleConfig.nav ?? {})) {
    if (!navIds.has(navId)) {
      problems.push(`modules.${key}.nav.${navId}: unknown nav id: ${navId}`);
    }
  }
  const declaredPermissions = moduleDef.permissions ?? {};
  for (const permissionKey of Object.keys(moduleConfig.permissions ?? {})) {
    if (!Object.hasOwn(declaredPermissions, permissionKey)) {
      problems.push(
        `modules.${key}.permissions.${permissionKey}: unknown permission: ${permissionKey}`,
      );
    }
  }
  const access = moduleConfig.access;
  if (
    access !== undefined &&
    access.roles === undefined &&
    access.adminOnly === undefined &&
    access.multiOrgRoles === undefined
  ) {
    problems.push(
      `modules.${key}.access: access override sets none of roles, adminOnly, multiOrgRoles`,
    );
  }
  return problems;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function logoProblems(logo: GatoLogo): string[] {
  const problems: string[] = [];
  if (!logo.src.startsWith("/") || logo.src.startsWith("//")) {
    problems.push(
      `branding.logo.src: must start with a single "/" (a file in public/): ${logo.src}`,
    );
  }
  if (logo.alt.trim() === "") {
    problems.push("branding.logo.alt: must not be blank");
  }
  for (const dimension of ["width", "height"] as const) {
    if (!isPositiveInteger(logo[dimension])) {
      problems.push(
        `branding.logo.${dimension}: must be a positive integer: ${logo[dimension]}`,
      );
    }
  }
  return problems;
}

export function brandingProblems(config: GatoConfig): string[] {
  const logo = config.branding?.logo;
  return logo === undefined ? [] : logoProblems(logo);
}

export function gatoBrandingOf(config: GatoConfig): GatoBranding {
  const problems = brandingProblems(config);
  if (problems.length > 0) {
    throw new GatoConfigError(problems);
  }
  return config.branding ?? {};
}

function coreSlotsConfigProblems(moduleConfig: GatoModuleConfig): string[] {
  return Object.keys(moduleConfig)
    .filter((field) => field !== "slots")
    .map(
      (field) =>
        `modules.${CORE_SLOTS_CONFIG_KEY}.${field}: ${CORE_SLOTS_CONFIG_KEY} is reserved for core-hosted slots; only slots is allowed`,
    );
}

function reservedKeyProblems(modules: readonly ModuleDef[]): string[] {
  return modules
    .filter((moduleDef) => moduleDef.key === CORE_SLOTS_CONFIG_KEY)
    .map(
      () =>
        `modules.${CORE_SLOTS_CONFIG_KEY}: the key ${CORE_SLOTS_CONFIG_KEY} is reserved for core-hosted slots and cannot be a module key`,
    );
}

export function gatoConfigProblems(
  modules: readonly ModuleDef[],
  config: GatoConfig,
): string[] {
  const problems = Object.entries(config.modules ?? {}).flatMap(
    ([key, moduleConfig]) => {
      if (key === CORE_SLOTS_CONFIG_KEY) {
        return coreSlotsConfigProblems(moduleConfig);
      }
      const moduleDef = modules.find((candidate) => candidate.key === key);
      if (moduleDef === undefined) {
        return [`modules.${key}: unknown module: ${key}`];
      }
      return moduleProblems(moduleDef, moduleConfig);
    },
  );
  return [
    ...reservedKeyProblems(modules),
    ...problems,
    ...brandingProblems(config),
  ];
}

function isDisabled(config: GatoConfig, key: string): boolean {
  return config.modules?.[key]?.enabled === false;
}

function configuredNav(
  nav: readonly ModuleNavItem[],
  overrides: Record<string, GatoNavOverride>,
): ModuleNavItem[] {
  return nav.flatMap((item) => {
    const override = item.id === undefined ? undefined : overrides[item.id];
    if (override === undefined) {
      return [item];
    }
    if (override.hidden === true) {
      return [];
    }
    if (override.order === undefined) {
      return [item];
    }
    return [{ ...item, order: override.order }];
  });
}

function configuredPermissions(
  permissions: Record<string, ModulePermission>,
  overrides: Record<string, OrgRole[]>,
): Record<string, ModulePermission> {
  return Object.fromEntries(
    Object.entries(permissions).map(([key, permission]) => {
      const roles = Object.hasOwn(overrides, key) ? overrides[key] : undefined;
      return [
        key,
        roles === undefined
          ? permission
          : { ...permission, defaultRoles: [...roles] },
      ];
    }),
  );
}

function configuredModule<T extends ModuleDef>(
  moduleDef: T,
  moduleConfig: GatoModuleConfig | undefined,
): T {
  if (moduleConfig === undefined) {
    return moduleDef;
  }
  const withNav =
    moduleConfig.nav === undefined
      ? moduleDef
      : { ...moduleDef, nav: configuredNav(moduleDef.nav, moduleConfig.nav) };
  const withPermissions =
    moduleConfig.permissions === undefined || withNav.permissions === undefined
      ? withNav
      : {
          ...withNav,
          permissions: configuredPermissions(
            withNav.permissions,
            moduleConfig.permissions,
          ),
        };
  const access = moduleConfig.access;
  if (access === undefined) {
    return withPermissions;
  }
  return {
    ...withPermissions,
    roles: access.roles,
    adminOnly: access.adminOnly,
    multiOrgRoles: access.multiOrgRoles,
  };
}

export function applyGatoConfig<T extends ModuleDef>(
  modules: readonly T[],
  config: GatoConfig,
): T[] {
  const problems = gatoConfigProblems(modules, config);
  if (problems.length > 0) {
    throw new GatoConfigError(problems);
  }
  return modules
    .filter((moduleDef) => !isDisabled(config, moduleDef.key))
    .map((moduleDef) =>
      configuredModule(moduleDef, config.modules?.[moduleDef.key]),
    );
}

export function enabledModuleEntries<E extends ModuleEntry<unknown>>(
  entries: readonly E[],
  config: GatoConfig,
): E[] {
  return entries.filter((entry) => !isDisabled(config, entry.module));
}

// WHY: a single T fails to infer a union from entries of different value types, so the
// entry type is inferred instead; an explicit <T> still types the entries through the default.
export function enabledEntries<T, E extends ModuleEntry<T> = ModuleEntry<T>>(
  entries: readonly E[],
  config: GatoConfig,
): E["value"][] {
  return enabledModuleEntries(entries, config).map((entry) => entry.value);
}
