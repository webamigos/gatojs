import { CANARY_ADDRESS, CANARY_HOST } from "./capture.ts";

export type ComposeFile = Record<string, unknown> & {
  services: Record<string, Record<string, unknown>>;
};

export type SealOptions = {
  image: string;
  toolsImage: string;
  checkImage: string;
  subnet: string;
  resolver: string;
  bridge: string;
  pushSchema: boolean;
};

export const NETWORK = "sealed";
export const RELAY_IMAGE = "axllent/mailpit:v1.34.0";

const APP_SERVICES = ["app", "migrate"];
const TOOLS_SERVICE = "tools";
const MIGRATE_SERVICE = "migrate";
const REMOVED_KEYS = ["build", "ports", "network_mode"];
const PUSH_SCHEMA_COMMAND = ["node_modules/.bin/prisma", "db", "push"];

function sealedNetwork(options: SealOptions): Record<string, unknown> {
  return {
    [NETWORK]: {
      internal: true,
      driver_opts: { "com.docker.network.bridge.name": options.bridge },
      ipam: { config: [{ subnet: options.subnet }] },
    },
  };
}

function sealService(
  service: Record<string, unknown>,
  options: SealOptions,
): Record<string, unknown> {
  const sealed: Record<string, unknown> = {
    ...service,
    networks: [NETWORK],
    dns: [options.resolver],
  };
  for (const key of REMOVED_KEYS) {
    delete sealed[key];
  }
  return sealed;
}

function imageFor(name: string, options: SealOptions): string | undefined {
  if (APP_SERVICES.includes(name)) {
    return options.image;
  }
  if (name === TOOLS_SERVICE) {
    return options.toolsImage;
  }
  return undefined;
}

function canaryCommand(): string[] {
  const script = [
    "sleep 2",
    `nslookup ${CANARY_HOST} || true`,
    `curl -s -m 3 http://${CANARY_ADDRESS}/ || true`,
    "exec sleep infinity",
  ].join("; ");
  return ["sh", "-c", script];
}

function addedServices(
  options: SealOptions,
): Record<string, Record<string, unknown>> {
  const onSealed = { networks: [NETWORK], dns: [options.resolver] };
  return {
    relay: {
      image: RELAY_IMAGE,
      environment: { MP_DISABLE_VERSION_CHECK: "true" },
      ...onSealed,
    },
    sink: {
      image: options.checkImage,
      command: ["sleep", "infinity"],
      networks: { [NETWORK]: { ipv4_address: options.resolver } },
      dns: [options.resolver],
    },
    canary: {
      image: options.checkImage,
      command: canaryCommand(),
      ...onSealed,
    },
    capture: {
      image: options.checkImage,
      network_mode: "host",
      cap_add: ["NET_RAW", "NET_ADMIN"],
      command: ["tcpdump", "-i", options.bridge, "-nn", "-l", "-tt", "ip"],
    },
  };
}

export function sealCompose(
  compose: ComposeFile,
  options: SealOptions,
): ComposeFile {
  if (!compose.services) {
    throw new Error("docker-compose.selfhost.yml has no services");
  }
  const copy = structuredClone(compose);
  const services: Record<string, Record<string, unknown>> = {};
  for (const [name, service] of Object.entries(copy.services)) {
    const sealed = sealService(service, options);
    const image = imageFor(name, options);
    if (image !== undefined) {
      sealed.image = image;
    }
    if (name === MIGRATE_SERVICE && options.pushSchema) {
      sealed.command = [...PUSH_SCHEMA_COMMAND];
    }
    services[name] = sealed;
  }
  return {
    ...copy,
    services: { ...services, ...addedServices(options) },
    networks: sealedNetwork(options),
  };
}
