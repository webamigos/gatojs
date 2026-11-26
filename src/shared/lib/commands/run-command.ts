import { moduleCommandHooks } from "@/modules.generated";
import { getAdminUserOrNull } from "@/shared/lib/auth/helpers";
import { getOrgContext, type OrgContext } from "@/shared/lib/auth/org-context";
import { can, moduleByKey } from "@/shared/lib/auth/permissions";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { assertServiceModeConfirmed } from "@/shared/lib/auth/service-mode";
import { emitEvent, eventOrigin } from "@/shared/lib/events";
import type { EventName } from "@/shared/lib/events/define-events";
import {
  isModuleEnabled,
  requireModuleEnabled,
} from "@/shared/lib/modules/require-module-enabled";
import type { OperationResult } from "@/shared/types/common";
import { DomainError, handleCommandError } from "@/shared/utils/error-handling";
import {
  CommandError,
  hasModulePrefix,
  organizationScopedKeys,
  type Command,
  type CommandContext,
  type CommandInput,
  type CommandSchema,
  type RegisteredCommandHook,
} from "./define-command";

type AnyCommand = Command<CommandSchema, OperationResult<unknown>, EventName>;

interface RecordedEvent {
  name: EventName;
  payload: unknown;
}

function deniedMessage(command: AnyCommand): string {
  return command.deniedMessage ?? command.failureMessage;
}

const commandsByKey = new Map<string, AnyCommand>();

function assertOwnedByModule(command: AnyCommand): void {
  if (!hasModulePrefix(command.key, command.module)) {
    throw new CommandError(
      `command key ${command.key} is not owned by module ${command.module}`,
    );
  }
}

function assertSingleObjectPerKey(command: AnyCommand): void {
  const known = commandsByKey.get(command.key);
  // WHY: a dev-server reload re-evaluates command files into new objects for the same key.
  if (known === undefined || process.env.NODE_ENV === "development") {
    commandsByKey.set(command.key, command);
    return;
  }
  if (known !== command) {
    throw new CommandError(`two command objects registered for ${command.key}`);
  }
}

function assertDeclared(command: AnyCommand): void {
  const declared = moduleByKey(command.module)?.commands?.includes(command.key);
  if (declared !== true) {
    throw new CommandError(
      `command not declared by module ${command.module}: ${command.key}`,
    );
  }
}

async function sessionContext(command: AnyCommand): Promise<OrgContext> {
  if (command.access === "module") {
    return requireModuleAccess(command.module);
  }
  if (command.access === "global-admin" && !(await getAdminUserOrNull())) {
    throw new DomainError(deniedMessage(command));
  }
  return getOrgContext();
}

function hooksOf(command: AnyCommand): RegisteredCommandHook[] {
  const registered: readonly RegisteredCommandHook[] = moduleCommandHooks;
  return registered.filter(
    (entry) => entry.command === command.key && isModuleEnabled(entry.module),
  );
}

async function inputAfterHooks(
  command: AnyCommand,
  input: CommandInput,
  context: CommandContext,
): Promise<CommandInput> {
  let current = input;
  for (const { hook } of hooksOf(command)) {
    current = (await hook.before(current, context)) ?? current;
  }
  return current;
}

function assertOrganizationScope(
  command: AnyCommand,
  before: CommandInput,
  after: CommandInput,
  context: CommandContext,
): void {
  for (const field of organizationScopedKeys(command.input)) {
    const value = after[field];
    const kept =
      value === before[field] &&
      (value === undefined || value === context.organizationId);
    if (!kept) {
      throw new CommandError(
        `organization-scoped field rejected for ${command.key}: ${field}`,
      );
    }
  }
}

function eventRecorder(command: AnyCommand, recorded: RecordedEvent[]) {
  return (name: EventName, payload: unknown): void => {
    if (!(command.events ?? []).includes(name)) {
      throw new CommandError(
        `command ${command.key} does not declare event ${name}`,
      );
    }
    recorded.push({ name, payload });
  };
}

async function execute(
  command: AnyCommand,
  input: unknown,
  confirmation: unknown,
): Promise<OperationResult<unknown>> {
  assertOwnedByModule(command);
  assertSingleObjectPerKey(command);
  requireModuleEnabled(command.module);
  assertDeclared(command);
  const sessionCtx = await sessionContext(command);
  assertServiceModeConfirmed(sessionCtx, confirmation);
  const parsed = command.input.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        command.invalidInputMessage?.(parsed.error) ?? command.failureMessage,
    };
  }
  if (
    command.permission !== undefined &&
    !can(sessionCtx, command.permission)
  ) {
    throw new DomainError(deniedMessage(command));
  }
  const context: CommandContext = Object.freeze({ ...sessionCtx });
  const original: CommandInput = { ...parsed.data };
  const hooked = await inputAfterHooks(command, parsed.data, context);
  const reparsed = command.input.safeParse(hooked);
  if (!reparsed.success) {
    throw new CommandError(
      `before hooks returned invalid input for ${command.key}`,
    );
  }
  assertOrganizationScope(command, original, reparsed.data, context);
  const recorded: RecordedEvent[] = [];
  const result = await command.run(
    reparsed.data,
    context,
    eventRecorder(command, recorded) as never,
  );
  if (result.success) {
    for (const { name, payload } of recorded) {
      await emitEvent(eventOrigin(context), name, payload as never);
    }
  }
  return result;
}

export async function runCommand<
  S extends CommandSchema,
  R extends OperationResult<unknown>,
  E extends EventName,
>(
  command: Command<S, R, E>,
  input: unknown,
  confirmation: unknown,
): Promise<R | OperationResult<never>> {
  try {
    return (await execute(
      command as unknown as AnyCommand,
      input,
      confirmation,
    )) as R;
  } catch (error) {
    return handleCommandError(error, command.failureMessage);
  }
}
