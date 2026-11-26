import type { OrgRole } from "@/shared/lib/auth/roles";
import type { ModuleDef, ModuleNavItem } from "./define-module";

export interface GatoNavOverride {
  order?: number;
  hidden?: boolean;
}

export interface GatoModuleAccess {
  roles?: OrgRole[];
  adminOnly?: boolean;
  multiOrgRoles?: OrgRole[];
}

export interface GatoModuleConfig {
  enabled?: boolean;
  nav?: Record<string, GatoNavOverride>;
  access?: GatoModuleAccess;
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

export interface ModuleEntry<T> {
  module: string;
  value: T;
}

export const emptyGatoConfig: GatoConfig = {};

export const UNDISABLEABLE_MODULES: readonly string[] = [
  "auth",
  "organizations",
];

export function defineGatoConfig(config: GatoConfig): GatoConfig {
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

export function gatoConfigProblems(
  modules: readonly ModuleDef[],
  config: GatoConfig,
): string[] {
  const problems = Object.entries(config.modules ?? {}).flatMap(
    ([key, moduleConfig]) => {
      const moduleDef = modules.find((candidate) => candidate.key === key);
      if (moduleDef === undefined) {
        return [`modules.${key}: unknown module: ${key}`];
      }
      return moduleProblems(moduleDef, moduleConfig);
    },
  );
  return [...problems, ...brandingProblems(config)];
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
  const access = moduleConfig.access;
  if (access === undefined) {
    return withNav;
  }
  return {
    ...withNav,
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
