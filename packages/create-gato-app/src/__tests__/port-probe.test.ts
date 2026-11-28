import { createServer, type Server } from "node:net";
import { beforeAll, describe, expect, it } from "vitest";
import { isPortBusy } from "../port-probe.js";

function listen(host: string): Promise<{ server: Server; port: number }> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      resolvePromise({ server, port: address.port });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

describe("isPortBusy", () => {
  it("port nasłuchujący na 127.0.0.1 jest zajęty, a po zamknięciu wolny", async () => {
    const { server, port } = await listen("127.0.0.1");
    await expect(isPortBusy(port)).resolves.toBe(true);
    await close(server);
    await expect(isPortBusy(port)).resolves.toBe(false);
  });

  it("sprawdzenie wolnego portu go nie zajmuje", async () => {
    const { server, port } = await listen("127.0.0.1");
    await close(server);
    await expect(isPortBusy(port)).resolves.toBe(false);
    await expect(isPortBusy(port)).resolves.toBe(false);
    const again = createServer();
    await new Promise<void>((resolvePromise, reject) => {
      again.once("error", reject);
      again.listen(port, "127.0.0.1", () => resolvePromise());
    });
    await close(again);
  });
});

function canListenOnIpv6Loopback(): Promise<boolean> {
  return listen("::1").then(
    async ({ server }) => {
      await close(server);
      return true;
    },
    () => false,
  );
}

const ipv6Loopback = { available: false };

beforeAll(async () => {
  ipv6Loopback.available = await canListenOnIpv6Loopback();
});

describe("isPortBusy on the IPv6 loopback", () => {
  it("a server listening only on ::1 is busy, and free after it closes", async ({
    skip,
  }) => {
    if (!ipv6Loopback.available) {
      skip("this host cannot listen on ::1");
    }
    const { server, port } = await listen("::1");
    await expect(isPortBusy(port)).resolves.toBe(true);
    await close(server);
    await expect(isPortBusy(port)).resolves.toBe(false);
  });
});
