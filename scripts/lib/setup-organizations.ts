import { parseArgs } from "node:util";
import {
  OrganizationSetupError,
  type MissingSetup,
  type missingOrganizationSetups,
  type runMissingOrganizationSetups,
} from "@/shared/lib/modules/setup";

export interface SetupOrganizationsDeps {
  missing: typeof missingOrganizationSetups;
  run: typeof runMissingOrganizationSetups;
  log(line: string): void;
  error(line: string): void;
}

interface SetupOrganizationsArgs {
  check: boolean;
  filter: { organizationId?: string; module?: string };
}

function parseSetupArgs(argv: string[]): SetupOrganizationsArgs {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      organization: { type: "string" },
      module: { type: "string" },
      check: { type: "boolean", default: false },
    },
  });
  return {
    check: values.check,
    filter: {
      ...(values.module === undefined ? {} : { module: values.module }),
      ...(values.organization === undefined
        ? {}
        : { organizationId: values.organization }),
    },
  };
}

function pair(setup: MissingSetup): string {
  return `${setup.organizationId} ${setup.module}`;
}

async function check(
  filter: SetupOrganizationsArgs["filter"],
  deps: SetupOrganizationsDeps,
): Promise<number> {
  const missing = await deps.missing(filter);
  if (missing.length === 0) {
    deps.log("All organizations are set up");
    return 0;
  }
  for (const setup of missing) {
    deps.log(pair(setup));
  }
  return 1;
}

async function run(
  filter: SetupOrganizationsArgs["filter"],
  deps: SetupOrganizationsDeps,
): Promise<number> {
  const { ran, failed } = await deps.run(filter);
  for (const setup of ran) {
    deps.log(`ran ${pair(setup)}`);
  }
  for (const setup of failed) {
    deps.log(`failed ${pair(setup)}`);
  }
  if (ran.length === 0 && failed.length === 0) {
    deps.log("Nothing to set up");
  }
  return failed.length > 0 ? 1 : 0;
}

export async function setupOrganizationsCommand(
  argv: string[],
  deps: SetupOrganizationsDeps,
): Promise<number> {
  let args: SetupOrganizationsArgs;
  try {
    args = parseSetupArgs(argv);
  } catch (error) {
    deps.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  try {
    return args.check
      ? await check(args.filter, deps)
      : await run(args.filter, deps);
  } catch (error) {
    if (error instanceof OrganizationSetupError) {
      deps.error(error.message);
      return 1;
    }
    throw error;
  }
}
