import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse, stringify } from "yaml";
import { findEscapes, verdict } from "./capture.ts";
import { fillEnv } from "./env-file.ts";
import { runScenario, type HttpClient, type HttpRequest } from "./scenario.ts";
import { NETWORK, sealCompose, type ComposeFile } from "./seal.ts";

const PACKAGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPO = path.resolve(PACKAGE_DIR, "..", "..");
const APP_URL = "http://app:3000";
const RELAY_URL = "http://relay:8025";
const ADMIN_EMAIL = "egress-admin@example.com";
const DEFAULT_SUBNET = "172.29.240.0/24";
const RESOLVER_HOST = 53;
const CAPTURE_START_TIMEOUT_MS = 30_000;
const SAMPLE_INTERVAL_MS = 500;
const CANARY_SETTLE_MS = 8_000;
const TRAILING_CAPTURE_MS = 15_000;

export type Storage = "local" | "s3";

export type Options = {
  storage: Storage;
  keep: boolean;
  image?: string;
  toolsImage?: string;
  project: string;
  subnet: string;
};

class UsageError extends Error {
  name = "UsageError";
}

function parseStorage(value: string): Storage {
  if (value === "local" || value === "s3") {
    return value;
  }
  throw new UsageError(`--storage must be local or s3, got ${value}`);
}

export function parseArgs(argv: readonly string[]): Options {
  let storage: Storage = "local";
  let keep = false;
  let image: string | undefined;
  let toolsImage: string | undefined;
  let project: string | undefined;
  let subnet = DEFAULT_SUBNET;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = (): string => {
      const next = argv[++index];
      if (next === undefined || next.startsWith("--")) {
        throw new UsageError(`${argument} needs a value`);
      }
      return next;
    };
    switch (argument) {
      case "--storage":
        storage = parseStorage(value());
        break;
      case "--keep":
        keep = true;
        break;
      case "--image":
        image = value();
        break;
      case "--tools-image":
        toolsImage = value();
        break;
      case "--project":
        project = value();
        break;
      case "--subnet":
        subnet = value();
        break;
      default:
        throw new UsageError(`unknown option: ${argument}`);
    }
  }
  return {
    storage,
    keep,
    image,
    toolsImage,
    project: project ?? `gato-egress-${storage}`,
    subnet,
  };
}

function ipv4Octets(text: string): number[] | undefined {
  const parts = text.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return undefined;
  }
  const octets = parts.map(Number);
  return octets.every((octet) => octet <= 255) ? octets : undefined;
}

export function resolverFor(subnet: string): string {
  const [base, bitsText] = subnet.split("/");
  const octets = ipv4Octets(base ?? "");
  const bits = Number(bitsText);
  if (!octets || !Number.isInteger(bits) || bits < 8 || bits > 26) {
    throw new UsageError(
      `--subnet must be an IPv4 CIDR from /8 to /26, got ${subnet}`,
    );
  }
  const size = 2 ** (32 - bits);
  const address = octets.reduce((value, octet) => value * 256 + octet, 0);
  const resolver = Math.floor(address / size) * size + RESOLVER_HOST;
  return [24, 16, 8, 0]
    .map((shift) => Math.floor(resolver / 2 ** shift) % 256)
    .join(".");
}

export function bridgeFor(storage: Storage): string {
  return `gato-egr-${storage}`;
}

type Result = { code: number; stdout: Buffer; stderr: Buffer };

type SpawnOptions = { input?: Uint8Array | string; quiet?: boolean };

function execute(
  command: string,
  args: readonly string[],
  options: SpawnOptions = {},
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
      if (!options.quiet) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
      if (!options.quiet) {
        process.stderr.write(chunk);
      }
    });
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      }),
    );
    child.stdin.on("error", (error) =>
      console.error(`stdin of ${command} failed: ${error.message}`),
    );
    child.stdin.end(options.input ?? "");
  });
}

async function mustRun(
  command: string,
  args: readonly string[],
  options: SpawnOptions = {},
): Promise<Result> {
  const result = await execute(command, args, options);
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.code}\n${result.stderr.toString().trim()}`,
    );
  }
  return result;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function randomBase64(bytes: number): string {
  return randomBytes(bytes).toString("base64");
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type ManifestEnv = { name: string; generate?: string };
type KitModule = { manifest?: { env?: ManifestEnv[] } };
type KitFile = {
  modules?: Record<string, KitModule>;
  projectModules?: Record<string, KitModule>;
};

function generatedValue(kind: string, name: string): string {
  switch (kind) {
    case "secret-32":
      return randomBase64(32);
    case "secret-64":
      return randomBase64(64);
    case "hex-32":
      return randomHex(32);
    default:
      throw new Error(`${name} has an unknown generate kind: ${kind}`);
  }
}

function manifestEnvEntries(kit: KitFile): ManifestEnv[] {
  return [kit.modules, kit.projectModules].flatMap((group) =>
    Object.values(group ?? {}).flatMap((module) => module.manifest?.env ?? []),
  );
}

export function generatedSecrets(kit: KitFile): Record<string, string> {
  const values: Record<string, string> = {};
  for (const entry of manifestEnvEntries(kit)) {
    if (entry.generate !== undefined) {
      values[entry.name] = generatedValue(entry.generate, entry.name);
    }
  }
  return values;
}

function storageValues(storage: Storage): Record<string, string> {
  if (storage === "s3") {
    return {
      STORAGE_PROVIDER: "s3",
      S3_ACCESS_KEY_ID: randomHex(16),
      S3_SECRET_ACCESS_KEY: randomHex(32),
    };
  }
  return { STORAGE_PROVIDER: "local" };
}

function environmentValues(storage: Storage): Record<string, string> {
  const kit = JSON.parse(
    readFileSync(path.join(REPO, ".wa/kit.json"), "utf8"),
  ) as KitFile;
  return {
    APP_URL,
    BETTER_AUTH_SECRET: randomBase64(32),
    POSTGRES_PASSWORD: randomHex(24),
    MAIL_PROVIDER: "smtp",
    SMTP_HOST: "relay",
    SMTP_PORT: "1025",
    ...generatedSecrets(kit),
    ...storageValues(storage),
  };
}

function repositoryHasNoMigrations(): boolean {
  const migrations = path.join(REPO, "prisma/migrations");
  if (!existsSync(migrations)) {
    return true;
  }
  return !readdirSync(migrations, { withFileTypes: true }).some((entry) =>
    entry.isDirectory(),
  );
}

type Images = { app: string; tools: string; check: string };

async function ensureImage(reference: string): Promise<void> {
  const inspected = await execute("docker", ["image", "inspect", reference], {
    quiet: true,
  });
  if (inspected.code !== 0) {
    console.log(`pulling ${reference}`);
    await mustRun("docker", ["pull", reference]);
  }
}

async function prepareImages(
  options: Options,
  built: string[],
): Promise<Images> {
  const images: Images = {
    app: options.image ?? `${options.project}-app:local`,
    tools: options.toolsImage ?? `${options.project}-tools:local`,
    check: `${options.project}-check:local`,
  };
  console.log("building the check image");
  await mustRun("docker", ["build", "-t", images.check, PACKAGE_DIR]);
  built.push(images.check);
  if (options.toolsImage) {
    await ensureImage(options.toolsImage);
  } else {
    console.log("building the tools image");
    await mustRun("docker", [
      "build",
      "--target",
      "builder",
      "-t",
      images.tools,
      REPO,
    ]);
    built.push(images.tools);
  }
  if (options.image) {
    await ensureImage(options.image);
  } else {
    console.log("building the app image");
    await mustRun("docker", ["build", "-t", images.app, REPO]);
    built.push(images.app);
  }
  return images;
}

function writeSealedProject(
  workdir: string,
  options: Options,
  images: Images,
  resolver: string,
): void {
  const example = readFileSync(
    path.join(REPO, ".env.selfhost.example"),
    "utf8",
  );
  writeFileSync(
    path.join(workdir, ".env.selfhost"),
    fillEnv(example, environmentValues(options.storage)),
  );
  const compose = parse(
    readFileSync(path.join(REPO, "docker-compose.selfhost.yml"), "utf8"),
  ) as ComposeFile;
  const sealed = sealCompose(compose, {
    image: images.app,
    toolsImage: images.tools,
    checkImage: images.check,
    subnet: options.subnet,
    resolver,
    bridge: bridgeFor(options.storage),
    pushSchema: repositoryHasNoMigrations(),
  });
  writeFileSync(
    path.join(workdir, "docker-compose.selfhost.yml"),
    stringify(sealed, { aliasDuplicateObjects: false }),
  );
}

class Stack {
  readonly network: string;

  constructor(
    private readonly options: Options,
    private readonly workdir: string,
  ) {
    this.network = `${options.project}_${NETWORK}`;
  }

  private composeArgs(args: readonly string[]): string[] {
    return [
      "compose",
      "-p",
      this.options.project,
      "--project-directory",
      this.workdir,
      "-f",
      path.join(this.workdir, "docker-compose.selfhost.yml"),
      "--env-file",
      path.join(this.workdir, ".env.selfhost"),
      ...(this.options.storage === "s3" ? ["--profile", "s3"] : []),
      ...args,
    ];
  }

  compose(
    args: readonly string[],
    options: SpawnOptions = {},
  ): Promise<Result> {
    return mustRun("docker", this.composeArgs(args), options);
  }

  tryCompose(
    args: readonly string[],
    options: SpawnOptions = {},
  ): Promise<Result> {
    return execute("docker", this.composeArgs(args), options);
  }

  async containerId(service: string): Promise<string> {
    const { stdout } = await this.compose(["ps", "-a", "-q", service], {
      quiet: true,
    });
    const id = stdout.toString().trim().split("\n")[0];
    if (!id) {
      throw new Error(`no container for service ${service}`);
    }
    return id;
  }
}

type NetworkContainer = { id: string; name: string; ip: string };

async function networkContainers(network: string): Promise<NetworkContainer[]> {
  const { stdout } = await mustRun("docker", ["network", "inspect", network], {
    quiet: true,
  });
  const [info] = JSON.parse(stdout.toString()) as [
    {
      Containers?: Record<string, { Name: string; IPv4Address: string }> | null;
    },
  ];
  return Object.entries(info.Containers ?? {}).map(([id, container]) => ({
    id,
    name: container.Name,
    ip: container.IPv4Address.split("/")[0],
  }));
}

class Sampler {
  readonly holders = new Map<string, string[]>();
  private timer: NodeJS.Timeout | undefined;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly network: string) {}

  start(): void {
    this.timer = setInterval(() => {
      this.pending = this.pending.then(() => this.sample());
    }, SAMPLE_INTERVAL_MS);
  }

  async sample(): Promise<void> {
    try {
      for (const container of await networkContainers(this.network)) {
        const names = this.holders.get(container.ip) ?? [];
        if (!names.includes(container.name)) {
          this.holders.set(container.ip, [...names, container.name]);
        }
      }
    } catch (error) {
      console.error(`sampling ${this.network} failed: ${errorMessage(error)}`);
    }
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.pending;
  }
}

async function waitForCapture(captureId: string): Promise<void> {
  const deadline = Date.now() + CAPTURE_START_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const { stderr } = await execute("docker", ["logs", captureId], {
      quiet: true,
    });
    if (stderr.toString().includes("listening on")) {
      return;
    }
    await sleep(SAMPLE_INTERVAL_MS);
  }
  throw new Error("the capture did not start listening within 30 s");
}

async function canaryAddress(stack: Stack): Promise<string> {
  const id = await stack.containerId("canary");
  const canary = (await networkContainers(stack.network)).find((container) =>
    container.id.startsWith(id),
  );
  if (!canary) {
    throw new Error(`the canary is not on ${stack.network}`);
  }
  return canary.ip;
}

async function canaryIsRouted(stack: Stack): Promise<boolean> {
  const result = await stack.tryCompose(
    ["exec", "-T", "canary", "sh", "-c", "ip route | grep -q '^default'"],
    { quiet: true },
  );
  return result.code === 0;
}

const STATUS_LINE = /^HTTP\/\S+ (\d{3})/;

function parseHeaders(text: string): {
  status: number;
  headers: Record<string, string[]>;
} {
  let status = 0;
  let headers: Record<string, string[]> = {};
  for (const line of text.split(/\r?\n/)) {
    const statusMatch = STATUS_LINE.exec(line);
    if (statusMatch) {
      status = Number(statusMatch[1]);
      headers = {};
      continue;
    }
    const colon = line.indexOf(":");
    if (status !== 0 && colon > 0) {
      const name = line.slice(0, colon).trim().toLowerCase();
      headers[name] = [...(headers[name] ?? []), line.slice(colon + 1).trim()];
    }
  }
  return { status, headers };
}

function curlArguments(request: HttpRequest): {
  args: string[];
  input?: Uint8Array | string;
} {
  const args = ["-sS", "-D", "/dev/stderr", "-o", "-", "-X", request.method];
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    args.push("-H", `${name}: ${value}`);
  }
  let input: Uint8Array | string | undefined;
  if (request.json !== undefined) {
    args.push("-H", "content-type: application/json", "--data-binary", "@-");
    input = JSON.stringify(request.json);
  }
  if (request.file) {
    const { field, name, type, bytes, fields } = request.file;
    args.push("-F", `${field}=@-;filename=${name};type=${type}`);
    for (const [key, value] of Object.entries(fields)) {
      args.push("--form-string", `${key}=${value}`);
    }
    input = bytes;
  }
  args.push(request.url);
  return { args, input };
}

function curlClient(
  network: string,
  resolver: string,
  checkImage: string,
): HttpClient {
  return async (request) => {
    const { args, input } = curlArguments(request);
    const result = await execute(
      "docker",
      [
        "run",
        "--rm",
        "-i",
        "--network",
        network,
        "--dns",
        resolver,
        checkImage,
        "curl",
        ...args,
      ],
      { input, quiet: true },
    );
    const stderr = result.stderr.toString();
    if (result.code !== 0) {
      throw new Error(
        `curl ${request.method} ${request.url} exited ${result.code}: ${stderr.trim()}`,
      );
    }
    return { ...parseHeaders(stderr), body: result.stdout };
  };
}

async function createAdmin(stack: Stack): Promise<string> {
  const password = randomHex(16);
  console.log(`creating the admin ${ADMIN_EMAIL}`);
  await stack.compose([
    "--profile",
    "tools",
    "run",
    "--rm",
    "tools",
    "npm",
    "run",
    "admin:create",
    "--",
    "--email",
    ADMIN_EMAIL,
    "--password",
    password,
    "--yes",
  ]);
  return password;
}

type PassFailure = { stage: "stack" | "scenario"; error: unknown };

type SealedRun = {
  captureLines: string[];
  canary: string;
  routed: boolean;
  holders: ReadonlyMap<string, readonly string[]>;
  failure?: PassFailure;
};

type ServiceState = {
  Service?: string;
  State?: string;
  Health?: string;
  ExitCode?: number;
};

const FAILED_SERVICE_LOG_LINES = "30";

async function startStack(stack: Stack): Promise<string> {
  console.log("starting the sealed stack");
  await stack.compose(["up", "-d", "--wait"]);
  return createAdmin(stack);
}

async function runPass(
  stack: Stack,
  images: Images,
  resolver: string,
): Promise<PassFailure | undefined> {
  let password: string;
  try {
    password = await startStack(stack);
  } catch (error) {
    console.error(`stack failed: ${errorMessage(error)}`);
    return { stage: "stack", error };
  }
  try {
    await runScenario({
      http: curlClient(stack.network, resolver, images.check),
      appUrl: APP_URL,
      relayUrl: RELAY_URL,
      email: ADMIN_EMAIL,
      password,
      log: (message) => console.log(`scenario: ${message}`),
    });
    return undefined;
  } catch (error) {
    console.error(`scenario failed: ${errorMessage(error)}`);
    return { stage: "scenario", error };
  }
}

function parseServiceStates(text: string): ServiceState[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as ServiceState[];
  }
  return trimmed
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ServiceState);
}

function hasFailed(state: ServiceState): boolean {
  const exitedBadly = state.State === "exited" && (state.ExitCode ?? 0) !== 0;
  return state.Health === "unhealthy" || exitedBadly;
}

async function failedServices(stack: Stack): Promise<string[]> {
  const { stdout } = await stack.compose(["ps", "-a", "--format", "json"], {
    quiet: true,
  });
  const services = parseServiceStates(stdout.toString())
    .filter(hasFailed)
    .map((state) => state.Service)
    .filter((service): service is string => service !== undefined);
  return [...new Set(services)];
}

async function describeFailedStack(stack: Stack): Promise<void> {
  await bestEffort("compose ps", () => stack.compose(["ps", "-a"]));
  await bestEffort("reading failed service logs", async () => {
    for (const service of await failedServices(stack)) {
      console.error(
        `last ${FAILED_SERVICE_LOG_LINES} log lines of ${service}:`,
      );
      await stack.tryCompose([
        "logs",
        "--no-color",
        "--tail",
        FAILED_SERVICE_LOG_LINES,
        service,
      ]);
    }
  });
}

async function runSealed(
  stack: Stack,
  images: Images,
  resolver: string,
): Promise<SealedRun> {
  console.log("creating the sealed stack");
  await stack.compose(["up", "--no-start"]);
  await stack.compose(["up", "-d", "capture"]);
  const captureId = await stack.containerId("capture");
  await waitForCapture(captureId);
  const sampler = new Sampler(stack.network);
  sampler.start();
  try {
    await stack.compose(["up", "-d", "sink", "canary"]);
    await sleep(CANARY_SETTLE_MS);
    const routed = await canaryIsRouted(stack);
    const canary = await canaryAddress(stack);
    console.log(`canary ${canary}, default route: ${routed ? "yes" : "no"}`);
    const failure = await runPass(stack, images, resolver);
    await sleep(TRAILING_CAPTURE_MS);
    await sampler.sample();
    if (failure) {
      await describeFailedStack(stack);
    }
    const { stdout } = await mustRun("docker", ["logs", captureId], {
      quiet: true,
    });
    return {
      captureLines: stdout.toString().split("\n"),
      canary,
      routed,
      holders: sampler.holders,
      failure,
    };
  } finally {
    await sampler.stop();
  }
}

function report(run: SealedRun, options: Options, resolver: string): 0 | 1 {
  const escapes = findEscapes(run.captureLines, options.subnet, { resolver });
  const result = verdict(escapes, {
    canary: run.canary,
    routed: run.routed,
    holders: run.holders,
  });
  const print = result.exitCode === 0 ? console.log : console.error;
  for (const line of result.lines) {
    print(line);
  }
  if (run.failure) {
    console.error(
      `${run.failure.stage} did not complete: ${errorMessage(run.failure.error)}`,
    );
    return 1;
  }
  return result.exitCode;
}

async function bestEffort(
  what: string,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`teardown: ${what} failed: ${errorMessage(error)}`);
  }
}

async function tearDown(
  stack: Stack,
  built: readonly string[],
  workdir: string,
  options: Options,
): Promise<void> {
  if (options.keep) {
    console.log(`kept project ${options.project} in ${workdir}`);
    return;
  }
  await bestEffort("compose down", () =>
    stack.compose(
      [
        "--profile",
        "tools",
        "--profile",
        "s3",
        "down",
        "-v",
        "--remove-orphans",
      ],
      { quiet: true },
    ),
  );
  for (const image of built) {
    await bestEffort(`removing ${image}`, () =>
      mustRun("docker", ["image", "rm", image], { quiet: true }),
    );
  }
  await bestEffort(`removing ${workdir}`, async () =>
    rmSync(workdir, { recursive: true, force: true }),
  );
}

function readOptions(): { options: Options; resolver: string } | undefined {
  try {
    const options = parseArgs(process.argv.slice(2));
    return { options, resolver: resolverFor(options.subnet) };
  } catch (error) {
    console.error(errorMessage(error));
    return undefined;
  }
}

async function main(): Promise<void> {
  const parsed = readOptions();
  if (!parsed) {
    process.exitCode = 1;
    return;
  }
  const { options, resolver } = parsed;
  const workdir = mkdtempSync(path.join(tmpdir(), "gato-egress-"));
  const stack = new Stack(options, workdir);
  const built: string[] = [];
  try {
    const images = await prepareImages(options, built);
    writeSealedProject(workdir, options, images, resolver);
    const run = await runSealed(stack, images, resolver);
    process.exitCode = report(run, options, resolver);
  } catch (error) {
    console.error(`egress check failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await tearDown(stack, built, workdir, options);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
