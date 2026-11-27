export type HttpFile = {
  field: string;
  name: string;
  type: string;
  bytes: Uint8Array;
  fields: Record<string, string>;
};

export type HttpRequest = {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  json?: unknown;
  file?: HttpFile;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string[]>;
  body: Uint8Array;
};

export type HttpClient = (request: HttpRequest) => Promise<HttpResponse>;

export type ScenarioOptions = {
  http: HttpClient;
  appUrl: string;
  relayUrl: string;
  email: string;
  password: string;
  log: (message: string) => void;
};

export const INVITEE_EMAIL = "egress-member@example.com";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const RELAY_TIMEOUT_MS = 60_000;
const RELAY_POLL_MS = 2_000;
const BODY_EXCERPT_LENGTH = 300;

type RelayMessages = { messages?: { To?: { Address?: string }[] }[] };

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function bodyText(response: HttpResponse): string {
  return new TextDecoder().decode(response.body);
}

function expectStatus(
  step: string,
  response: HttpResponse,
  expected: number,
): void {
  if (response.status !== expected) {
    const excerpt = bodyText(response).slice(0, BODY_EXCERPT_LENGTH);
    throw new Error(
      `${step} returned ${response.status} (expected ${expected}): ${excerpt}`,
    );
  }
}

function cookieHeader(response: HttpResponse): string {
  const cookies = response.headers["set-cookie"] ?? [];
  return cookies
    .map((cookie) => cookie.split(";")[0].trim())
    .filter((pair) => pair.includes("="))
    .join("; ");
}

async function signIn(options: ScenarioOptions): Promise<string> {
  const response = await options.http({
    method: "POST",
    url: `${options.appUrl}/api/auth/sign-in/email`,
    headers: { origin: options.appUrl },
    json: { email: options.email, password: options.password },
  });
  expectStatus("sign-in", response, 200);
  const cookie = cookieHeader(response);
  if (!cookie) {
    throw new Error("sign-in returned 200 without a session cookie");
  }
  return cookie;
}

async function invite(options: ScenarioOptions, cookie: string): Promise<void> {
  const response = await options.http({
    method: "POST",
    url: `${options.appUrl}/api/auth/organization/invite-member`,
    headers: { origin: options.appUrl, cookie },
    json: { email: INVITEE_EMAIL, role: "member" },
  });
  expectStatus("invite", response, 200);
}

function relayHasMailFor(response: HttpResponse, address: string): boolean {
  const parsed = JSON.parse(bodyText(response)) as RelayMessages;
  return (parsed.messages ?? []).some((message) =>
    (message.To ?? []).some((recipient) => recipient.Address === address),
  );
}

async function waitForInvitationMail(options: ScenarioOptions): Promise<void> {
  const deadline = Date.now() + RELAY_TIMEOUT_MS;
  let last: HttpResponse | undefined;
  while (Date.now() <= deadline) {
    last = await options.http({
      method: "GET",
      url: `${options.relayUrl}/api/v1/messages`,
    });
    if (last.status === 200 && relayHasMailFor(last, INVITEE_EMAIL)) {
      return;
    }
    await sleep(RELAY_POLL_MS);
  }
  const excerpt = last ? bodyText(last).slice(0, BODY_EXCERPT_LENGTH) : "";
  throw new Error(
    `relay returned ${last?.status ?? "nothing"} without a mail to ${INVITEE_EMAIL} within 60 s: ${excerpt}`,
  );
}

async function upload(
  options: ScenarioOptions,
  cookie: string,
): Promise<string> {
  const response = await options.http({
    method: "POST",
    url: `${options.appUrl}/api/uploads`,
    headers: { origin: options.appUrl, cookie },
    file: {
      field: "file",
      name: "egress-check.png",
      type: "image/png",
      bytes: Buffer.from(ONE_PIXEL_PNG, "base64"),
      fields: { purpose: "editor-image" },
    },
  });
  expectStatus("upload", response, 201);
  const { id } = JSON.parse(bodyText(response)) as { id?: string };
  if (!id) {
    throw new Error(
      `upload returned 201 without an id: ${bodyText(response).slice(0, BODY_EXCERPT_LENGTH)}`,
    );
  }
  return id;
}

async function download(
  options: ScenarioOptions,
  cookie: string,
  id: string,
): Promise<void> {
  const response = await options.http({
    method: "GET",
    url: `${options.appUrl}/api/uploads/${id}`,
    headers: { cookie },
  });
  expectStatus("download", response, 200);
  const contentType = response.headers["content-type"]?.[0] ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(
      `download returned 200 with content-type "${contentType}" instead of an image`,
    );
  }
}

export async function runScenario(options: ScenarioOptions): Promise<void> {
  options.log("signing in as the admin");
  const cookie = await signIn(options);
  options.log(`inviting ${INVITEE_EMAIL}`);
  await invite(options, cookie);
  options.log("waiting for the invitation in the relay");
  await waitForInvitationMail(options);
  options.log("uploading an image");
  const id = await upload(options, cookie);
  options.log(`downloading upload ${id}`);
  await download(options, cookie, id);
}
