import { listFiles, readRepoFile } from "./repo-files";

const NVMRC_FILE = ".nvmrc";
const DOCKERFILE = "Dockerfile";
const WORKFLOWS_DIRECTORY = ".github/workflows";

const FROM_NODE = /^\s*FROM\s+(?:--platform=\S+\s+)?node:(\S+)/gim;
const NODE_VERSION_LITERAL = /^\s*(?:-\s*)?(node-version:\s*\S.*?)\s*$/gm;
const WORKFLOW_FILE = /\.ya?ml$/;

function leadingMajor(version: string): string {
  return /^v?(\d+)/.exec(version.trim())?.[1] ?? "";
}

export function nodeMajor(nvmrc: string): string {
  return leadingMajor(nvmrc);
}

function dockerNodeTags(dockerfile: string): string[] {
  return [...dockerfile.matchAll(FROM_NODE)].map((match) => match[1]);
}

export function dockerNodeMajors(dockerfile: string): string[] {
  return dockerNodeTags(dockerfile).map(leadingMajor);
}

export function findNodeLiterals(workflowYaml: string): string[] {
  return [...workflowYaml.matchAll(NODE_VERSION_LITERAL)].map(
    (match) => match[1],
  );
}

function checkDockerfile(root: string, major: string): string[] {
  const tags = dockerNodeTags(readRepoFile(root, DOCKERFILE));
  if (tags.length === 0) {
    return [`${DOCKERFILE}: no FROM node:<version>`];
  }
  return tags
    .filter((tag) => leadingMajor(tag) !== major)
    .map((tag) => `${DOCKERFILE}: node:${tag}, ${NVMRC_FILE}: ${major}`);
}

function checkWorkflows(root: string): string[] {
  return listFiles(root, WORKFLOWS_DIRECTORY, (file) =>
    WORKFLOW_FILE.test(file),
  ).flatMap((file) =>
    findNodeLiterals(readRepoFile(root, file)).map(
      (literal) => `${file}: ${literal}`,
    ),
  );
}

export function checkNodeVersion(root: string): string[] {
  const major = nodeMajor(readRepoFile(root, NVMRC_FILE));
  return [...checkDockerfile(root, major), ...checkWorkflows(root)];
}
