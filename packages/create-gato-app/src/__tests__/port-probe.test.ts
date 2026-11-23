import { createServer, type Server } from "node:net";
import { describe, expect, it } from "vitest";
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
