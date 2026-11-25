/* eslint-disable no-console -- a command-line script: the console is its output */
import { existsSync, readFileSync } from "node:fs";
import {
  GateConfigError,
  checkMutationGate,
  mergeGateConfigs,
  mergeReports,
  parseGateConfig,
  type GateConfig,
  type MutationReport,
} from "./lib/mutation-gate";

const GATO_CONFIG = "mutation-gate.json";
const PROJECT_CONFIG = "mutation-gate.project.json";

const DEFAULT_REPORTS = [
  "reports/mutation/mutation.json",
  "reports/mutation-integration/mutation.json",
];

const requested = process.argv.slice(2);
const reportPaths =
  requested.length > 0
    ? requested
    : DEFAULT_REPORTS.filter((path) => existsSync(path));

if (reportPaths.length === 0) {
  console.error("No mutation report. Run npm run test:mutation first.");
  process.exit(1);
}

const report = mergeReports(
  reportPaths.map(
    (path) => JSON.parse(readFileSync(path, "utf8")) as MutationReport,
  ),
);

function readGateConfig(path: string): GateConfig {
  return parseGateConfig(readFileSync(path, "utf8"), path);
}

function loadConfig(): GateConfig {
  try {
    return mergeGateConfigs(
      readGateConfig(GATO_CONFIG),
      existsSync(PROJECT_CONFIG) ? readGateConfig(PROJECT_CONFIG) : undefined,
    );
  } catch (error) {
    if (error instanceof GateConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfig();
const { violations, stale } = checkMutationGate(report, config);

for (const violation of violations) {
  console.error(`Untested mutant in a critical file: ${violation}`);
}
for (const entry of stale) {
  console.error(`Stale entry in mutation-gate.json: ${entry}`);
}

if (violations.length > 0 || stale.length > 0) {
  console.error(
    "Add a test that kills the mutant, or add an entry to mutation-gate.json with a reason (equivalent / message only).",
  );
  process.exit(1);
}
console.log(`Mutation gate: OK (reports: ${reportPaths.join(", ")}).`);
