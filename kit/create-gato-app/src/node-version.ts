export type NodeRange = { from: string; belowMajor?: number };

export const SUPPORTED_NODE_RANGES: readonly NodeRange[] = [{ from: "22.0.0" }];

export type NodeVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
};

export type NodeVerdict =
  | { kind: "ok" }
  | { kind: "warn"; message: string }
  | { kind: "refuse"; message: string };

const NODE_VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function enginesRange(ranges: readonly NodeRange[]): string {
  return ranges
    .map((range) =>
      range.belowMajor === undefined ? `>=${range.from}` : `^${range.from}`,
    )
    .join(" || ");
}

export function parseNodeVersion(version: string): NodeVersion | undefined {
  const match = NODE_VERSION_PATTERN.exec(version);
  if (!match) {
    return undefined;
  }
  const parsed: NodeVersion = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
  if (match[4] !== undefined) {
    parsed.prerelease = match[4];
  }
  return parsed;
}

function compareWithRangeStart(
  version: NodeVersion,
  start: NodeVersion,
): number {
  const numeric =
    version.major - start.major ||
    version.minor - start.minor ||
    version.patch - start.patch;
  if (numeric !== 0) {
    return numeric;
  }
  return version.prerelease === undefined ? 0 : -1;
}

function rangeStart(range: NodeRange): NodeVersion {
  const start = parseNodeVersion(range.from);
  if (start === undefined) {
    throw new Error(`Invalid Node range start: ${range.from}`);
  }
  return start;
}

function isInRange(version: NodeVersion, range: NodeRange): boolean {
  if (compareWithRangeStart(version, rangeStart(range)) < 0) {
    return false;
  }
  return range.belowMajor === undefined || version.major < range.belowMajor;
}

function format({ major, minor, patch, prerelease }: NodeVersion): string {
  const base = `${major}.${minor}.${patch}`;
  return prerelease === undefined ? base : `${base}-${prerelease}`;
}

function headline(version: NodeVersion, ranges: readonly NodeRange[]): string {
  const current = format(version);
  const supported = enginesRange(ranges);
  if (compareWithRangeStart(version, rangeStart(ranges[0] as NodeRange)) < 0) {
    return `Node ${current} is too old: GatoJS needs Node ${supported}.`;
  }
  const isAboveAll = ranges.every(
    (range) =>
      range.belowMajor !== undefined && version.major >= range.belowMajor,
  );
  if (isAboveAll) {
    return `Node ${current} is too new: GatoJS supports Node ${supported}.`;
  }
  return `Node ${current} is an unsupported release line: GatoJS supports Node ${supported}.`;
}

export function checkNodeVersion(input: {
  version: string;
  willInstall: boolean;
  ranges?: readonly NodeRange[];
}): NodeVerdict {
  const ranges = input.ranges ?? SUPPORTED_NODE_RANGES;
  const version = parseNodeVersion(input.version);
  if (
    version === undefined ||
    ranges.some((range) => isInRange(version, range))
  ) {
    return { kind: "ok" };
  }
  const summary = headline(version, ranges);
  if (!input.willInstall) {
    return {
      kind: "warn",
      message: `Warning: ${summary} Nothing is installed now (--skip-install), so the files are written anyway; switch Node before running npm install in the new project.`,
    };
  }
  const recommendedMajor = rangeStart(ranges[0] as NodeRange).major;
  return {
    kind: "refuse",
    message: [
      summary,
      "",
      "Stopping before anything is downloaded: `wa create` runs npm install under this Node.",
      "",
      `  nvm install ${recommendedMajor}   # or fnm, volta, asdf, …`,
      "",
      "Or pass --skip-install to write the files now and install dependencies yourself on a supported Node.",
    ].join("\n"),
  };
}
