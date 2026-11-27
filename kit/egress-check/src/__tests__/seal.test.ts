import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import {
  NETWORK,
  RELAY_IMAGE,
  sealCompose,
  type ComposeFile,
  type SealOptions,
} from "../seal.ts";

const composeText = readFileSync(
  new URL("../../../../docker-compose.selfhost.yml", import.meta.url),
  "utf8",
);

function loadCompose(): ComposeFile {
  return parse(composeText) as ComposeFile;
}

const options: SealOptions = {
  image: "app:check",
  toolsImage: "tools:check",
  checkImage: "check:check",
  subnet: "172.30.0.0/16",
  resolver: "172.30.0.53",
  bridge: "gato-egress",
  pushSchema: false,
};

function hasAdjacent(command: unknown, flag: string, value: string): boolean {
  if (typeof command === "string") {
    return command
      .split(/\s+/)
      .some(
        (part, index, parts) => part === flag && parts[index + 1] === value,
      );
  }
  if (Array.isArray(command)) {
    return command.some(
      (part, index) => part === flag && command[index + 1] === value,
    );
  }
  return false;
}

describe("seal constants", () => {
  it("names the sealed network and pins the relay image", () => {
    assert.equal(NETWORK, "sealed");
    assert.equal(RELAY_IMAGE, "axllent/mailpit:v1.34.0");
  });
});

describe("sealCompose on the repository docker-compose.selfhost.yml", () => {
  it("declares only the internal sealed network on the named bridge and subnet", () => {
    const sealed = sealCompose(loadCompose(), options);
    assert.deepStrictEqual(sealed.networks, {
      sealed: {
        internal: true,
        driver_opts: { "com.docker.network.bridge.name": "gato-egress" },
        ipam: { config: [{ subnet: "172.30.0.0/16" }] },
      },
    });
  });

  it("keeps the original services and adds relay, canary, sink and capture", () => {
    const sealed = sealCompose(loadCompose(), options);
    assert.deepStrictEqual(Object.keys(sealed.services).sort(), [
      "app",
      "canary",
      "capture",
      "db",
      "migrate",
      "minio",
      "minio-init",
      "relay",
      "sink",
      "tools",
    ]);
  });

  it("puts every service except capture on the sealed network with the resolver as DNS", () => {
    const sealed = sealCompose(loadCompose(), options);
    for (const [name, service] of Object.entries(sealed.services)) {
      if (name === "capture") {
        assert.equal(service.network_mode, "host", name);
        continue;
      }
      if (name === "sink") {
        assert.deepStrictEqual(
          service.networks,
          { sealed: { ipv4_address: "172.30.0.53" } },
          name,
        );
      } else {
        assert.deepStrictEqual(service.networks, ["sealed"], name);
      }
      assert.deepStrictEqual(service.dns, ["172.30.0.53"], name);
      assert.equal(service.network_mode, undefined, name);
    }
  });

  it("leaves no service with build or ports", () => {
    const sealed = sealCompose(loadCompose(), options);
    for (const [name, service] of Object.entries(sealed.services)) {
      assert.equal(service.build, undefined, name);
      assert.equal(service.ports, undefined, name);
    }
  });

  it("swaps the app images and keeps the other images and profiles", () => {
    const { services } = sealCompose(loadCompose(), options);
    assert.equal(services.app.image, "app:check");
    assert.equal(services.migrate.image, "app:check");
    assert.equal(services.tools.image, "tools:check");
    assert.equal(services.db.image, "postgres:16");
    assert.equal(
      services.minio.image,
      "cgr.dev/chainguard/minio:latest@sha256:3b6e40c30ecd5cea627e382ff0b82ca841f58c52294578787043ee80c8ef7c82",
    );
    assert.equal(services["minio-init"].image, "amazon/aws-cli:2.39.2");
    assert.deepStrictEqual(services.tools.profiles, ["tools"]);
    assert.deepStrictEqual(services.minio.profiles, ["s3"]);
  });

  it("adds a mail relay with the version check disabled", () => {
    const { relay } = sealCompose(loadCompose(), options).services;
    assert.equal(relay.image, "axllent/mailpit:v1.34.0");
    assert.equal(
      (relay.environment as Record<string, unknown>).MP_DISABLE_VERSION_CHECK,
      "true",
    );
  });

  it("adds a canary that looks up the canary host and connects to the canary address", () => {
    const { canary } = sealCompose(loadCompose(), options).services;
    assert.equal(canary.image, "check:check");
    const command = JSON.stringify(canary.command);
    assert.ok(command.includes("egress-canary.invalid"), command);
    assert.ok(command.includes("http://192.0.2.1/"), command);
  });

  it("adds a sink on the check image", () => {
    const { sink } = sealCompose(loadCompose(), options).services;
    assert.equal(sink.image, "check:check");
  });

  it("adds a capture on the host network listening on the bridge with raw capture rights", () => {
    const { capture } = sealCompose(loadCompose(), options).services;
    assert.equal(capture.image, "check:check");
    assert.equal(capture.network_mode, "host");
    assert.ok(Array.isArray(capture.cap_add));
    assert.ok((capture.cap_add as unknown[]).includes("NET_RAW"));
    assert.ok((capture.cap_add as unknown[]).includes("NET_ADMIN"));
    assert.ok(
      hasAdjacent(capture.command, "-i", "gato-egress"),
      JSON.stringify(capture.command),
    );
  });

  it("keeps migrate deploying migrations when the schema is not pushed", () => {
    const { migrate } = sealCompose(loadCompose(), options).services;
    assert.deepStrictEqual(migrate.command, [
      "node_modules/.bin/prisma",
      "migrate",
      "deploy",
    ]);
  });

  it("makes migrate push the schema when pushSchema is true", () => {
    const { migrate } = sealCompose(loadCompose(), {
      ...options,
      pushSchema: true,
    }).services;
    assert.deepStrictEqual(migrate.command, [
      "node_modules/.bin/prisma",
      "db",
      "push",
    ]);
  });

  it("does not change the input compose file", () => {
    const input = loadCompose();
    sealCompose(input, { ...options, pushSchema: true });
    assert.deepStrictEqual(input, loadCompose());
    assert.equal(input.services.app.build, ".");
    assert.deepStrictEqual(input.services.app.ports, [
      "${APP_PORT:-3000}:3000",
    ]);
    assert.equal(input.networks, undefined);
  });
});

describe("sealCompose on fixtures", () => {
  it("moves a service off its own network mode and default network onto the sealed one", () => {
    const fixture: ComposeFile = {
      services: {
        web: { image: "web:1", network_mode: "bridge", networks: ["default"] },
      },
    };
    const { web } = sealCompose(fixture, options).services;
    assert.deepStrictEqual(web.networks, ["sealed"]);
    assert.equal(web.network_mode, undefined);
    assert.deepStrictEqual(web.dns, ["172.30.0.53"]);
  });

  it("replaces networks the input declares with the sealed network only", () => {
    const fixture: ComposeFile = {
      services: { web: { image: "web:1", networks: ["outside"] } },
      networks: { outside: { driver: "bridge" } },
    };
    assert.deepStrictEqual(sealCompose(fixture, options).networks, {
      sealed: {
        internal: true,
        driver_opts: { "com.docker.network.bridge.name": "gato-egress" },
        ipam: { config: [{ subnet: "172.30.0.0/16" }] },
      },
    });
  });

  it("throws when the file has no services", () => {
    assert.throws(() => sealCompose({} as unknown as ComposeFile, options), {
      message: "docker-compose.selfhost.yml has no services",
    });
  });
});
