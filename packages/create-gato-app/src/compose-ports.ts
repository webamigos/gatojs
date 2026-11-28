export type PublishedPort = {
  service: string;
  variable: string | null;
  port: number;
};

export const FREE_PORT_SEARCH_LIMIT = 100;
const MAX_PORT = 65535;

const SERVICE_LINE = /^ {2}([A-Za-z0-9_.-]+):\s*$/;
const TOP_LEVEL_LINE = /^\S/;
const PROFILES_LINE = /^ {4}profiles:\s*\[(.*)\]\s*$/;
const PORTS_LINE = /^ {4}ports:\s*$/;
const KEY_LINE = /^ {4}\S/;
const PORT_ITEM =
  /^\s+-\s*["']?(?:\$\{([A-Za-z0-9_]+):-(\d+)\}|(\d+)):\d+(?:\/\w+)?["']?\s*$/;
const DIGITS = /^\d+$/;

type ServiceEntry = {
  name: string;
  profiles: string[];
  ports: PublishedPort[];
};

function parseProfiles(list: string): string[] {
  return list
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter((item) => item !== "");
}

function portFor(
  variable: string,
  fallback: string,
  env: Record<string, string | undefined>,
): number {
  const override = env[variable];
  if (override !== undefined && DIGITS.test(override)) {
    return Number(override);
  }
  return Number(fallback);
}

function parseServices(
  composeText: string,
  env: Record<string, string | undefined>,
): ServiceEntry[] {
  const services: ServiceEntry[] = [];
  let inServices = false;
  let current: ServiceEntry | null = null;
  let inPorts = false;
  for (const line of composeText.split(/\r?\n/)) {
    if (TOP_LEVEL_LINE.test(line)) {
      inServices = line.startsWith("services:");
      current = null;
      inPorts = false;
      continue;
    }
    if (!inServices) {
      continue;
    }
    const service = SERVICE_LINE.exec(line);
    if (service) {
      current = { name: service[1] as string, profiles: [], ports: [] };
      services.push(current);
      inPorts = false;
      continue;
    }
    if (current === null) {
      continue;
    }
    const profiles = PROFILES_LINE.exec(line);
    if (profiles) {
      current.profiles = parseProfiles(profiles[1] as string);
      inPorts = false;
      continue;
    }
    if (PORTS_LINE.test(line)) {
      inPorts = true;
      continue;
    }
    if (KEY_LINE.test(line)) {
      inPorts = false;
      continue;
    }
    const item = inPorts ? PORT_ITEM.exec(line) : null;
    if (item) {
      const [, variable, fallback, literal] = item;
      current.ports.push(
        variable === undefined
          ? { service: current.name, variable: null, port: Number(literal) }
          : {
              service: current.name,
              variable,
              port: portFor(variable, fallback as string, env),
            },
      );
    }
  }
  return services;
}

export function publishedPorts(
  composeText: string,
  input: { profiles: string[]; env: Record<string, string | undefined> },
): PublishedPort[] {
  return parseServices(composeText, input.env)
    .filter(
      (service) =>
        service.profiles.length === 0 ||
        service.profiles.some((profile) => input.profiles.includes(profile)),
    )
    .flatMap((service) => service.ports);
}

export async function suggestFreePort(
  port: number,
  isPortBusy: (port: number) => Promise<boolean>,
  taken: number[],
): Promise<number | null> {
  const last = Math.min(port + FREE_PORT_SEARCH_LIMIT, MAX_PORT);
  for (let candidate = port + 1; candidate <= last; candidate += 1) {
    if (!taken.includes(candidate) && !(await isPortBusy(candidate))) {
      return candidate;
    }
  }
  return null;
}

function hostPortPattern(port: number): RegExp {
  return new RegExp(`((?:localhost|127\\.0\\.0\\.1):)${port}(?!\\d)`, "g");
}

function dependentValues(
  envText: string,
  from: number,
  to: number,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of envText.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.startsWith("#")) {
      continue;
    }
    const value = line.slice(separator + 1);
    if (hostPortPattern(from).test(value)) {
      values[line.slice(0, separator)] = value.replace(
        hostPortPattern(from),
        `$1${to}`,
      );
    }
  }
  return values;
}

export function portSettings(input: {
  busy: PublishedPort[];
  free: ReadonlyMap<number, number | null>;
  envText: string;
}): string[] {
  const settings: string[] = [];
  for (const { variable, port } of input.busy) {
    if (variable === null) {
      continue;
    }
    const free = input.free.get(port) ?? null;
    if (free === null) {
      settings.push(`${variable}=<free port>`);
      continue;
    }
    settings.push(
      `${variable}=${free}`,
      ...Object.entries(dependentValues(input.envText, port, free)).map(
        ([key, value]) => `${key}=${value}`,
      ),
    );
  }
  return settings;
}

type PortInput = {
  busy: PublishedPort[];
  free: ReadonlyMap<number, number | null>;
  envText: string;
  shellEnv: Record<string, string | undefined>;
};

type PortMove = {
  service: string;
  variable: string;
  port: number;
  to: number;
  values: Record<string, string>;
};

function portMoves(input: PortInput): {
  moves: PortMove[];
  unresolved: PublishedPort[];
} {
  const moves: PortMove[] = [];
  const unresolved: PublishedPort[] = [];
  for (const published of input.busy) {
    const { variable, port } = published;
    const free = input.free.get(port) ?? null;
    if (
      variable === null ||
      input.shellEnv[variable] !== undefined ||
      free === null
    ) {
      unresolved.push(published);
      continue;
    }
    moves.push({
      service: published.service,
      variable,
      port,
      to: free,
      values: {
        [variable]: `${free}`,
        ...dependentValues(input.envText, port, free),
      },
    });
  }
  return { moves, unresolved };
}

export function portAssignments(input: PortInput): {
  values: Record<string, string>;
  unresolved: PublishedPort[];
} {
  const { moves, unresolved } = portMoves(input);
  return {
    values: Object.fromEntries(
      moves.flatMap((move) => Object.entries(move.values)),
    ),
    unresolved,
  };
}

export function movedPortsReport(input: PortInput): string[] {
  const lines = portMoves(input).moves.map(
    ({ service, variable, port, to, values }) =>
      `Port ${port} (${variable}, service ${service}) is in use; using ${to} and updated ${Object.keys(values).join(", ")} in .env.`,
  );
  if (lines.length > 0) {
    lines.push(
      "npm run test:integration and npm run test:e2e read the moved ports from .env.",
    );
  }
  return lines;
}

export function busyPortsReport(
  busy: PublishedPort[],
  settings: string[],
): string[] {
  const lines = busy.map(({ service, variable, port }) => {
    const owner =
      variable === null
        ? `service ${service}`
        : `${variable}, service ${service}`;
    return `Port ${port} (${owner}) is already in use, so the Docker services were not started.`;
  });
  if (settings.length > 0) {
    lines.push(
      "Set free ports in .env, then run the remaining steps below:",
      ...settings.map((setting) => `  ${setting}`),
    );
  }
  return lines;
}
