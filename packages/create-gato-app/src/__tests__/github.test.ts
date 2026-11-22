import { describe, expect, it, vi } from "vitest";
import {
  fetchKitTarball,
  fetchTagNames,
  githubHeaders,
  KIT_REPO,
  resolveKitVersion,
  resolveToken,
  tagsUrl,
  tarballUrl,
  type FetchLike,
} from "../github.js";
import {
  bytesResponse,
  fakeFetch,
  forbiddenFetch,
  jsonResponse,
  statusResponse,
} from "./fake-http.js";

const SECRET = "ghp_SECRET_TOKEN_123";
const TAGS_PAGE_1 =
  "https://api.github.com/repos/webamigos/gatojs/tags?per_page=100&page=1";
const TAGS_PAGE_2 =
  "https://api.github.com/repos/webamigos/gatojs/tags?per_page=100&page=2";
const TAGS_PAGE_3 =
  "https://api.github.com/repos/webamigos/gatojs/tags?per_page=100&page=3";
const API_TARBALL =
  "https://api.github.com/repos/webamigos/gatojs/tarball/refs/tags/v0.1.0";
const CODELOAD_TARBALL =
  "https://codeload.github.com/webamigos/gatojs/tar.gz/refs/tags/v0.1.0";

function tagPage(prefix: string, count: number): { name: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix}${index}`,
  }));
}

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a rejection");
}

describe("KIT_REPO", () => {
  it("is webamigos/gatojs", () => {
    expect(KIT_REPO).toBe("webamigos/gatojs");
  });
});

describe("githubHeaders", () => {
  it("without a token has no Authorization", () => {
    expect(githubHeaders(null)).toEqual({
      "User-Agent": "create-gato-app",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
  });

  it("with a token adds a Bearer Authorization", () => {
    expect(githubHeaders("t0k")).toEqual({
      "User-Agent": "create-gato-app",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: "Bearer t0k",
    });
  });
});

describe("urls", () => {
  it("tagsUrl points at the tag list page", () => {
    expect(tagsUrl(1)).toBe(TAGS_PAGE_1);
    expect(tagsUrl(3)).toBe(TAGS_PAGE_3);
  });

  it("tarballUrl without a token uses codeload", () => {
    expect(tarballUrl("0.1.0", null)).toBe(CODELOAD_TARBALL);
  });

  it("tarballUrl with a token uses the API", () => {
    expect(tarballUrl("0.1.0", "t")).toBe(API_TARBALL);
  });
});

describe("resolveToken", () => {
  const ghNever = () => Promise.reject(new Error("gh must not be called"));

  it("GITHUB_TOKEN wins over GH_TOKEN and gh", async () => {
    const ghAuthToken = vi.fn(ghNever);
    await expect(
      resolveToken({
        env: { GITHUB_TOKEN: "from-github", GH_TOKEN: "from-gh-env" },
        ghAuthToken,
      }),
    ).resolves.toBe("from-github");
    expect(ghAuthToken).not.toHaveBeenCalled();
  });

  it("GH_TOKEN wins over gh", async () => {
    const ghAuthToken = vi.fn(ghNever);
    await expect(
      resolveToken({ env: { GH_TOKEN: "from-gh-env" }, ghAuthToken }),
    ).resolves.toBe("from-gh-env");
    expect(ghAuthToken).not.toHaveBeenCalled();
  });

  it("env values are trimmed", async () => {
    await expect(
      resolveToken({ env: { GITHUB_TOKEN: "  abc\n" }, ghAuthToken: ghNever }),
    ).resolves.toBe("abc");
    await expect(
      resolveToken({ env: { GH_TOKEN: "\tdef \n" }, ghAuthToken: ghNever }),
    ).resolves.toBe("def");
  });

  it("an empty GITHUB_TOKEN falls back to GH_TOKEN", async () => {
    await expect(
      resolveToken({
        env: { GITHUB_TOKEN: "", GH_TOKEN: "from-gh-env" },
        ghAuthToken: ghNever,
      }),
    ).resolves.toBe("from-gh-env");
  });

  it("whitespace env values fall back to gh", async () => {
    await expect(
      resolveToken({
        env: { GITHUB_TOKEN: "  ", GH_TOKEN: "\n" },
        ghAuthToken: async () => "gho_x\n",
      }),
    ).resolves.toBe("gho_x");
  });

  it("without env uses gh auth token, trimmed", async () => {
    await expect(
      resolveToken({ env: {}, ghAuthToken: async () => "gho_x\n" }),
    ).resolves.toBe("gho_x");
  });

  it.each([
    ["null", async () => null],
    ["empty", async () => ""],
    ["newline", async () => "\n"],
    ["rejecting", async () => Promise.reject(new Error("gh: not found"))],
  ])("gh returning %s gives null", async (_label, ghAuthToken) => {
    await expect(resolveToken({ env: {}, ghAuthToken })).resolves.toBeNull();
  });
});

describe("fetchTagNames", () => {
  it("one short page gives its names in order with one request", async () => {
    const { fetch, requests } = fakeFetch({
      [TAGS_PAGE_1]: jsonResponse([{ name: "v0.2.0" }, { name: "v0.1.0" }]),
    });
    await expect(fetchTagNames({ fetch, token: null })).resolves.toEqual([
      "v0.2.0",
      "v0.1.0",
    ]);
    expect(requests).toEqual([
      {
        url: TAGS_PAGE_1,
        headers: {
          "User-Agent": "create-gato-app",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    ]);
  });

  it("follows pages until one has fewer than 100 entries", async () => {
    const { fetch, requests } = fakeFetch({
      [TAGS_PAGE_1]: jsonResponse(tagPage("a", 100)),
      [TAGS_PAGE_2]: jsonResponse(tagPage("b", 100)),
      [TAGS_PAGE_3]: jsonResponse([{ name: "last" }]),
    });
    const names = await fetchTagNames({ fetch, token: "t" });
    expect(names).toHaveLength(201);
    expect(names[0]).toBe("a0");
    expect(names[99]).toBe("a99");
    expect(names[100]).toBe("b0");
    expect(names[199]).toBe("b99");
    expect(names[200]).toBe("last");
    expect(requests.map((request) => request.url)).toEqual([
      TAGS_PAGE_1,
      TAGS_PAGE_2,
      TAGS_PAGE_3,
    ]);
    for (const request of requests) {
      expect(request.headers.Authorization).toBe("Bearer t");
    }
  });

  it("a full page followed by an empty page makes two requests", async () => {
    const { fetch, requests } = fakeFetch({
      [TAGS_PAGE_1]: jsonResponse(tagPage("a", 100)),
      [TAGS_PAGE_2]: jsonResponse([]),
    });
    const names = await fetchTagNames({ fetch, token: null });
    expect(names).toHaveLength(100);
    expect(requests.map((request) => request.url)).toEqual([
      TAGS_PAGE_1,
      TAGS_PAGE_2,
    ]);
  });

  it("does not send Authorization without a token", async () => {
    const { fetch, requests } = fakeFetch({
      [TAGS_PAGE_1]: jsonResponse([]),
    });
    await fetchTagNames({ fetch, token: null });
    expect(requests[0]?.headers).not.toHaveProperty("Authorization");
  });
});

describe("resolveKitVersion", () => {
  it("returns the requested version without fetching", async () => {
    const fetch = vi.fn(forbiddenFetch);
    await expect(
      resolveKitVersion({ requested: "0.3.0", fetch, token: null }),
    ).resolves.toBe("0.3.0");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("without a requested version picks the highest semver tag", async () => {
    const { fetch } = fakeFetch({
      [TAGS_PAGE_1]: jsonResponse([
        { name: "v0.9.1" },
        { name: "v0.10.0" },
        { name: "latest" },
        { name: "v1.0.0-rc.1" },
      ]),
    });
    await expect(
      resolveKitVersion({ requested: null, fetch, token: null }),
    ).resolves.toBe("0.10.0");
  });

  it("without any semver tag explains how to pick a version", async () => {
    const { fetch } = fakeFetch({
      [TAGS_PAGE_1]: jsonResponse([{ name: "latest" }]),
    });
    const message = await messageOf(
      resolveKitVersion({ requested: null, fetch, token: null }),
    );
    expect(message).toContain("No v<x.y.z> tag found");
    expect(message).toContain("--kit-version");
  });
});

describe("fetchKitTarball", () => {
  it("with a token downloads from the API with Authorization and returns the bytes", async () => {
    const { fetch, requests } = fakeFetch({
      [API_TARBALL]: bytesResponse([31, 139, 8, 0, 7]),
    });
    const bytes = await fetchKitTarball({
      fetch,
      token: "t",
      version: "0.1.0",
    });
    expect(Array.from(bytes)).toEqual([31, 139, 8, 0, 7]);
    expect(requests).toEqual([
      {
        url: API_TARBALL,
        headers: {
          "User-Agent": "create-gato-app",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: "Bearer t",
        },
      },
    ]);
  });

  it("without a token downloads from codeload without Authorization", async () => {
    const { fetch, requests } = fakeFetch({
      [CODELOAD_TARBALL]: bytesResponse([1, 2, 3]),
    });
    const bytes = await fetchKitTarball({
      fetch,
      token: null,
      version: "0.1.0",
    });
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers).not.toHaveProperty("Authorization");
  });
});

type Call = {
  label: string;
  what: string;
  invoke: (fetch: FetchLike, token: string | null) => Promise<unknown>;
};

const calls: Call[] = [
  {
    label: "fetchTagNames",
    what: "the tag list",
    invoke: (fetch, token) => fetchTagNames({ fetch, token }),
  },
  {
    label: "fetchKitTarball",
    what: "kit v0.1.0",
    invoke: (fetch, token) =>
      fetchKitTarball({ fetch, token, version: "0.1.0" }),
  },
];

function failingFetch(status: number): FetchLike {
  return async () => statusResponse(status);
}

describe.each(calls)("HTTP errors in $label", ({ what, invoke }) => {
  it("404 without a token hints at a private repo and how to authenticate", async () => {
    const message = await messageOf(invoke(failingFetch(404), null));
    expect(message).toContain("404");
    expect(message).toContain(what);
    expect(message).toContain("may be private");
    expect(message).toContain("GITHUB_TOKEN");
    expect(message).toContain("gh auth login");
  });

  it("404 with a token does not hint at a private repo", async () => {
    const message = await messageOf(invoke(failingFetch(404), SECRET));
    expect(message).toContain("404");
    expect(message).not.toContain("may be private");
    expect(message).not.toContain(SECRET);
  });

  it.each([null, SECRET])(
    "401 mentions GITHUB_TOKEN (token %s)",
    async (token) => {
      const message = await messageOf(invoke(failingFetch(401), token));
      expect(message).toContain("401");
      expect(message).toContain("GITHUB_TOKEN");
      expect(message).not.toContain(SECRET);
    },
  );

  it.each([403, 429])("%i suggests --kit-version", async (status) => {
    const message = await messageOf(invoke(failingFetch(status), SECRET));
    expect(message).toContain(String(status));
    expect(message).toContain("--kit-version");
    expect(message).not.toContain(SECRET);
  });

  it("500 mentions the status", async () => {
    const message = await messageOf(invoke(failingFetch(500), SECRET));
    expect(message).toContain("500");
    expect(message).toContain(what);
    expect(message).not.toContain(SECRET);
  });

  it("a network failure says GitHub could not be reached", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("getaddrinfo ENOTFOUND api.github.com");
    };
    const message = await messageOf(invoke(fetch, SECRET));
    expect(message).toContain("Could not reach GitHub");
    expect(message).toContain("ENOTFOUND");
    expect(message).not.toContain(SECRET);
  });
});

describe.each(calls)("HTTP error wording in $label", ({ invoke }) => {
  it.each([
    [401, null],
    [401, SECRET],
    [403, null],
    [403, SECRET],
    [429, null],
    [429, SECRET],
    [500, null],
    [500, SECRET],
  ])("%i (token %s) does not hint at a private repo", async (status, token) => {
    const message = await messageOf(invoke(failingFetch(status), token));
    expect(message).not.toContain("may be private");
  });

  it.each([null, SECRET])(
    "500 (token %s) does not suggest --kit-version",
    async (token) => {
      const message = await messageOf(invoke(failingFetch(500), token));
      expect(message).not.toContain("--kit-version");
    },
  );

  it.each([null, SECRET])(
    "401 (token %s) does not mention a rate limit",
    async (token) => {
      const message = await messageOf(invoke(failingFetch(401), token));
      expect(message).not.toContain("rate limit");
    },
  );

  it("404 with a token mentions the token", async () => {
    const message = await messageOf(invoke(failingFetch(404), SECRET));
    expect(message).toContain("token");
    expect(message).not.toContain(SECRET);
  });
});

describe("HTTP errors on a later tag page", () => {
  it("a failing second page is reported", async () => {
    const { fetch } = fakeFetch({
      [TAGS_PAGE_1]: jsonResponse(tagPage("a", 100)),
      [TAGS_PAGE_2]: statusResponse(500),
    });
    const message = await messageOf(fetchTagNames({ fetch, token: null }));
    expect(message).toContain("500");
  });
});
