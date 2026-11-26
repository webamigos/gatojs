import { parse } from "yaml";

const WORKFLOW_FILE = "docker-publish.yml";
const REQUIRED_RUNNERS = ["ubuntu-latest", "ubuntu-24.04-arm"];
const PULL_REQUEST_TRIGGERS = ["pull_request", "pull_request_target"];
const BUILD_PUSH_ACTION = "docker/build-push-action";
const RAW_IMAGE_NAME = /ghcr\.io\/\$\{\{\s*github\.repository\s*\}\}/;
const LOWERCASE_MARKERS = [",,}", "[:lower:]"];

type Step = { uses?: unknown; run?: unknown; with?: Record<string, unknown> };

type Job = { strategy?: { matrix?: unknown }; steps?: unknown };

type Workflow = {
  on?: unknown;
  permissions?: unknown;
  jobs?: Record<string, Job | null>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringsIn);
  }
  const record = asRecord(value);
  return record === null ? [] : Object.values(record).flatMap(stringsIn);
}

function triggerNames(on: unknown): string[] {
  if (typeof on === "string") {
    return [on];
  }
  if (Array.isArray(on)) {
    return on.filter((name): name is string => typeof name === "string");
  }
  return Object.keys(asRecord(on) ?? {});
}

function jobsOf(workflow: Workflow): Job[] {
  return Object.values(asRecord(workflow.jobs) ?? {})
    .map((job) => asRecord(job))
    .filter((job): job is Job => job !== null);
}

function stepsOf(workflow: Workflow): Step[] {
  return jobsOf(workflow).flatMap((job) =>
    Array.isArray(job.steps)
      ? job.steps
          .map((step) => asRecord(step))
          .filter((step): step is Step => step !== null)
      : [],
  );
}

function runsOnPullRequest(workflow: Workflow): boolean {
  return triggerNames(workflow.on).some((name) =>
    PULL_REQUEST_TRIGGERS.includes(name),
  );
}

function hasBothRunners(workflow: Workflow): boolean {
  const matrixValues = jobsOf(workflow).flatMap((job) =>
    stringsIn(asRecord(job.strategy)?.matrix),
  );
  return REQUIRED_RUNNERS.every((runner) => matrixValues.includes(runner));
}

function lowercasesImageName(workflow: Workflow): boolean {
  const usesRawName = stringsIn(workflow).some((value) =>
    RAW_IMAGE_NAME.test(value),
  );
  const hasLowercaseStep = stepsOf(workflow).some(
    (step) =>
      typeof step.run === "string" &&
      LOWERCASE_MARKERS.some((marker) => (step.run as string).includes(marker)),
  );
  return !usesRawName && hasLowercaseStep;
}

function buildPushSteps(workflow: Workflow): Step[] {
  return stepsOf(workflow).filter(
    (step) =>
      typeof step.uses === "string" && step.uses.startsWith(BUILD_PUSH_ACTION),
  );
}

function everyBuildPushStep(
  workflow: Workflow,
  accepts: (inputs: Record<string, unknown>) => boolean,
): boolean {
  const steps = buildPushSteps(workflow);
  return (
    steps.length > 0 &&
    steps.every((step) => accepts(asRecord(step.with) ?? {}))
  );
}

function grantsPackagesWriteToWorkflow(workflow: Workflow): boolean {
  const permissions = workflow.permissions;
  return (
    permissions === "write-all" || asRecord(permissions)?.packages === "write"
  );
}

export function checkPublishWorkflow(yamlText: string): string[] {
  const workflow = (asRecord(parse(yamlText)) ?? {}) as Workflow;
  const issues: string[] = [];
  if (runsOnPullRequest(workflow)) {
    issues.push(
      `${WORKFLOW_FILE}: must not run on pull_request; it pushes images`,
    );
  }
  if (!hasBothRunners(workflow)) {
    issues.push(
      `${WORKFLOW_FILE}: both ${REQUIRED_RUNNERS.join(" and ")} are required`,
    );
  }
  if (!lowercasesImageName(workflow)) {
    issues.push(`${WORKFLOW_FILE}: lowercase the image name before pushing`);
  }
  if (
    !everyBuildPushStep(workflow, (inputs) => inputs.provenance === "mode=max")
  ) {
    issues.push(
      `${WORKFLOW_FILE}: ${BUILD_PUSH_ACTION} needs provenance: mode=max`,
    );
  }
  if (
    !everyBuildPushStep(
      workflow,
      (inputs) => inputs.sbom === true || inputs.sbom === "true",
    )
  ) {
    issues.push(`${WORKFLOW_FILE}: ${BUILD_PUSH_ACTION} needs sbom: true`);
  }
  if (grantsPackagesWriteToWorkflow(workflow)) {
    issues.push(
      `${WORKFLOW_FILE}: grant packages: write per job, not to the whole workflow`,
    );
  }
  return issues;
}
