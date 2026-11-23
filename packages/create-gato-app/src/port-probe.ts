import { connect, createServer } from "node:net";

const CONNECT_TIMEOUT_MS = 300;

function acceptsConnections(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    const finish = (busy: boolean): void => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function refusesListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve(error.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "0.0.0.0");
  });
}

export async function isPortBusy(port: number): Promise<boolean> {
  // WHY: Node listens with SO_REUSEADDR, so on macOS a wildcard bind can succeed next to a process
  // already bound to 127.0.0.1; a connect probe catches that case, the listen probe catches the rest.
  return (await acceptsConnections(port)) || (await refusesListening(port));
}
