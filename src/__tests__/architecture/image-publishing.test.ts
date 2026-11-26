// @vitest-environment node
import { fc, test } from "@fast-check/vitest";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { checkPublishWorkflow } from "../../../scripts/lib/architecture/image-publishing";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const PULL_REQUEST_ISSUE =
  "docker-publish.yml: must not run on pull_request; it pushes images";
const RUNNERS_ISSUE =
  "docker-publish.yml: both ubuntu-latest and ubuntu-24.04-arm are required";
const LOWERCASE_ISSUE =
  "docker-publish.yml: lowercase the image name before pushing";
const PROVENANCE_ISSUE =
  "docker-publish.yml: docker/build-push-action needs provenance: mode=max";
const SBOM_ISSUE =
  "docker-publish.yml: docker/build-push-action needs sbom: true";
const PERMISSIONS_ISSUE =
  "docker-publish.yml: grant packages: write per job, not to the whole workflow";

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Job {
  "runs-on": string;
  needs?: string;
  strategy?: { matrix: Record<string, unknown> };
  permissions?: Record<string, string>;
  steps: Step[];
}

interface Workflow {
  name: string;
  on: unknown;
  permissions?: unknown;
  env?: Record<string, string>;
  concurrency: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const LOWERCASE_RUN =
  'echo "IMAGE=ghcr.io/${GITHUB_REPOSITORY,,}" >> "$GITHUB_ENV"';

function buildPushStep(): Step {
  return {
    name: "Build and push by digest",
    uses: "docker/build-push-action@v7",
    with: {
      platforms: "${{ matrix.platform }}",
      outputs:
        "type=image,name=${{ env.IMAGE }},push-by-digest=true,name-canonical=true,push=true",
      provenance: "mode=max",
      sbom: true,
    },
  };
}

function validWorkflow(): Workflow {
  return {
    name: "Publish image",
    on: {
      push: { branches: ["main"], tags: ["v*"] },
      workflow_dispatch: null,
    },
    permissions: { contents: "read" },
    concurrency: {
      group: "docker-publish-${{ github.ref }}",
      "cancel-in-progress": false,
    },
    jobs: {
      build: {
        "runs-on": "${{ matrix.runner }}",
        strategy: {
          matrix: {
            include: [
              { runner: "ubuntu-latest", platform: "linux/amd64" },
              { runner: "ubuntu-24.04-arm", platform: "linux/arm64" },
            ],
          },
        },
        permissions: { contents: "read", packages: "write" },
        steps: [
          { uses: "actions/checkout@v5" },
          { name: "Lowercase the image name", run: LOWERCASE_RUN },
          { uses: "docker/setup-buildx-action@v3" },
          buildPushStep(),
        ],
      },
    },
  };
}

function buildJob(workflow: Workflow): Job {
  return workflow.jobs.build;
}

function lowercaseStep(workflow: Workflow): Step {
  return buildJob(workflow).steps[1];
}

function buildPushWith(workflow: Workflow): Record<string, unknown> {
  const step = buildJob(workflow).steps[3];
  expect(step.uses).toBe("docker/build-push-action@v7");
  return step.with ?? {};
}

function check(workflow: Workflow): string[] {
  return checkPublishWorkflow(stringify(workflow));
}

const handWrittenBody = [
  "permissions:",
  "  contents: read",
  "jobs:",
  "  build:",
  "    runs-on: ${{ matrix.runner }}",
  "    strategy:",
  "      matrix:",
  "        include:",
  "          - runner: ubuntu-latest",
  "            platform: linux/amd64",
  "          - runner: ubuntu-24.04-arm",
  "            platform: linux/arm64",
  "    permissions:",
  "      contents: read",
  "      packages: write",
  "    steps:",
  "      - uses: actions/checkout@v5",
  "      - name: Lowercase the image name",
  "        run: |",
  '          echo "IMAGE=ghcr.io/${GITHUB_REPOSITORY,,}" >> "$GITHUB_ENV"',
  "      - uses: docker/build-push-action@v7",
  "        with:",
  "          platforms: ${{ matrix.platform }}",
  "          provenance: mode=max",
  "          sbom: true",
  "",
];

function handWritten(onLines: string[]): string {
  return ["name: Publish image", ...onLines, ...handWrittenBody].join("\n");
}

describe("checkPublishWorkflow on the repository workflow", () => {
  it("returns no issues for .github/workflows/docker-publish.yml", () => {
    const text = fs.readFileSync(
      path.join(repoRoot, ".github/workflows/docker-publish.yml"),
      "utf8",
    );
    expect(checkPublishWorkflow(text)).toEqual([]);
  });
});

describe("checkPublishWorkflow valid workflows", () => {
  it("returns no issues for a push and workflow_dispatch workflow built on both runners", () => {
    expect(check(validWorkflow())).toEqual([]);
  });

  it("reads a hand-written workflow with an on mapping whose keys have no value", () => {
    expect(
      checkPublishWorkflow(
        handWritten([
          "on:",
          "  push:",
          "    branches: [main]",
          '    tags: ["v*"]',
          "  workflow_dispatch:",
        ]),
      ),
    ).toEqual([]);
  });

  it("skips a hand-written job with no value next to a valid build job", () => {
    expect(
      checkPublishWorkflow(`${handWritten(["on: push"])}  placeholder:\n`),
    ).toEqual([]);
  });

  it("skips a hand-written empty step entry in an otherwise valid build job", () => {
    expect(
      checkPublishWorkflow(`${handWritten(["on: push"])}      -\n`),
    ).toEqual([]);
  });

  it("accepts the runners as a plain matrix list", () => {
    const workflow = validWorkflow();
    buildJob(workflow).strategy = {
      matrix: { runner: ["ubuntu-latest", "ubuntu-24.04-arm"] },
    };
    expect(check(workflow)).toEqual([]);
  });

  it("accepts the two runners spread over the matrices of two jobs", () => {
    const workflow = validWorkflow();
    buildJob(workflow).strategy = {
      matrix: { include: [{ runner: "ubuntu-latest" }] },
    };
    workflow.jobs.arm = {
      "runs-on": "${{ matrix.runner }}",
      strategy: { matrix: { runner: ["ubuntu-24.04-arm"] } },
      steps: [{ run: "true" }],
    };
    expect(check(workflow)).toEqual([]);
  });

  it("accepts a tr [:upper:] [:lower:] conversion of the image name", () => {
    const workflow = validWorkflow();
    lowercaseStep(workflow).run =
      'echo "IMAGE=ghcr.io/$(echo "$GITHUB_REPOSITORY" | tr \'[:upper:]\' \'[:lower:]\')" >> "$GITHUB_ENV"';
    expect(check(workflow)).toEqual([]);
  });

  it("accepts sbom given as the string true", () => {
    const workflow = validWorkflow();
    buildPushWith(workflow).sbom = "true";
    expect(check(workflow)).toEqual([]);
  });

  it("accepts docker/build-push-action pinned to a commit sha", () => {
    const workflow = validWorkflow();
    buildJob(workflow).steps[3].uses =
      "docker/build-push-action@263435318d21b8e681c14492fe198d362a7d2c83";
    expect(check(workflow)).toEqual([]);
  });

  it("accepts packages: read at workflow level", () => {
    const workflow = validWorkflow();
    workflow.permissions = { contents: "read", packages: "read" };
    expect(check(workflow)).toEqual([]);
  });

  it("accepts packages: write granted to a second job", () => {
    const workflow = validWorkflow();
    workflow.jobs.merge = {
      "runs-on": "ubuntu-latest",
      needs: "build",
      permissions: {
        contents: "read",
        packages: "write",
        "id-token": "write",
        attestations: "write",
      },
      steps: [
        {
          run: 'docker buildx imagetools create -t "$IMAGE:edge" "$IMAGE@$DIGEST"',
        },
      ],
    };
    expect(check(workflow)).toEqual([]);
  });

  test.prop([
    fc.dictionary(
      fc.stringMatching(/^[A-Z][A-Z0-9_]{0,12}$/),
      fc.stringMatching(/^[a-z0-9 ./-]{0,20}$/),
    ),
  ])("stays valid with any unrelated workflow env", (env) => {
    const workflow = validWorkflow();
    workflow.env = env;
    expect(check(workflow)).toEqual([]);
  });
});

describe("checkPublishWorkflow pull_request trigger", () => {
  it("reports pull_request in the on mapping", () => {
    const workflow = validWorkflow();
    workflow.on = {
      push: { branches: ["main"], tags: ["v*"] },
      workflow_dispatch: null,
      pull_request: null,
    };
    expect(check(workflow)).toEqual([PULL_REQUEST_ISSUE]);
  });

  it("reports pull_request with its own branch filter", () => {
    const workflow = validWorkflow();
    workflow.on = {
      push: { branches: ["main"] },
      pull_request: { branches: ["main"] },
    };
    expect(check(workflow)).toEqual([PULL_REQUEST_ISSUE]);
  });

  it("reports pull_request_target in the on mapping", () => {
    const workflow = validWorkflow();
    workflow.on = {
      push: { branches: ["main"], tags: ["v*"] },
      pull_request_target: { branches: ["main"] },
    };
    expect(check(workflow)).toEqual([PULL_REQUEST_ISSUE]);
  });

  it("reports on given as the string pull_request", () => {
    const workflow = validWorkflow();
    workflow.on = "pull_request";
    expect(check(workflow)).toEqual([PULL_REQUEST_ISSUE]);
  });

  it("reports on given as the string pull_request_target", () => {
    const workflow = validWorkflow();
    workflow.on = "pull_request_target";
    expect(check(workflow)).toEqual([PULL_REQUEST_ISSUE]);
  });

  it("reports on given as an array with pull_request", () => {
    const workflow = validWorkflow();
    workflow.on = ["push", "pull_request"];
    expect(check(workflow)).toEqual([PULL_REQUEST_ISSUE]);
  });

  it("reports on given as an array with pull_request_target", () => {
    const workflow = validWorkflow();
    workflow.on = ["push", "pull_request_target"];
    expect(check(workflow)).toEqual([PULL_REQUEST_ISSUE]);
  });

  it("accepts on given as the string push", () => {
    const workflow = validWorkflow();
    workflow.on = "push";
    expect(check(workflow)).toEqual([]);
  });

  it("accepts on given as an array without pull requests", () => {
    const workflow = validWorkflow();
    workflow.on = ["push", "workflow_dispatch"];
    expect(check(workflow)).toEqual([]);
  });

  it("reports both pull request triggers once", () => {
    const workflow = validWorkflow();
    workflow.on = { pull_request: null, pull_request_target: null };
    expect(check(workflow)).toEqual([PULL_REQUEST_ISSUE]);
  });

  it("reports a hand-written on: pull_request line", () => {
    expect(checkPublishWorkflow(handWritten(["on: pull_request"]))).toEqual([
      PULL_REQUEST_ISSUE,
    ]);
  });

  it("reports a hand-written flow sequence on: [push, pull_request]", () => {
    expect(
      checkPublishWorkflow(handWritten(["on: [push, pull_request]"])),
    ).toEqual([PULL_REQUEST_ISSUE]);
  });

  it("reports a hand-written on mapping with a bare pull_request key", () => {
    expect(
      checkPublishWorkflow(
        handWritten([
          "on:",
          "  push:",
          "    branches: [main]",
          "  pull_request:",
        ]),
      ),
    ).toEqual([PULL_REQUEST_ISSUE]);
  });

  it("reports a hand-written on mapping with a bare pull_request_target key", () => {
    expect(
      checkPublishWorkflow(
        handWritten(["on:", "  push:", "  pull_request_target:"]),
      ),
    ).toEqual([PULL_REQUEST_ISSUE]);
  });
});

describe("checkPublishWorkflow runners", () => {
  it("reports a matrix with only ubuntu-latest", () => {
    const workflow = validWorkflow();
    buildJob(workflow).strategy = {
      matrix: {
        include: [{ runner: "ubuntu-latest", platform: "linux/amd64" }],
      },
    };
    expect(check(workflow)).toEqual([RUNNERS_ISSUE]);
  });

  it("reports a matrix with only ubuntu-24.04-arm", () => {
    const workflow = validWorkflow();
    buildJob(workflow).strategy = {
      matrix: {
        include: [{ runner: "ubuntu-24.04-arm", platform: "linux/arm64" }],
      },
    };
    expect(check(workflow)).toEqual([RUNNERS_ISSUE]);
  });

  it("reports a plain matrix list with only ubuntu-latest", () => {
    const workflow = validWorkflow();
    buildJob(workflow).strategy = { matrix: { runner: ["ubuntu-latest"] } };
    expect(check(workflow)).toEqual([RUNNERS_ISSUE]);
  });

  it("does not count a runs-on outside the matrix", () => {
    const workflow = validWorkflow();
    buildJob(workflow)["runs-on"] = "ubuntu-24.04-arm";
    buildJob(workflow).strategy = {
      matrix: { include: [{ runner: "ubuntu-latest" }] },
    };
    expect(check(workflow)).toEqual([RUNNERS_ISSUE]);
  });

  it("does not count runner names in step scripts", () => {
    const workflow = validWorkflow();
    buildJob(workflow).strategy = {
      matrix: { runner: ["ubuntu-latest"] },
    };
    buildJob(workflow).steps.push({ run: "echo ubuntu-24.04-arm" });
    expect(check(workflow)).toEqual([RUNNERS_ISSUE]);
  });

  it("reports a build job without a matrix", () => {
    const workflow = validWorkflow();
    delete buildJob(workflow).strategy;
    expect(check(workflow)).toEqual([RUNNERS_ISSUE]);
  });
});

describe("checkPublishWorkflow lowercase image name", () => {
  it("reports ghcr.io/${{ github.repository }} used directly in with.tags", () => {
    const workflow = validWorkflow();
    buildPushWith(workflow).tags = "ghcr.io/${{ github.repository }}:edge";
    expect(check(workflow)).toEqual([LOWERCASE_ISSUE]);
  });

  it("reports ghcr.io/${{ github.repository }} used directly in a run script", () => {
    const workflow = validWorkflow();
    buildJob(workflow).steps.push({
      run: 'docker buildx imagetools create -t ghcr.io/${{ github.repository }}:edge "$DIGEST"',
    });
    expect(check(workflow)).toEqual([LOWERCASE_ISSUE]);
  });

  it("reports ghcr.io/${{github.repository}} without spaces in the workflow env", () => {
    const workflow = validWorkflow();
    workflow.env = { IMAGE: "ghcr.io/${{github.repository}}" };
    expect(check(workflow)).toEqual([LOWERCASE_ISSUE]);
  });

  it("reports ghcr.io/${{ github.repository }} inside a list of tags", () => {
    const workflow = validWorkflow();
    buildPushWith(workflow).tags = [
      "ghcr.io/webamigos/gatojs:edge",
      "ghcr.io/${{ github.repository }}:latest",
    ];
    expect(check(workflow)).toEqual([LOWERCASE_ISSUE]);
  });

  test.prop([fc.stringMatching(/^[ ]{0,3}$/), fc.stringMatching(/^[ ]{0,3}$/)])(
    "reports ghcr.io/${{ github.repository }} with any whitespace inside the braces",
    (before, after) => {
      const workflow = validWorkflow();
      buildPushWith(workflow).tags =
        `ghcr.io/\${{${before}github.repository${after}}}:edge`;
      expect(check(workflow)).toEqual([LOWERCASE_ISSUE]);
    },
  );

  it("reports a workflow whose image step does no lowercase conversion", () => {
    const workflow = validWorkflow();
    lowercaseStep(workflow).run =
      'echo "IMAGE=ghcr.io/$GITHUB_REPOSITORY" >> "$GITHUB_ENV"';
    expect(check(workflow)).toEqual([LOWERCASE_ISSUE]);
  });

  it("reports a lowercase conversion that sits outside any run script", () => {
    const workflow = validWorkflow();
    lowercaseStep(workflow).run =
      'echo "IMAGE=ghcr.io/$GITHUB_REPOSITORY" >> "$GITHUB_ENV"';
    workflow.env = { NOTE: "${GITHUB_REPOSITORY,,} and [:lower:]" };
    expect(check(workflow)).toEqual([LOWERCASE_ISSUE]);
  });

  it("reports both a raw image name and a missing conversion once", () => {
    const workflow = validWorkflow();
    lowercaseStep(workflow).run =
      'echo "IMAGE=ghcr.io/$GITHUB_REPOSITORY" >> "$GITHUB_ENV"';
    buildPushWith(workflow).tags = "ghcr.io/${{ github.repository }}:edge";
    expect(check(workflow)).toEqual([LOWERCASE_ISSUE]);
  });

  it("accepts the lowercase conversion in a step of another job", () => {
    const workflow = validWorkflow();
    buildJob(workflow).steps.splice(1, 1);
    workflow.jobs.prepare = {
      "runs-on": "ubuntu-latest",
      steps: [{ run: LOWERCASE_RUN }],
    };
    expect(check(workflow)).toEqual([]);
  });
});

describe("checkPublishWorkflow provenance", () => {
  it("reports provenance: true", () => {
    const workflow = validWorkflow();
    buildPushWith(workflow).provenance = true;
    expect(check(workflow)).toEqual([PROVENANCE_ISSUE]);
  });

  it("reports provenance: mode=min", () => {
    const workflow = validWorkflow();
    buildPushWith(workflow).provenance = "mode=min";
    expect(check(workflow)).toEqual([PROVENANCE_ISSUE]);
  });

  it("reports a missing provenance", () => {
    const workflow = validWorkflow();
    delete buildPushWith(workflow).provenance;
    expect(check(workflow)).toEqual([PROVENANCE_ISSUE]);
  });

  it("reports a build-push-action step without a with block", () => {
    const workflow = validWorkflow();
    delete buildJob(workflow).steps[3].with;
    expect(check(workflow)).toEqual([PROVENANCE_ISSUE, SBOM_ISSUE]);
  });

  it("reports a second build-push-action step without provenance", () => {
    const workflow = validWorkflow();
    const second = buildPushStep();
    delete second.with?.provenance;
    buildJob(workflow).steps.push(second);
    expect(check(workflow)).toEqual([PROVENANCE_ISSUE]);
  });

  it("reports provenance given as the string true in another job", () => {
    const workflow = validWorkflow();
    const other = buildPushStep();
    if (other.with) {
      other.with.provenance = "true";
    }
    workflow.jobs.other = {
      "runs-on": "ubuntu-latest",
      steps: [other],
    };
    expect(check(workflow)).toEqual([PROVENANCE_ISSUE]);
  });

  it("reports two build-push-action steps without provenance once", () => {
    const workflow = validWorkflow();
    delete buildPushWith(workflow).provenance;
    const second = buildPushStep();
    delete second.with?.provenance;
    buildJob(workflow).steps.push(second);
    expect(check(workflow)).toEqual([PROVENANCE_ISSUE]);
  });
});

describe("checkPublishWorkflow sbom", () => {
  it("reports sbom: false", () => {
    const workflow = validWorkflow();
    buildPushWith(workflow).sbom = false;
    expect(check(workflow)).toEqual([SBOM_ISSUE]);
  });

  it("reports sbom given as the string false", () => {
    const workflow = validWorkflow();
    buildPushWith(workflow).sbom = "false";
    expect(check(workflow)).toEqual([SBOM_ISSUE]);
  });

  it("reports a missing sbom", () => {
    const workflow = validWorkflow();
    delete buildPushWith(workflow).sbom;
    expect(check(workflow)).toEqual([SBOM_ISSUE]);
  });

  it("reports a second build-push-action step without sbom", () => {
    const workflow = validWorkflow();
    const second = buildPushStep();
    if (second.with) {
      second.with.sbom = false;
    }
    buildJob(workflow).steps.push(second);
    expect(check(workflow)).toEqual([SBOM_ISSUE]);
  });

  it("reports provenance and sbom, in that order, when no step uses docker/build-push-action", () => {
    const workflow = validWorkflow();
    buildJob(workflow).steps.splice(3, 1);
    expect(check(workflow)).toEqual([PROVENANCE_ISSUE, SBOM_ISSUE]);
  });

  it("does not count a step with provenance and sbom that is not docker/build-push-action", () => {
    const workflow = validWorkflow();
    buildJob(workflow).steps[3].uses = "docker/bake-action@v6";
    expect(check(workflow)).toEqual([PROVENANCE_ISSUE, SBOM_ISSUE]);
  });
});

describe("checkPublishWorkflow workflow-level permissions", () => {
  it("reports packages: write at workflow level", () => {
    const workflow = validWorkflow();
    workflow.permissions = { contents: "read", packages: "write" };
    expect(check(workflow)).toEqual([PERMISSIONS_ISSUE]);
  });

  it("reports permissions: write-all", () => {
    const workflow = validWorkflow();
    workflow.permissions = "write-all";
    expect(check(workflow)).toEqual([PERMISSIONS_ISSUE]);
  });

  it("accepts permissions: read-all", () => {
    const workflow = validWorkflow();
    workflow.permissions = "read-all";
    expect(check(workflow)).toEqual([]);
  });

  it("accepts a workflow without top-level permissions", () => {
    const workflow = validWorkflow();
    delete workflow.permissions;
    expect(check(workflow)).toEqual([]);
  });
});

describe("checkPublishWorkflow issue order", () => {
  it("reports pull_request, runners and permissions in the fixed order", () => {
    const workflow = validWorkflow();
    workflow.on = { push: { branches: ["main"] }, pull_request: null };
    buildJob(workflow).strategy = {
      matrix: { include: [{ runner: "ubuntu-latest" }] },
    };
    workflow.permissions = { contents: "read", packages: "write" };
    expect(check(workflow)).toEqual([
      PULL_REQUEST_ISSUE,
      RUNNERS_ISSUE,
      PERMISSIONS_ISSUE,
    ]);
  });

  it("reports every issue in the fixed order", () => {
    const workflow = validWorkflow();
    workflow.on = ["push", "pull_request"];
    buildJob(workflow).strategy = {
      matrix: { runner: ["ubuntu-24.04-arm"] },
    };
    buildPushWith(workflow).tags = "ghcr.io/${{ github.repository }}:edge";
    buildPushWith(workflow).provenance = true;
    buildPushWith(workflow).sbom = false;
    workflow.permissions = "write-all";
    expect(check(workflow)).toEqual([
      PULL_REQUEST_ISSUE,
      RUNNERS_ISSUE,
      LOWERCASE_ISSUE,
      PROVENANCE_ISSUE,
      SBOM_ISSUE,
      PERMISSIONS_ISSUE,
    ]);
  });

  it("reports lowercase before provenance and sbom", () => {
    const workflow = validWorkflow();
    lowercaseStep(workflow).run = "echo plain";
    delete buildPushWith(workflow).provenance;
    delete buildPushWith(workflow).sbom;
    expect(check(workflow)).toEqual([
      LOWERCASE_ISSUE,
      PROVENANCE_ISSUE,
      SBOM_ISSUE,
    ]);
  });

  it("reports runners, lowercase, provenance and sbom for empty text", () => {
    expect(checkPublishWorkflow("")).toEqual([
      RUNNERS_ISSUE,
      LOWERCASE_ISSUE,
      PROVENANCE_ISSUE,
      SBOM_ISSUE,
    ]);
  });

  it("treats a document with only a comment as empty", () => {
    expect(checkPublishWorkflow("# nothing here\n")).toEqual([
      RUNNERS_ISSUE,
      LOWERCASE_ISSUE,
      PROVENANCE_ISSUE,
      SBOM_ISSUE,
    ]);
  });
});
