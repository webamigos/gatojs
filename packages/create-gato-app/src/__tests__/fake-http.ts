import type { FetchLike, HttpResponse } from "../github.js";

export type RecordedRequest = { url: string; headers: Record<string, string> };

export function jsonResponse(body: unknown, status = 200): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

export function bytesResponse(bytes: number[], status = 200): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error("not json");
    },
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  };
}

export function statusResponse(status: number): HttpResponse {
  return {
    ok: false,
    status,
    json: async () => ({ message: "error" }),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

export function fakeFetch(routes: Record<string, HttpResponse>): {
  fetch: FetchLike;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetch: FetchLike = async (url, init) => {
    requests.push({ url, headers: init.headers });
    const response = routes[url];
    if (!response) {
      throw new Error(`unexpected request: ${url}`);
    }
    return response;
  };
  return { fetch, requests };
}

export const forbiddenFetch: FetchLike = async (url) => {
  throw new Error(`fetch must not be called: ${url}`);
};
