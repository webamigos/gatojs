import {
  agentMarkdownFiles,
  existingFiles,
  readRepoFile,
  unique,
} from "./repo-files";

const NPM_RUN = /npm run ([A-Za-z0-9][A-Za-z0-9:_-]*)/g;

const DOCUMENTED_FILES = ["AGENTS.md", "CLAUDE.md", "README.md"];

export function findUndocumentedCommands(
  markdown: string,
  scripts: Record<string, string>,
): string[] {
  const names = [...markdown.matchAll(NPM_RUN)].map((match) => match[1]);
  return unique(names)
    .filter((name) => !Object.hasOwn(scripts, name))
    .map((name) => `npm run ${name}`);
}

export function checkDocumentedCommands(root: string): string[] {
  const { scripts } = JSON.parse(readRepoFile(root, "package.json")) as {
    scripts: Record<string, string>;
  };
  const files = [
    ...existingFiles(root, DOCUMENTED_FILES),
    ...agentMarkdownFiles(root),
  ];
  return files.flatMap((file) =>
    findUndocumentedCommands(readRepoFile(root, file), scripts).map(
      (command) => `${file}: ${command}`,
    ),
  );
}
