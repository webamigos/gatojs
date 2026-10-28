export interface Position {
  line: number;
  column: number;
}

export interface Location {
  start: Position;
  end: Position;
}

export interface ReportMutant {
  id: string;
  mutatorName: string;
  replacement?: string;
  status: string;
  location: Location;
}

export interface MutationReport {
  files: Record<string, { source: string; mutants: ReportMutant[] }>;
}

export interface AllowedMutant {
  file: string;
  mutator: string;
  original: string;
  replacement: string;
  reason: string;
}

export interface GateConfig {
  critical: string[];
  allowed: AllowedMutant[];
}

export interface GateResult {
  violations: string[];
  stale: string[];
}

const UNTESTED_STATUSES = new Set(["Survived", "NoCoverage"]);

function offsetOf(lines: string[], position: Position): number {
  const before = lines.slice(0, position.line - 1);
  return (
    before.reduce((sum, line) => sum + line.length + 1, 0) + position.column - 1
  );
}

export function mutantOriginal(source: string, location: Location): string {
  const lines = source.split("\n");
  return source.slice(
    offsetOf(lines, location.start),
    offsetOf(lines, location.end),
  );
}

function mutantKey(mutant: ReportMutant): string {
  const { start, end } = mutant.location;
  return [
    mutant.mutatorName,
    mutant.replacement ?? "",
    start.line,
    start.column,
    end.line,
    end.column,
  ].join("|");
}

function mergeStatus(current: string, next: string): string {
  if (!UNTESTED_STATUSES.has(current)) {
    return current;
  }
  if (!UNTESTED_STATUSES.has(next)) {
    return next;
  }
  return current === "Survived" || next === "Survived"
    ? "Survived"
    : "NoCoverage";
}

export function mergeReports(reports: MutationReport[]): MutationReport {
  const files: MutationReport["files"] = {};
  for (const report of reports) {
    for (const [file, { source, mutants }] of Object.entries(report.files)) {
      const existing = files[file];
      if (!existing) {
        files[file] = {
          source,
          mutants: mutants.map((mutant) => ({ ...mutant })),
        };
        continue;
      }
      const byKey = new Map(
        existing.mutants.map((mutant) => [mutantKey(mutant), mutant]),
      );
      for (const mutant of mutants) {
        const known = byKey.get(mutantKey(mutant));
        if (known) {
          known.status = mergeStatus(known.status, mutant.status);
        } else {
          existing.mutants.push({ ...mutant });
        }
      }
    }
  }
  return { files };
}

function describeAllowed(entry: AllowedMutant): string {
  return `${entry.file} ${entry.mutator} „${entry.original}”`;
}

function covers(
  entry: AllowedMutant,
  file: string,
  mutant: ReportMutant,
  original: string,
): boolean {
  return (
    entry.file === file &&
    entry.mutator === mutant.mutatorName &&
    entry.original === original &&
    entry.replacement === (mutant.replacement ?? "")
  );
}

export function checkMutationGate(
  report: MutationReport,
  config: GateConfig,
): GateResult {
  const violations: string[] = config.allowed
    .filter((entry) => entry.reason.trim() === "")
    .map((entry) => `${describeAllowed(entry)}: brak uzasadnienia`);
  const usedEntries = new Set<AllowedMutant>();

  for (const [file, { source, mutants }] of Object.entries(report.files)) {
    if (!config.critical.some((prefix) => file.startsWith(prefix))) {
      continue;
    }
    for (const mutant of mutants.filter((candidate) =>
      UNTESTED_STATUSES.has(candidate.status),
    )) {
      const original = mutantOriginal(source, mutant.location);
      const entry = config.allowed.find((candidate) =>
        covers(candidate, file, mutant, original),
      );
      if (entry) {
        usedEntries.add(entry);
        continue;
      }
      violations.push(
        `${file}:${mutant.location.start.line} ${mutant.mutatorName} „${original}” → „${mutant.replacement ?? ""}” (${mutant.status})`,
      );
    }
  }

  const stale = config.allowed
    .filter((entry) => entry.file in report.files && !usedEntries.has(entry))
    .map(describeAllowed);

  return { violations, stale };
}
