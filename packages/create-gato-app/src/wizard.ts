import { chmod, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { CreateCliArgs } from "./args.js";
import type { CliDeps } from "./cli.js";
import {
  busyPortsReport,
  movedPortsReport,
  portAssignments,
  portSettings,
  publishedPorts,
  suggestFreePort,
  type PublishedPort,
} from "./compose-ports.js";
import { gatoCreateCommand } from "./delegate.js";
import {
  randomSuffix,
  setEnvValues,
  SUFFIX_LENGTH,
  wizardEnvValues,
} from "./env-file.js";
import type { SpawnResult } from "./kit-download.js";
import { readKitModules } from "./kit-modules.js";
import { displayDir, nextSteps, type Outcome } from "./next-steps.js";
import { collectAnswers, type Answers } from "./questions.js";

const OUTPUT_TAIL_LINES = 40;
const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const S3_PROFILE = "s3";

type Context = { deps: CliDeps; projectDir: string };

function tail(result: SpawnResult): string {
  const output = `${result.stderr}\n${result.stdout}`.trim();
  return output.split("\n").slice(-OUTPUT_TAIL_LINES).join("\n");
}

async function runQuiet(
  { deps, projectDir }: Context,
  command: string,
  args: string[],
): Promise<SpawnResult> {
  try {
    return await deps.spawn(command, args, { cwd: projectDir, stdio: "pipe" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { code: 127, stdout: "", stderr: detail };
  }
}

function envEntries(text: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = ENV_LINE.exec(line);
    if (match) {
      entries[match[1] as string] = match[2] as string;
    }
  }
  return entries;
}

async function assemble(
  context: Context,
  args: CreateCliArgs,
  kitDir: string,
  answers: Answers,
): Promise<void> {
  const { deps, projectDir } = context;
  const { command, args: commandArgs } = gatoCreateCommand({
    nodePath: deps.nodePath,
    gatoBin: deps.gatoBin,
    kitDir,
    projectDir,
    answers,
    cliSource: args.cliSource,
  });
  const result = await deps.ui.task("Assembling the project", () =>
    deps.spawn(command, commandArgs, { cwd: deps.cwd, stdio: "pipe" }),
  );
  if (result.code !== 0) {
    throw new Error(
      `Assembling the project failed (gato create exited with ${result.code}):\n${tail(result)}`,
    );
  }
}

async function writeEnv(context: Context, text: string): Promise<void> {
  const envPath = join(context.projectDir, ".env");
  await writeFile(envPath, text, { mode: 0o600 });
  await chmod(envPath, 0o600);
}

async function writeWizardEnv(
  context: Context,
  answers: Answers,
): Promise<string> {
  const existing = await readFile(join(context.projectDir, ".env"), "utf8");
  const text = setEnvValues(
    existing,
    wizardEnvValues({
      existing,
      slug: basename(context.projectDir),
      suffix: randomSuffix(context.deps.randomBytes(SUFFIX_LENGTH)),
      storage: answers.storage,
      mail: answers.mail,
    }),
  );
  await writeEnv(context, text);
  return text;
}

async function busyPorts(
  deps: CliDeps,
  ports: PublishedPort[],
): Promise<PublishedPort[]> {
  const busy: PublishedPort[] = [];
  for (const port of ports) {
    if (await deps.isPortBusy(port.port)) {
      busy.push(port);
    }
  }
  return busy;
}

async function freePorts(
  deps: CliDeps,
  busy: PublishedPort[],
  ports: PublishedPort[],
): Promise<Map<number, number | null>> {
  const taken = ports.map((port) => port.port);
  const free = new Map<number, number | null>();
  for (const { port } of busy) {
    const suggestion = await suggestFreePort(port, deps.isPortBusy, taken);
    free.set(port, suggestion);
    if (suggestion !== null) {
      taken.push(suggestion);
    }
  }
  return free;
}

async function movePorts(
  context: Context,
  envText: string,
  ports: PublishedPort[],
): Promise<boolean> {
  const { deps } = context;
  const busy = await busyPorts(deps, ports);
  if (busy.length === 0) {
    return true;
  }
  const free = await freePorts(deps, busy, ports);
  const input = { busy, free, envText, shellEnv: deps.env };
  const { values, unresolved } = portAssignments(input);
  if (unresolved.length > 0) {
    deps.error(
      busyPortsReport(busy, portSettings({ busy, free, envText })).join("\n"),
    );
    return false;
  }
  await writeEnv(context, setEnvValues(envText, values));
  for (const line of movedPortsReport(input)) {
    deps.ui.info(line);
  }
  return true;
}

async function startDocker(
  context: Context,
  envText: string,
  profiles: string[],
): Promise<boolean> {
  const { deps, projectDir } = context;
  const compose = await readFile(
    join(projectDir, "docker-compose.yml"),
    "utf8",
  );
  const ports = publishedPorts(compose, {
    profiles,
    env: { ...envEntries(envText), ...deps.env },
  });
  if (!(await movePorts(context, envText, ports))) {
    return false;
  }
  const info = await runQuiet(context, "docker", ["info"]);
  if (info.code !== 0) {
    deps.error(
      "Docker is not available (docker info failed), so the database was not started. Start Docker and run the remaining steps below.",
    );
    return false;
  }
  const profileArgs = profiles.flatMap((profile) => ["--profile", profile]);
  const up = await deps.ui.task("Starting Docker services", () =>
    runQuiet(context, "docker", [
      "compose",
      ...profileArgs,
      "up",
      "-d",
      "--wait",
    ]),
  );
  if (up.code !== 0) {
    deps.error(`docker compose up failed:\n${tail(up)}`);
    return false;
  }
  return true;
}

async function install(context: Context): Promise<boolean> {
  const result = await context.deps.ui.task(
    "Installing dependencies (npm install)",
    () => runQuiet(context, "npm", ["install"]),
  );
  if (result.code !== 0) {
    context.deps.error(`npm install failed:\n${tail(result)}`);
    return false;
  }
  return true;
}

async function migrate(context: Context): Promise<boolean> {
  const result = await context.deps.ui.task(
    "Creating the database schema (prisma migrate dev)",
    () =>
      runQuiet(context, "npx", ["prisma", "migrate", "dev", "--name", "init"]),
  );
  if (result.code !== 0) {
    context.deps.error(`prisma migrate dev failed:\n${tail(result)}`);
    return false;
  }
  return true;
}

async function createAdmin(context: Context, email: string): Promise<boolean> {
  const { deps, projectDir } = context;
  deps.ui.step(`Creating the first admin (${email})`);
  let code: number;
  try {
    code = (
      await deps.spawn("npm", ["run", "admin:create", "--", "--email", email], {
        cwd: projectDir,
        stdio: "inherit",
      })
    ).code;
  } catch (error) {
    deps.error(
      `admin:create failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
  if (code !== 0) {
    deps.error(`admin:create failed (exit ${code}).`);
    return false;
  }
  return true;
}

async function commit(context: Context, version: string): Promise<boolean> {
  const add = await runQuiet(context, "git", ["add", "-A"]);
  const result =
    add.code === 0
      ? await runQuiet(context, "git", [
          "commit",
          "-q",
          "--no-verify",
          "-m",
          `chore: initial commit from GatoJS v${version}`,
        ])
      : add;
  if (result.code !== 0) {
    context.deps.ui.warn(
      `Could not create the first commit (${tail(result) || `exit ${result.code}`}); configure git and commit by hand.`,
    );
    return false;
  }
  return true;
}

async function kitVersionOf(projectDir: string): Promise<string> {
  const state = JSON.parse(
    await readFile(join(projectDir, ".wa/kit.json"), "utf8"),
  ) as {
    kitVersion?: unknown;
  };
  return typeof state.kitVersion === "string" ? state.kitVersion : "unknown";
}

function profilesFor(answers: Answers): string[] {
  return answers.storage?.provider === "s3" && answers.storage.localMinio
    ? [S3_PROFILE]
    : [];
}

export async function runWizard(
  deps: CliDeps,
  args: CreateCliArgs,
  kitDir: string,
  projectDir: string,
): Promise<number> {
  const context: Context = { deps, projectDir };
  deps.ui.intro("create-gato-app");
  const answers = await collectAnswers({
    args,
    slug: basename(projectDir),
    modules: await readKitModules(kitDir),
    prompter: deps.prompter,
  });
  await assemble(context, args, kitDir, answers);
  const envText = await writeWizardEnv(context, answers);
  const version = await kitVersionOf(projectDir);
  const profiles = profilesFor(answers);
  const outcome: Outcome = {
    dir: displayDir(deps.cwd, projectDir),
    git: args.git,
    installed: false,
    committed: false,
    dockerUp: false,
    profiles,
    migrated: false,
    adminCreated: false,
    adminEmail: answers.adminEmail,
  };
  let failed = false;
  if (answers.setup) {
    outcome.dockerUp = await startDocker(context, envText, profiles);
    failed = !outcome.dockerUp;
  }
  if (args.git) {
    const init = await runQuiet(context, "git", ["init", "-q"]);
    if (init.code !== 0) {
      deps.ui.warn(
        `git init failed (${tail(init)}); the project has no repository.`,
      );
      outcome.git = false;
    }
  }
  if (args.install) {
    outcome.installed = await install(context);
    failed ||= !outcome.installed;
  }
  if (outcome.installed && outcome.dockerUp) {
    outcome.migrated = await migrate(context);
    failed ||= !outcome.migrated;
  }
  if (outcome.migrated && answers.adminEmail !== null) {
    outcome.adminCreated = await createAdmin(context, answers.adminEmail);
    failed ||= !outcome.adminCreated;
  }
  if (outcome.git && outcome.installed) {
    outcome.committed = await commit(context, version);
  }
  deps.ui.note("Next steps", nextSteps(outcome));
  deps.ui.outro(
    failed
      ? `The project is in ${outcome.dir}, but some steps did not finish (see above).`
      : `Done: ${answers.title} is ready in ${outcome.dir}.`,
  );
  return failed ? 1 : 0;
}
