import { highestSemverTag } from "./kit-version.js";

export const KIT_REPO = "webamigos/gatojs";

export type HttpResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<HttpResponse>;

const TAGS_PAGE_SIZE = 100;

export class GitHubTokenRejectedError extends Error {
  name = "GitHubTokenRejectedError";
}

export function githubHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "create-gato-app",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function tagsUrl(page: number): string {
  return `https://api.github.com/repos/${KIT_REPO}/tags?per_page=${TAGS_PAGE_SIZE}&page=${page}`;
}

export function tarballUrl(version: string, token: string | null): string {
  return token === null
    ? `https://codeload.github.com/${KIT_REPO}/tar.gz/refs/tags/v${version}`
    : `https://api.github.com/repos/${KIT_REPO}/tarball/refs/tags/v${version}`;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function resolveToken(input: {
  env: Record<string, string | undefined>;
  ghAuthToken: () => Promise<string | null>;
}): Promise<string | null> {
  const fromEnv =
    nonEmpty(input.env.GITHUB_TOKEN) ?? nonEmpty(input.env.GH_TOKEN);
  if (fromEnv !== null) {
    return fromEnv;
  }
  try {
    return nonEmpty(await input.ghAuthToken());
  } catch {
    return null;
  }
}

function httpErrorMessage(
  status: number,
  what: string,
  token: string | null,
): string {
  const prefix = `GitHub returned ${status} for ${what}.`;
  if (status === 404 && token === null) {
    return `${prefix} Either it does not exist, or the repository ${KIT_REPO} may be private: set GITHUB_TOKEN (or GH_TOKEN) to a token with access, or log in with "gh auth login".`;
  }
  if (status === 404) {
    return `${prefix} Check that the version exists and that your token can read ${KIT_REPO}.`;
  }
  if (status === 401) {
    return `${prefix} GitHub rejected the token: check GITHUB_TOKEN / GH_TOKEN or "gh auth status".`;
  }
  if (status === 403 || status === 429) {
    return `${prefix} This is a rate limit or missing access: set GITHUB_TOKEN, or pass --kit-version <x.y.z>.`;
  }
  return prefix;
}

async function request(
  fetch: FetchLike,
  url: string,
  token: string | null,
  what: string,
): Promise<HttpResponse> {
  let response: HttpResponse;
  try {
    response = await fetch(url, { headers: githubHeaders(token) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach GitHub for ${what}: ${detail}`, {
      cause: error,
    });
  }
  if (response.status === 401 && token !== null) {
    throw new GitHubTokenRejectedError(
      httpErrorMessage(response.status, what, token),
    );
  }
  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status, what, token));
  }
  return response;
}

function tagNamesOf(page: unknown): string[] {
  if (!Array.isArray(page)) {
    throw new Error("GitHub returned an unexpected tag list");
  }
  return page.map((tag: unknown) => {
    const name = (tag as { name?: unknown } | null)?.name;
    if (typeof name !== "string") {
      throw new Error("GitHub returned an unexpected tag list");
    }
    return name;
  });
}

export async function fetchTagNames(input: {
  fetch: FetchLike;
  token: string | null;
}): Promise<string[]> {
  const names: string[] = [];
  for (let page = 1; ; page += 1) {
    const response = await request(
      input.fetch,
      tagsUrl(page),
      input.token,
      "the tag list",
    );
    const pageNames = tagNamesOf(await response.json());
    names.push(...pageNames);
    if (pageNames.length < TAGS_PAGE_SIZE) {
      return names;
    }
  }
}

export async function resolveKitVersion(input: {
  requested: string | null;
  fetch: FetchLike;
  token: string | null;
}): Promise<string> {
  if (input.requested !== null) {
    return input.requested;
  }
  const highest = highestSemverTag(await fetchTagNames(input));
  if (highest === null) {
    throw new Error(
      `No v<x.y.z> tag found in ${KIT_REPO}; pass --kit-version <x.y.z> or --kit <path>.`,
    );
  }
  return highest;
}

export async function fetchKitTarball(input: {
  fetch: FetchLike;
  token: string | null;
  version: string;
}): Promise<Uint8Array> {
  const response = await request(
    input.fetch,
    tarballUrl(input.version, input.token),
    input.token,
    `kit v${input.version}`,
  );
  return new Uint8Array(await response.arrayBuffer());
}

export function packageJsonUrl(version: string): string {
  throw new Error(`not implemented: ${version}`);
}

export async function fetchKitPackageJson(input: {
  fetch: FetchLike;
  token: string | null;
  version: string;
}): Promise<unknown> {
  throw new Error(`not implemented: ${input.version}`);
}
