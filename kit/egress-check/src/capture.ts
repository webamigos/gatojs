export type Escape = { source: string; destination: string; name?: string };

export const CANARY_HOST = "egress-canary.invalid";
export const CANARY_ADDRESS = "192.0.2.1";

const CLEAN_LINE = "no container tried to leave the network";
const NO_CANARY_LINE =
  "capture saw no canary attempt; refusing to report a clean result";

const PACKET = /^\S+ IP (\S+) > (\S+?):? (.*)$/;
const LOOKUP =
  /\b(?:A|AAAA|CNAME|MX|TXT|SRV|PTR|HTTPS|SVCB|NS|SOA|ANY)\? (\S+?)\.? \(/;
const DNS_PORT = "53";

type Endpoint = { address: string; port?: string };

function ipv4ToNumber(address: string): number | undefined {
  const parts = address.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return undefined;
  }
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) {
    return undefined;
  }
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function inSubnet(address: string, subnet: string): boolean {
  const [base, bitsText] = subnet.split("/");
  const value = ipv4ToNumber(address);
  const network = ipv4ToNumber(base);
  const bits = Number(bitsText);
  if (value === undefined || network === undefined || !Number.isInteger(bits)) {
    return false;
  }
  const size = 2 ** (32 - bits);
  return Math.floor(value / size) === Math.floor(network / size);
}

function staysOnLink(address: string): boolean {
  const value = ipv4ToNumber(address);
  if (value === undefined) {
    return false;
  }
  const firstOctet = Math.floor(value / 2 ** 24);
  const multicast = firstOctet >= 224 && firstOctet <= 239;
  return multicast || address === "255.255.255.255";
}

function splitEndpoint(text: string): Endpoint {
  const parts = text.split(".");
  if (parts.length === 5) {
    return { address: parts.slice(0, 4).join("."), port: parts[4] };
  }
  return { address: text };
}

function formatEndpoint(endpoint: Endpoint): string {
  return endpoint.port === undefined
    ? endpoint.address
    : `${endpoint.address}:${endpoint.port}`;
}

function isResolverLookup(destination: Endpoint, resolver?: string): boolean {
  return (
    resolver !== undefined &&
    destination.address === resolver &&
    destination.port === DNS_PORT
  );
}

function leavesNetwork(
  destination: Endpoint,
  subnet: string,
  resolver?: string,
): boolean {
  if (staysOnLink(destination.address)) {
    return false;
  }
  return (
    !inSubnet(destination.address, subnet) ||
    isResolverLookup(destination, resolver)
  );
}

function lookedUpName(
  destination: Endpoint,
  payload: string,
): string | undefined {
  if (destination.port !== DNS_PORT) {
    return undefined;
  }
  return LOOKUP.exec(payload)?.[1];
}

function escapeIn(
  line: string,
  subnet: string,
  resolver?: string,
): Escape | undefined {
  const packet = PACKET.exec(line.trim());
  if (!packet) {
    return undefined;
  }
  const [, rawSource, rawDestination, payload] = packet;
  const source = splitEndpoint(rawSource);
  const destination = splitEndpoint(rawDestination);
  if (!inSubnet(source.address, subnet)) {
    return undefined;
  }
  if (!leavesNetwork(destination, subnet, resolver)) {
    return undefined;
  }
  const escape: Escape = {
    source: source.address,
    destination: formatEndpoint(destination),
  };
  const name = lookedUpName(destination, payload);
  if (name !== undefined) {
    escape.name = name;
  }
  return escape;
}

function escapeKey(escape: Escape): string {
  return [escape.source, escape.destination, escape.name ?? ""].join("\u0000");
}

export function findEscapes(
  lines: readonly string[],
  subnet: string,
  options: { resolver?: string } = {},
): Escape[] {
  const found = new Map<string, Escape>();
  for (const line of lines) {
    const escape = escapeIn(line, subnet, options.resolver);
    if (escape && !found.has(escapeKey(escape))) {
      found.set(escapeKey(escape), escape);
    }
  }
  return [...found.values()];
}

export type Verdict = { exitCode: 0 | 1; lines: string[] };

type VerdictContext = {
  canary: string;
  routed: boolean;
  holders: ReadonlyMap<string, readonly string[]>;
};

function canaryWasSeen(
  escapes: readonly Escape[],
  context: VerdictContext,
): boolean {
  const own = escapes.filter((escape) => escape.source === context.canary);
  const lookup = own.some((escape) => escape.name === CANARY_HOST);
  const connection = own.some(
    (escape) => escape.destination === `${CANARY_ADDRESS}:80`,
  );
  return lookup && (connection || !context.routed);
}

function holderName(
  source: string,
  holders: ReadonlyMap<string, readonly string[]>,
): string {
  const names = holders.get(source) ?? [];
  return names.length > 0 ? names.join(" or ") : "unknown container";
}

function describeTarget(escape: Escape): string {
  return escape.name === undefined
    ? escape.destination
    : `${escape.name} (${escape.destination})`;
}

function offenderLines(
  offenders: readonly Escape[],
  holders: ReadonlyMap<string, readonly string[]>,
): string[] {
  const noun = offenders.length === 1 ? "attempt" : "attempts";
  return [
    `${offenders.length} ${noun} to leave the network:`,
    ...offenders.map(
      (escape) =>
        `  ${holderName(escape.source, holders)} (${escape.source}) -> ${describeTarget(escape)}`,
    ),
  ];
}

export function verdict(
  escapes: readonly Escape[],
  context: VerdictContext,
): Verdict {
  const lines: string[] = [];
  if (!canaryWasSeen(escapes, context)) {
    lines.push(NO_CANARY_LINE);
  }
  const offenders = escapes.filter(
    (escape) => escape.source !== context.canary,
  );
  if (offenders.length > 0) {
    lines.push(...offenderLines(offenders, context.holders));
  }
  if (lines.length > 0) {
    return { exitCode: 1, lines };
  }
  return { exitCode: 0, lines: [CLEAN_LINE] };
}
