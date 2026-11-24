// @vitest-environment node
import { fc, test } from "@fast-check/vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkTelemetry,
  dockerfileStageEnv,
  findAnalyticsPackages,
  findHardcodedAnalyticsIds,
} from "../../../scripts/lib/architecture/telemetry";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const BUILDER_NEXT = "ENV NEXT_TELEMETRY_DISABLED=1";
const BUILDER_CHECKPOINT = "ENV CHECKPOINT_DISABLE=1";
const RUNNER_NEXT = "ENV NEXT_TELEMETRY_DISABLED=1";
const RUNNER_CHECKPOINT = "ENV CHECKPOINT_DISABLE=1";

const dockerfileText = ({
  builder = [BUILDER_NEXT, BUILDER_CHECKPOINT],
  runner = [RUNNER_NEXT, RUNNER_CHECKPOINT],
}: { builder?: string[]; runner?: string[] } = {}) =>
  [
    "FROM node:22-alpine AS base",
    "",
    "FROM base AS deps",
    "WORKDIR /app",
    "ENV DEPS_ONLY=1",
    "RUN npm ci --ignore-scripts",
    "",
    "FROM base AS builder",
    "WORKDIR /app",
    "COPY --from=deps /app/node_modules ./node_modules",
    ...builder,
    "RUN npx prisma generate",
    "RUN npm run build",
    "",
    "FROM base AS runner",
    "WORKDIR /app",
    "ENV NODE_ENV=production",
    ...runner,
    "ENV PORT=3000",
    'ENV HOSTNAME="0.0.0.0"',
    "COPY --from=builder /app/.next/standalone ./",
    'CMD ["node", "server.js"]',
    "",
  ].join("\n");

describe("dockerfileStageEnv", () => {
  it("returns the ENV pairs of the runner stage with quotes removed", () => {
    expect(dockerfileStageEnv(dockerfileText(), "runner")).toEqual([
      "NODE_ENV=production",
      "NEXT_TELEMETRY_DISABLED=1",
      "CHECKPOINT_DISABLE=1",
      "PORT=3000",
      "HOSTNAME=0.0.0.0",
    ]);
  });

  it("ends the builder stage at the next FROM", () => {
    expect(dockerfileStageEnv(dockerfileText(), "builder")).toEqual([
      "NEXT_TELEMETRY_DISABLED=1",
      "CHECKPOINT_DISABLE=1",
    ]);
  });

  it("does not carry ENV from an earlier stage into a later one", () => {
    expect(
      dockerfileStageEnv(dockerfileText({ runner: [] }), "runner"),
    ).toEqual(["NODE_ENV=production", "PORT=3000", "HOSTNAME=0.0.0.0"]);
  });

  it("does not take ENV from a later stage", () => {
    expect(
      dockerfileStageEnv(dockerfileText({ builder: [] }), "builder"),
    ).toEqual([]);
  });

  it("ends a stage at the FROM right after it, not a later one", () => {
    expect(
      dockerfileStageEnv(
        [
          "FROM base AS builder",
          "ENV A=1",
          "FROM base AS runner",
          "ENV B=2",
          "FROM base AS final",
          "ENV C=3",
        ].join("\n"),
        "builder",
      ),
    ).toEqual(["A=1"]);
  });

  it("reads the last stage to the end of the file", () => {
    expect(
      dockerfileStageEnv(
        "FROM base AS builder\nENV A=1\nFROM base AS runner\nENV B=2\nENV C=3",
        "runner",
      ),
    ).toEqual(["B=2", "C=3"]);
  });

  it("accepts a lowercase as", () => {
    expect(
      dockerfileStageEnv(
        "FROM base AS builder\nENV A=1\nFROM base as runner\nENV B=2\n",
        "runner",
      ),
    ).toEqual(["B=2"]);
  });

  it("accepts a FROM with a platform flag", () => {
    expect(
      dockerfileStageEnv(
        "FROM --platform=$BUILDPLATFORM node:22-alpine AS builder\nENV A=1\n",
        "builder",
      ),
    ).toEqual(["A=1"]);
  });

  it("returns every pair of a multi-pair ENV line", () => {
    expect(
      dockerfileStageEnv(
        "FROM base AS runner\nENV NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1\n",
        "runner",
      ),
    ).toEqual(["NEXT_TELEMETRY_DISABLED=1", "CHECKPOINT_DISABLE=1"]);
  });

  it("does not confuse a stage with one whose name starts the same", () => {
    expect(
      dockerfileStageEnv(
        "FROM base AS runner-debug\nENV DEBUG=1\nFROM base AS runner\nENV B=2\n",
        "runner",
      ),
    ).toEqual(["B=2"]);
  });

  it("does not start a stage at a COPY --from line", () => {
    expect(
      dockerfileStageEnv(
        "FROM base AS builder\nENV A=1\nFROM base AS runner\nCOPY --from=builder /app ./\nENV B=2\n",
        "builder",
      ),
    ).toEqual(["A=1"]);
  });

  it("returns an empty list for an unknown stage", () => {
    expect(dockerfileStageEnv(dockerfileText(), "release")).toEqual([]);
  });

  it("returns an empty list for a Dockerfile without stages", () => {
    expect(dockerfileStageEnv("", "runner")).toEqual([]);
  });
});

describe("findAnalyticsPackages", () => {
  it("finds a denied package among regular dependencies", () => {
    expect(
      findAnalyticsPackages({
        dependencies: { "@vercel/analytics": "^1.0.0", zod: "^4" },
      }),
    ).toEqual(["@vercel/analytics"]);
  });

  it.each([
    "@vercel/analytics",
    "@vercel/speed-insights",
    "posthog-js",
    "posthog-node",
    "mixpanel-browser",
    "@segment/analytics-next",
    "@amplitude/analytics-browser",
    "react-ga4",
    "@hotjar/browser",
  ])("denies %s", (name) => {
    expect(
      findAnalyticsPackages({ dependencies: { [name]: "1.0.0" } }),
    ).toEqual([name]);
  });

  it.each([
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ])("checks the %s section", (section) => {
    expect(
      findAnalyticsPackages({ [section]: { "posthog-js": "^1.0.0" } }),
    ).toEqual(["posthog-js"]);
  });

  it.each([
    "posthog-js-lite",
    "@vercel/analytics-extra",
    "react-ga4x",
    "my-posthog-js",
    "@acme/posthog-node",
    "posthog",
    "@vercel/analytic",
    "vercel-analytics",
  ])("does not deny %s, which only resembles a denied name", (name) => {
    expect(
      findAnalyticsPackages({ dependencies: { [name]: "1.0.0" } }),
    ).toEqual([]);
  });

  it("does not look at sections other than the four dependency lists", () => {
    expect(
      findAnalyticsPackages({
        name: "posthog-js",
        overrides: { "posthog-js": "1.0.0" },
        bundleDependencies: ["react-ga4"],
        scripts: { "react-ga4": "echo" },
      }),
    ).toEqual([]);
  });

  it("reports a package listed in two sections once", () => {
    expect(
      findAnalyticsPackages({
        dependencies: { "posthog-js": "^1.0.0" },
        devDependencies: { "posthog-js": "^1.0.0" },
      }),
    ).toEqual(["posthog-js"]);
  });

  it("orders the result by the deny list", () => {
    expect(
      findAnalyticsPackages({
        dependencies: { "@hotjar/browser": "1", "react-ga4": "1" },
        devDependencies: { "posthog-js": "1", "@vercel/analytics": "1" },
      }),
    ).toEqual([
      "@vercel/analytics",
      "posthog-js",
      "react-ga4",
      "@hotjar/browser",
    ]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "posthog-js"],
    ["a number", 1],
    ["an array", ["posthog-js"]],
    ["an empty object", {}],
  ])("returns an empty list for %s", (_case, input) => {
    expect(findAnalyticsPackages(input)).toEqual([]);
  });

  it("tolerates sections that are not objects", () => {
    expect(
      findAnalyticsPackages({
        dependencies: null,
        devDependencies: "posthog-js",
        optionalDependencies: ["posthog-js"],
        peerDependencies: { "react-ga4": "1" },
      }),
    ).toEqual(["react-ga4"]);
  });
});

describe("findHardcodedAnalyticsIds", () => {
  it("finds a Google Analytics 4 id", () => {
    expect(findHardcodedAnalyticsIds('gtag("config", "G-ABC123XYZ9")')).toEqual(
      ["G-ABC123XYZ9"],
    );
  });

  it("finds a Tag Manager id", () => {
    expect(findHardcodedAnalyticsIds('const id = "GTM-AB12CD3";')).toEqual([
      "GTM-AB12CD3",
    ]);
  });

  it("finds a Universal Analytics id", () => {
    expect(findHardcodedAnalyticsIds('const id = "UA-12345678-1";')).toEqual([
      "UA-12345678-1",
    ]);
  });

  it("finds a Google Ads id", () => {
    expect(findHardcodedAnalyticsIds('const id = "AW-123456789";')).toEqual([
      "AW-123456789",
    ]);
  });

  it("finds a PostHog project key", () => {
    const key = "phc_aB3dE5gH7jK9mN1pQ3sT5vX7zA9cE1gI3kM5oQ7sU9w";

    expect(findHardcodedAnalyticsIds(`posthog.init("${key}")`)).toEqual([key]);
  });

  it.each([
    ["G-Suite", "Sign in with G-Suite"],
    ["G-force", "a G-force reading"],
    ["GTM-", 'const prefix = "GTM-";'],
    ["UA-", 'const prefix = "UA-";'],
    ["AW-", 'const prefix = "AW-";'],
    ["phc_", 'const prefix = "phc_";'],
  ])("does not report %s", (_case, source) => {
    expect(findHardcodedAnalyticsIds(source)).toEqual([]);
  });

  it.each([
    ["G- with 8 characters", "G-ABC123XY"],
    ["GTM- with 5 characters", "GTM-AB12C"],
    ["UA- with 3 digits", "UA-123-1"],
    ["AW- with 8 digits", "AW-12345678"],
    ["phc_ with 19 characters", "phc_aB3dE5gH7jK9mN1pQ3s"],
    ["a lowercase G- id", "g-abc123xyz9"],
    ["a lowercase GTM- id", "gtm-ab12cd3"],
    ["UA- without the property number", "UA-12345678"],
  ])("does not report %s", (_case, source) => {
    expect(findHardcodedAnalyticsIds(source)).toEqual([]);
  });

  it.each([
    ["G- preceded by a letter", "XG-ABC123XYZ9"],
    ["G- followed by a lowercase letter", "G-ABC123XYZ9a"],
    ["GTM- preceded by a letter", "XGTM-AB12CD3"],
    ["GTM- followed by a lowercase letter", "GTM-AB12CD3x"],
    ["UA- preceded by a letter", "XUA-12345678-1"],
    ["UA- followed by a letter", "UA-12345678-1x"],
    ["AW- preceded by a letter", "XAW-123456789"],
    ["AW- followed by a letter", "AW-123456789x"],
    ["phc_ preceded by a letter", "xphc_aB3dE5gH7jK9mN1pQ3sT5"],
    ["phc_ followed by an underscore", "phc_aB3dE5gH7jK9mN1pQ3sT5_"],
  ])("does not report %s", (_case, source) => {
    expect(findHardcodedAnalyticsIds(source)).toEqual([]);
  });

  it("reports every id of one kind in source order", () => {
    expect(
      findHardcodedAnalyticsIds('["G-ZZZZZZZZZ9", "G-AAAAAAAAA1"]'),
    ).toEqual(["G-ZZZZZZZZZ9", "G-AAAAAAAAA1"]);
  });

  it("reports ids of every kind found in one source", () => {
    const key = "phc_aB3dE5gH7jK9mN1pQ3sT5vX";
    const found = findHardcodedAnalyticsIds(
      `UA-12345678-1 ${key} AW-123456789 GTM-AB12CD3 G-ABC123XYZ9`,
    );

    expect([...found].sort()).toEqual([
      "AW-123456789",
      "G-ABC123XYZ9",
      "GTM-AB12CD3",
      "UA-12345678-1",
      key,
    ]);
  });

  it("returns an empty list for source without ids", () => {
    expect(findHardcodedAnalyticsIds("export const a = 1;")).toEqual([]);
  });

  const upperAlnum = fc.constantFrom(
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(""),
  );
  const anyAlnum = fc.constantFrom(
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(
      "",
    ),
  );

  test.prop([fc.string({ unit: upperAlnum, minLength: 9, maxLength: 20 })])(
    "a G- id with 9 to 20 characters between spaces is found exactly",
    (body) => {
      expect(findHardcodedAnalyticsIds(`id G-${body} end`)).toEqual([
        `G-${body}`,
      ]);
    },
  );

  test.prop([fc.string({ unit: upperAlnum, minLength: 1, maxLength: 8 })])(
    "a G- id with fewer than 9 characters is never found",
    (body) => {
      expect(findHardcodedAnalyticsIds(`id G-${body} end`)).toEqual([]);
    },
  );

  test.prop([fc.string({ unit: upperAlnum, minLength: 6, maxLength: 20 })])(
    "a GTM- id with 6 to 20 characters between spaces is found exactly",
    (body) => {
      expect(findHardcodedAnalyticsIds(`id GTM-${body} end`)).toEqual([
        `GTM-${body}`,
      ]);
    },
  );

  test.prop([fc.string({ unit: anyAlnum, minLength: 20, maxLength: 50 })])(
    "a phc_ key with 20 to 50 characters between spaces is found exactly",
    (body) => {
      expect(findHardcodedAnalyticsIds(`id phc_${body} end`)).toEqual([
        `phc_${body}`,
      ]);
    },
  );

  test.prop([
    fc.string({ unit: upperAlnum, minLength: 9, maxLength: 20 }),
    anyAlnum,
  ])(
    "a G- id glued to a preceding word character is never found",
    (body, before) => {
      expect(findHardcodedAnalyticsIds(`id ${before}G-${body} end`)).toEqual(
        [],
      );
    },
  );
});

describe("checkTelemetry", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const cleanRepo = () => {
    write("Dockerfile", dockerfileText());
    write(
      "package.json",
      JSON.stringify({ dependencies: { next: "16" }, devDependencies: {} }),
    );
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "telemetry-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("accepts a repository with telemetry off and no analytics", () => {
    cleanRepo();

    expect(checkTelemetry(root)).toEqual([]);
  });

  it("reports NEXT_TELEMETRY_DISABLED removed from runner only", () => {
    cleanRepo();
    write("Dockerfile", dockerfileText({ runner: [RUNNER_CHECKPOINT] }));

    expect(checkTelemetry(root)).toEqual([
      "Dockerfile runner: NEXT_TELEMETRY_DISABLED=1 missing",
    ]);
  });

  it("reports CHECKPOINT_DISABLE removed from runner only", () => {
    cleanRepo();
    write("Dockerfile", dockerfileText({ runner: [RUNNER_NEXT] }));

    expect(checkTelemetry(root)).toEqual([
      "Dockerfile runner: CHECKPOINT_DISABLE=1 missing",
    ]);
  });

  it("reports NEXT_TELEMETRY_DISABLED removed from builder only", () => {
    cleanRepo();
    write("Dockerfile", dockerfileText({ builder: [BUILDER_CHECKPOINT] }));

    expect(checkTelemetry(root)).toEqual([
      "Dockerfile builder: NEXT_TELEMETRY_DISABLED=1 missing",
    ]);
  });

  it("reports CHECKPOINT_DISABLE removed from builder only", () => {
    cleanRepo();
    write("Dockerfile", dockerfileText({ builder: [BUILDER_NEXT] }));

    expect(checkTelemetry(root)).toEqual([
      "Dockerfile builder: CHECKPOINT_DISABLE=1 missing",
    ]);
  });

  it("reports every missing variable, builder first, NEXT_TELEMETRY_DISABLED first", () => {
    cleanRepo();
    write("Dockerfile", dockerfileText({ builder: [], runner: [] }));

    expect(checkTelemetry(root)).toEqual([
      "Dockerfile builder: NEXT_TELEMETRY_DISABLED=1 missing",
      "Dockerfile builder: CHECKPOINT_DISABLE=1 missing",
      "Dockerfile runner: NEXT_TELEMETRY_DISABLED=1 missing",
      "Dockerfile runner: CHECKPOINT_DISABLE=1 missing",
    ]);
  });

  it("does not accept a variable set to a value other than 1", () => {
    cleanRepo();
    write(
      "Dockerfile",
      dockerfileText({
        runner: ["ENV NEXT_TELEMETRY_DISABLED=0", RUNNER_CHECKPOINT],
      }),
    );

    expect(checkTelemetry(root)).toEqual([
      "Dockerfile runner: NEXT_TELEMETRY_DISABLED=1 missing",
    ]);
  });

  it("does not accept the variables from the deps stage for builder", () => {
    cleanRepo();
    write(
      "Dockerfile",
      dockerfileText({ builder: [] }).replace(
        "ENV DEPS_ONLY=1",
        "ENV NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1",
      ),
    );

    expect(checkTelemetry(root)).toEqual([
      "Dockerfile builder: NEXT_TELEMETRY_DISABLED=1 missing",
      "Dockerfile builder: CHECKPOINT_DISABLE=1 missing",
    ]);
  });

  it("reports an analytics package in the root package.json", () => {
    cleanRepo();
    write(
      "package.json",
      JSON.stringify({
        dependencies: { next: "16", "@vercel/speed-insights": "1" },
        devDependencies: { "posthog-node": "4" },
      }),
    );

    expect(checkTelemetry(root)).toEqual([
      "package.json: @vercel/speed-insights",
      "package.json: posthog-node",
    ]);
  });

  it("skips kit/modules/core.json when it does not exist", () => {
    cleanRepo();

    expect(() => checkTelemetry(root)).not.toThrow();
    expect(checkTelemetry(root)).toEqual([]);
  });

  it("reports an analytics package in kit/modules/core.json after package.json", () => {
    cleanRepo();
    write(
      "package.json",
      JSON.stringify({ dependencies: { "react-ga4": "2" } }),
    );
    write(
      "kit/modules/core.json",
      JSON.stringify({
        name: "core",
        dependencies: { "mixpanel-browser": "2" },
        devDependencies: { "@segment/analytics-next": "1" },
      }),
    );

    expect(checkTelemetry(root)).toEqual([
      "package.json: react-ga4",
      "kit/modules/core.json: mixpanel-browser",
      "kit/modules/core.json: @segment/analytics-next",
    ]);
  });

  it("reports hard-coded ids by file code point, in source order within a file", () => {
    cleanRepo();
    write("src/a/analytics.ts", 'export const ids = ["UA-12345678-1"];\n');
    write(
      "src/a-b/analytics.tsx",
      'export const a = "GTM-AB12CD3";\nexport const b = "GTM-ZZ99YY8";\n',
    );

    expect(checkTelemetry(root)).toEqual([
      "src/a-b/analytics.tsx: GTM-AB12CD3",
      "src/a-b/analytics.tsx: GTM-ZZ99YY8",
      "src/a/analytics.ts: UA-12345678-1",
    ]);
  });

  it("skips tests, node_modules, non-TypeScript files and files outside src", () => {
    cleanRepo();
    write("src/__tests__/ids.ts", 'const id = "G-ABC123XYZ9";\n');
    write("src/app/__tests__/ids.tsx", 'const id = "G-ABC123XYZ9";\n');
    write("src/app/ids.test.ts", 'const id = "G-ABC123XYZ9";\n');
    write("src/app/ids.test.tsx", 'const id = "G-ABC123XYZ9";\n');
    write("src/node_modules/pkg/index.ts", 'const id = "G-ABC123XYZ9";\n');
    write("src/app/ids.md", "G-ABC123XYZ9\n");
    write("scripts/ids.ts", 'const id = "G-ABC123XYZ9";\n');

    expect(checkTelemetry(root)).toEqual([]);
  });

  it("scans a file whose name only contains test", () => {
    cleanRepo();
    write("src/app/latest.ts", 'const id = "AW-123456789";\n');

    expect(checkTelemetry(root)).toEqual(["src/app/latest.ts: AW-123456789"]);
  });

  it("lists Dockerfile, then packages, then ids", () => {
    write("Dockerfile", dockerfileText({ runner: [RUNNER_NEXT] }));
    write(
      "package.json",
      JSON.stringify({ optionalDependencies: { "@hotjar/browser": "1" } }),
    );
    write(
      "kit/modules/core.json",
      JSON.stringify({
        peerDependencies: { "@amplitude/analytics-browser": "1" },
      }),
    );
    write("src/app/layout.tsx", 'const key = "G-ABC123XYZ9";\n');

    expect(checkTelemetry(root)).toEqual([
      "Dockerfile runner: CHECKPOINT_DISABLE=1 missing",
      "package.json: @hotjar/browser",
      "kit/modules/core.json: @amplitude/analytics-browser",
      "src/app/layout.tsx: G-ABC123XYZ9",
    ]);
  });
});

describe("repo", () => {
  it("the Dockerfile disables telemetry and nothing ships analytics", () => {
    expect(checkTelemetry(repoRoot)).toEqual([]);
  });

  it("the runner stage of the real Dockerfile turns both telemetry switches off", () => {
    const env = dockerfileStageEnv(
      fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8"),
      "runner",
    );

    expect(env).toContain("NEXT_TELEMETRY_DISABLED=1");
    expect(env).toContain("CHECKPOINT_DISABLE=1");
  });
});
