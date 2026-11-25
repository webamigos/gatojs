import { readFile } from "node:fs/promises";
import { checkGatoFiles } from "../doctor/files.js";
import type { GatoFilesReport } from "../doctor/files.js";
import { FILE_PROTECTION_MODE } from "../doctor/mode.js";
import type { FileProtectionMode } from "../doctor/mode.js";
import { readKitState } from "../manifest/kit-state.js";
import { insideProject } from "./remove.js";

export type DoctorFilesSettings = { mode: FileProtectionMode; cli: string };

function nextSteps(path: string, cli: string): string[] {
  return [
    `    revert: ${cli} eject --undo ${path} (or git checkout -- ${path})`,
    `    keep the change: ${cli} eject ${path} --reason "<why>"`,
  ];
}

function ejectedLine(entry: GatoFilesReport["ejected"][number]): string {
  const state = entry.unchanged ? "unchanged" : "changed";
  return `  ejected   ${entry.path} (${state}): ${entry.reason}`;
}

export function doctorFilesReport(
  report: GatoFilesReport,
  { mode, cli }: DoctorFilesSettings,
): { exitCode: 0 | 1; lines: string[] } {
  const problems =
    report.modified.length + report.deleted.length + report.staleEjected.length;
  const lines = [
    ...report.modified.flatMap((path) => [
      `  modified  ${path}`,
      ...nextSteps(path, cli),
    ]),
    ...report.deleted.flatMap((path) => [
      `  deleted   ${path}`,
      ...nextSteps(path, cli),
    ]),
    ...report.ejected.map(ejectedLine),
    ...report.staleEjected.map(
      (path) =>
        `  stale     ${path}: no longer a GatoJS file; remove it from ejected in .wa/kit.json`,
    ),
  ];
  if (lines.length === 0) {
    return { exitCode: 0, lines: ["GatoJS files: no changes"] };
  }
  const footer =
    problems === 0
      ? []
      : [
          "Before changing a GatoJS file, look for an extension point in EXTENSION_POINTS.md (when present).",
        ];
  const warning =
    mode === "warn" && problems > 0
      ? [
          "This is a warning for now; a later GatoJS release makes verify fail on these files.",
        ]
      : [];
  return {
    exitCode: mode === "block" && problems > 0 ? 1 : 0,
    lines: ["GatoJS files:", ...lines, ...footer, ...warning],
  };
}

async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function doctorFiles(options: {
  projectDir: string;
  mode?: FileProtectionMode;
  cli: string;
  log: (line: string) => void;
}): Promise<{ exitCode: 0 | 1 }> {
  const { projectDir } = options;
  const state = await readKitState(projectDir);
  const report = await checkGatoFiles({
    state,
    readProject: async (path) =>
      readIfExists(await insideProject(projectDir, path)),
  });
  const { exitCode, lines } = doctorFilesReport(report, {
    mode: options.mode ?? FILE_PROTECTION_MODE,
    cli: options.cli,
  });
  lines.forEach((line) => options.log(line));
  return { exitCode };
}
