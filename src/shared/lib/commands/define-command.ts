import type { z } from "zod";
import type { OrgContext } from "@/shared/lib/auth/org-context";
import type {
  EventName,
  EventPayload,
} from "@/shared/lib/events/define-events";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import {
  enabledModuleEntries,
  type GatoConfig,
  type ModuleEntry,
} from "@/shared/lib/modules/gato-config";
import type { OperationResult } from "@/shared/types/common";

export type CommandAccess = "member" | "module" | "global-admin";

export type CommandSchema = z.ZodObject<
  z.core.$ZodShape,
  z.core.$ZodObjectConfig
>;

export type CommandInput = Record<string, unknown>;

export type CommandContext = Readonly<OrgContext>;

export type CommandEmit<E extends EventName> = <N extends E>(
  name: N,
  payload: EventPayload<N>,
) => void;

export interface CommandDefinition<
  S extends CommandSchema,
  R extends OperationResult<unknown>,
  E extends EventName = never,
> {
  key: string;
  module: string;
  access: CommandAccess;
  input: S;
  failureMessage: string;
  deniedMessage?: string;
  permission?: string;
  events?: readonly E[];
  run(
    input: z.output<S>,
    context: CommandContext,
    emit: CommandEmit<E>,
  ): Promise<R>;
}

export type Command<
  S extends CommandSchema,
  R extends OperationResult<unknown>,
  E extends EventName = never,
> = Readonly<CommandDefinition<S, R, E>>;

export interface CommandHook {
  id: string;
  before(
    input: CommandInput,
    context: CommandContext,
  ): CommandInput | void | Promise<CommandInput | void>;
}

export type CommandHookMap = Record<
  string,
  CommandHook | readonly CommandHook[]
>;

export interface RegisteredCommandHook {
  module: string;
  command: string;
  hook: CommandHook;
}

export interface CommandHookRegistryInput {
  modules: readonly ModuleDef[];
  hooks: readonly ModuleEntry<CommandHookMap>[];
}

export class CommandError extends Error {
  name = "CommandError";
}

const ORGANIZATION_ID = "organizationId";

function hasModulePrefix(key: string, module: string): boolean {
  const prefix = `${module}.`;
  return key.startsWith(prefix) && key.length > prefix.length;
}

export function defineCommand<
  S extends CommandSchema,
  R extends OperationResult<unknown>,
  const E extends EventName = never,
>(definition: CommandDefinition<S, R, E>): Command<S, R, E> {
  if (!hasModulePrefix(definition.key, definition.module)) {
    throw new CommandError(
      `command keys must start with "${definition.module}.": ${definition.key}`,
    );
  }
  return Object.freeze({ ...definition });
}

export function defineCommandHooks<const M extends CommandHookMap>(map: M): M {
  return map;
}

function isHookList(
  value: CommandHook | readonly CommandHook[],
): value is readonly CommandHook[] {
  return Array.isArray(value);
}

function byId(left: RegisteredCommandHook, right: RegisteredCommandHook) {
  return left.hook.id < right.hook.id ? -1 : 1;
}

function entryHooks(
  entry: ModuleEntry<CommandHookMap>,
): RegisteredCommandHook[] {
  return Object.entries(entry.value).flatMap(([command, value]) =>
    (isHookList(value) ? [...value] : [value])
      .map((hook) => ({ module: entry.module, command, hook }))
      .sort(byId),
  );
}

function repeated(values: readonly string[]): string[] {
  return [
    ...new Set(
      values.filter((value, index) => values.indexOf(value) !== index),
    ),
  ];
}

function declaredCommands(
  modules: readonly ModuleDef[],
): { module: string; key: string }[] {
  return modules.flatMap((moduleDef) =>
    (moduleDef.commands ?? []).map((key) => ({ module: moduleDef.key, key })),
  );
}

function registryProblems(
  commands: readonly { module: string; key: string }[],
  hooks: readonly RegisteredCommandHook[],
): string[] {
  const known = new Set(commands.map(({ key }) => key));
  return [
    ...commands
      .filter(({ module, key }) => !hasModulePrefix(key, module))
      .map(
        ({ module, key }) =>
          `command keys must start with "${module}.": ${key}`,
      ),
    ...repeated(commands.map(({ key }) => key)).map(
      (key) => `duplicate command: ${key}`,
    ),
    ...hooks
      .filter(({ module, hook }) => !hasModulePrefix(hook.id, module))
      .map(
        ({ module, hook }) =>
          `command hook ids must start with "${module}.": ${hook.id}`,
      ),
    ...repeated(hooks.map(({ hook }) => hook.id)).map(
      (id) => `duplicate command hook: ${id}`,
    ),
    ...[
      ...new Set(
        hooks
          .map(({ command }) => command)
          .filter((command) => !known.has(command)),
      ),
    ].map((command) => `unknown command: ${command}`),
  ];
}

export function commandHookRegistry(
  { modules, hooks }: CommandHookRegistryInput,
  config: GatoConfig,
): readonly RegisteredCommandHook[] {
  const problems = registryProblems(
    declaredCommands(modules),
    hooks.flatMap(entryHooks),
  );
  if (problems.length > 0) {
    throw new CommandError(problems.join("\n"));
  }
  return enabledModuleEntries(hooks, config).flatMap(entryHooks);
}

interface WrappedSchema {
  meta(): Record<string, unknown> | undefined;
  def: { innerType?: unknown };
}

function isMarked(field: unknown): boolean {
  let current = field as WrappedSchema | undefined;
  while (current !== undefined) {
    if (current.meta()?.organizationScoped === true) {
      return true;
    }
    current = current.def.innerType as WrappedSchema | undefined;
  }
  return false;
}

export function organizationScopedKeys(schema: CommandSchema): string[] {
  return Object.entries(schema.shape)
    .filter(([key, field]) => key === ORGANIZATION_ID || isMarked(field))
    .map(([key]) => key);
}
