/* eslint-disable no-console -- a command-line script: the console is its output */
import { existsSync, readFileSync } from "node:fs";
import {
  checkMutationGate,
  mergeReports,
  type GateConfig,
  type MutationReport,
} from "./lib/mutation-gate";

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
const config = JSON.parse(
  readFileSync("mutation-gate.json", "utf8"),
) as GateConfig;
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
