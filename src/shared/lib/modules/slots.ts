import type { ComponentType } from "react";
import {
  isGlobalAdmin,
  type OrgRole,
  type UserRole,
} from "@/shared/lib/auth/roles";
import {
  CORE_SLOTS_CONFIG_KEY,
  enabledModuleEntries,
  GatoConfigError,
  type GatoConfig,
  type GatoSlotOverride,
  type ModuleEntry,
} from "./gato-config";

export type SlotKind = "server" | "client";

export interface SlotContextMap {
  "app.header.actions": { organizationId: string };
}

export type SlotId = keyof SlotContextMap & string;

export type SlotContext<Id extends SlotId> = SlotContextMap[Id];

export interface SlotDefinition {
  id: string;
  kind: SlotKind;
}

export type SlotComponentProps = Record<string, unknown>;

export type SlotComponentLoader = () => Promise<{
  default: ComponentType<SlotComponentProps>;
}>;

export interface SlotContribution {
  slot: string;
  id: string;
  priority: number;
  roles?: readonly OrgRole[];
  component: SlotComponentLoader;
}

export interface ContributionInput<Id extends SlotId> {
  id: string;
  priority: number;
  roles?: readonly OrgRole[];
  component: () => Promise<{ default: ComponentType<SlotContext<Id>> }>;
}

export interface RegisteredContribution extends SlotContribution {
  module: string;
  kind: SlotKind;
}

export interface SlotModule {
  slotDefinitions?: readonly SlotDefinition[];
  slots?: readonly SlotContribution[];
}

export interface ClientSlotModule {
  clientSlots?: readonly SlotContribution[];
}

export interface SlotRegistryInput {
  slots: readonly ModuleEntry<SlotModule>[];
  clientSlots: readonly ModuleEntry<ClientSlotModule>[];
}

export interface SlotViewer {
  userRole: UserRole;
  orgRole: OrgRole | null;
}

export class SlotError extends Error {
  name = "SlotError";
}

export const coreSlotDefinitions: readonly SlotDefinition[] = [
  { id: "app.header.actions", kind: "server" },
];

export function defineSlot<Id extends SlotId>(
  id: Id,
  options: { kind: SlotKind },
): SlotDefinition {
  return { id, kind: options.kind };
}

export function defineContribution<Id extends SlotId>(
  slot: Id,
  input: ContributionInput<Id>,
): SlotContribution {
  return {
    slot,
    id: input.id,
    priority: input.priority,
    roles: input.roles,
    component: input.component as SlotComponentLoader,
  };
}

function byPriorityThenId(
  left: SlotContribution,
  right: SlotContribution,
): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? -1 : 1;
}

export function sortContributions<T extends SlotContribution>(
  list: readonly T[],
): T[] {
  return [...list].sort(byPriorityThenId);
}

export function roleAllows(
  contribution: Pick<SlotContribution, "roles">,
  viewer: SlotViewer,
): boolean {
  if (contribution.roles === undefined || isGlobalAdmin(viewer.userRole)) {
    return true;
  }
  if (viewer.orgRole === null) {
    return false;
  }
  return contribution.roles.includes(viewer.orgRole);
}

type ContributionSource = "slots.ts" | "client-slots.ts";

interface DeclaredSlot {
  owner: string;
  definition: SlotDefinition;
}

interface SourcedContribution {
  module: string;
  source: ContributionSource;
  contribution: SlotContribution;
}

const KIND_OF_SOURCE: Record<ContributionSource, SlotKind> = {
  "slots.ts": "server",
  "client-slots.ts": "client",
};

const SOURCE_OF_KIND: Record<SlotKind, ContributionSource> = {
  server: "slots.ts",
  client: "client-slots.ts",
};

function declaredSlots(input: SlotRegistryInput): DeclaredSlot[] {
  return [
    ...coreSlotDefinitions.map((definition) => ({
      owner: CORE_SLOTS_CONFIG_KEY,
      definition,
    })),
    ...input.slots.flatMap((entry) =>
      (entry.value.slotDefinitions ?? []).map((definition) => ({
        owner: entry.module,
        definition,
      })),
    ),
  ];
}

function sourcedContributions(input: SlotRegistryInput): SourcedContribution[] {
  return [
    ...input.slots.flatMap((entry) =>
      (entry.value.slots ?? []).map((contribution) => ({
        module: entry.module,
        source: "slots.ts" as const,
        contribution,
      })),
    ),
    ...input.clientSlots.flatMap((entry) =>
      (entry.value.clientSlots ?? []).map((contribution) => ({
        module: entry.module,
        source: "client-slots.ts" as const,
        contribution,
      })),
    ),
  ];
}

function duplicates<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  ownerOf: (item: T) => string,
): { key: string; owners: string[] }[] {
  const ownersByKey = new Map<string, string[]>();
  for (const item of items) {
    const key = keyOf(item);
    ownersByKey.set(key, [...(ownersByKey.get(key) ?? []), ownerOf(item)]);
  }
  return [...ownersByKey]
    .filter(([, owners]) => owners.length > 1)
    .map(([key, owners]) => ({ key, owners }));
}

function kindProblem(
  item: SourcedContribution,
  kinds: ReadonlyMap<string, SlotKind>,
): string[] {
  const kind = kinds.get(item.contribution.slot);
  if (kind === undefined || kind === KIND_OF_SOURCE[item.source]) {
    return [];
  }
  return [
    `${item.contribution.id} is in ${item.source} but ${item.contribution.slot} is a ${kind} slot; move it to ${SOURCE_OF_KIND[kind]}`,
  ];
}

function slotKinds(declared: readonly DeclaredSlot[]): Map<string, SlotKind> {
  const kinds = new Map<string, SlotKind>();
  for (const { definition } of declared) {
    if (!kinds.has(definition.id)) {
      kinds.set(definition.id, definition.kind);
    }
  }
  return kinds;
}

function structuralProblems(
  declared: readonly DeclaredSlot[],
  contributions: readonly SourcedContribution[],
): string[] {
  const kinds = slotKinds(declared);
  return [
    ...declared
      .filter(
        ({ owner, definition }) =>
          owner !== CORE_SLOTS_CONFIG_KEY &&
          !definition.id.startsWith(`${owner}.`),
      )
      .map(
        ({ owner, definition }) =>
          `slot ids must start with "${owner}.": ${definition.id}`,
      ),
    ...duplicates(
      declared,
      ({ definition }) => definition.id,
      ({ owner }) => owner,
    ).map(
      ({ key, owners }) =>
        `duplicate slot: ${key} (declared by ${owners.join(" and ")})`,
    ),
    ...contributions
      .filter(
        ({ module, contribution }) => !contribution.id.startsWith(`${module}.`),
      )
      .map(
        ({ module, contribution }) =>
          `contribution ids must start with "${module}.": ${contribution.id}`,
      ),
    ...duplicates(
      contributions,
      ({ contribution }) => contribution.id,
      ({ module }) => module,
    ).map(
      ({ key, owners }) =>
        `duplicate contribution: ${key} (contributed by ${owners.join(" and ")})`,
    ),
    ...contributions
      .filter(({ contribution }) => !kinds.has(contribution.slot))
      .map(
        ({ module, contribution }) =>
          `unknown slot: ${contribution.slot} (contributed by ${module})`,
      ),
    ...contributions.flatMap((item) => kindProblem(item, kinds)),
  ];
}

export function slotConfigProblems(
  input: SlotRegistryInput,
  config: GatoConfig,
): string[] {
  const declared = declaredSlots(input);
  const contributions = sourcedContributions(input);
  return Object.entries(config.modules ?? {}).flatMap(([key, moduleConfig]) =>
    Object.entries(moduleConfig.slots ?? {}).flatMap(([slotId, overrides]) => {
      const isDeclared = declared.some(
        ({ owner, definition }) => owner === key && definition.id === slotId,
      );
      if (!isDeclared) {
        return [`modules.${key}.slots.${slotId}: unknown slot: ${slotId}`];
      }
      return Object.keys(overrides)
        .filter(
          (contributionId) =>
            !contributions.some(
              ({ contribution }) =>
                contribution.slot === slotId &&
                contribution.id === contributionId,
            ),
        )
        .map(
          (contributionId) =>
            `modules.${key}.slots.${slotId}.${contributionId}: unknown contribution: ${contributionId}`,
        );
    }),
  );
}

function configuredOverride(
  config: GatoConfig,
  contribution: SlotContribution,
): GatoSlotOverride | null | undefined {
  for (const moduleConfig of Object.values(config.modules ?? {})) {
    const overrides = moduleConfig.slots?.[contribution.slot];
    if (overrides !== undefined && Object.hasOwn(overrides, contribution.id)) {
      return overrides[contribution.id];
    }
  }
  return undefined;
}

function configuredContributions(
  contributions: readonly RegisteredContribution[],
  config: GatoConfig,
): RegisteredContribution[] {
  return sortContributions(
    contributions.flatMap((contribution) => {
      const override = configuredOverride(config, contribution);
      if (override === null) {
        return [];
      }
      if (override === undefined) {
        return [contribution];
      }
      return [{ ...contribution, priority: override.priority }];
    }),
  );
}

export function slotRegistry(
  input: SlotRegistryInput,
  config: GatoConfig,
): RegisteredContribution[] {
  const declared = declaredSlots(input);
  const problems = structuralProblems(declared, sourcedContributions(input));
  if (problems.length > 0) {
    throw new SlotError(problems.join("\n"));
  }
  const configProblems = slotConfigProblems(input, config);
  if (configProblems.length > 0) {
    throw new GatoConfigError(configProblems);
  }
  const enabled = sourcedContributions({
    slots: enabledModuleEntries(input.slots, config),
    clientSlots: enabledModuleEntries(input.clientSlots, config),
  });
  return configuredContributions(
    enabled.map(({ module, source, contribution }) => ({
      ...contribution,
      module,
      kind: KIND_OF_SOURCE[source],
    })),
    config,
  );
}

export function clientSlotRegistry(
  entries: readonly ModuleEntry<ClientSlotModule>[],
  config: GatoConfig,
): RegisteredContribution[] {
  return configuredContributions(
    enabledModuleEntries(entries, config).flatMap((entry) =>
      (entry.value.clientSlots ?? []).map((contribution) => ({
        ...contribution,
        module: entry.module,
        kind: "client" as const,
      })),
    ),
    config,
  );
}
