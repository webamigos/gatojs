import { contentHash } from "../assemble/hash.js";
import { compareCodePoint } from "../compare.js";
import { mergeFile } from "./merge.js";
import type { KitFile, KitSnapshot } from "./snapshot.js";

export type PlanAction =
  "updated" | "merged" | "added" | "removed" | "conflict" | "needs decision";

export type PlannedFile = {
  path: string;
  action: PlanAction;
  reason: string | null;
  content: Buffer | null;
  mode: number | null;
};

export type UpdatePlan = { files: PlannedFile[]; mismatchedBase: string[] };

type PlanInput = {
  base: KitSnapshot;
  target: KitSnapshot;
  recordedHashes: Record<string, string>;
  readProject: (path: string) => Promise<Buffer | null>;
};

type Decision = { file: PlannedFile | null; mismatchedBase: boolean };

const MANAGED = "managed";
const UNCHANGED: Decision = { file: null, mismatchedBase: false };

function planned(
  path: string,
  action: PlanAction,
  fields: Partial<Omit<PlannedFile, "path" | "action">> = {},
): PlannedFile {
  return { path, action, reason: null, content: null, mode: null, ...fields };
}

function undecided(path: string, reason: string): PlannedFile {
  return planned(path, "needs decision", { reason });
}

async function decideAdded(
  path: string,
  kit: KitFile,
  input: PlanInput,
): Promise<Decision> {
  const project = await input.readProject(path);
  if (!project) {
    return {
      file: planned(path, "added", { content: kit.content, mode: kit.mode }),
      mismatchedBase: false,
    };
  }
  if (contentHash(path, project) === contentHash(path, kit.content)) {
    return UNCHANGED;
  }
  return {
    file: planned(path, "conflict", {
      reason: "project file at the path of a new kit file",
    }),
    mismatchedBase: false,
  };
}

async function mergeChanged(
  path: string,
  base: Buffer,
  project: Buffer,
  kit: KitFile,
  input: PlanInput,
): Promise<PlannedFile | null> {
  const merged = await mergeFile({
    path,
    base,
    ours: project,
    theirs: kit.content,
    labels: {
      ours: "project",
      base: `v${input.base.version}`,
      theirs: `v${input.target.version}`,
    },
  });
  if ("binary" in merged) {
    return planned(path, "conflict", {
      reason: "binary file changed in both the project and the kit",
    });
  }
  if (merged.conflicts > 0) {
    return planned(path, "conflict", {
      content: merged.content,
      mode: kit.mode,
    });
  }
  if (contentHash(path, merged.content) === contentHash(path, project)) {
    return null;
  }
  return planned(path, "merged", { content: merged.content, mode: kit.mode });
}

async function decideExisting(
  path: string,
  base: KitFile,
  kit: KitFile | undefined,
  input: PlanInput,
): Promise<Decision> {
  const baseHash = contentHash(path, base.content);
  const kitContentUnchanged =
    kit !== undefined && contentHash(path, kit.content) === baseHash;
  if (kitContentUnchanged && kit.mode === base.mode) {
    return UNCHANGED;
  }
  const project = await input.readProject(path);
  if (!project) {
    if (!kit || kitContentUnchanged) {
      return UNCHANGED;
    }
    return {
      file: undecided(path, "deleted in the project, changed in the kit"),
      mismatchedBase: false,
    };
  }

  const projectHash = contentHash(path, project);
  const recordedHash = input.recordedHashes[path];
  const recordedMatchesBase =
    recordedHash === undefined ||
    recordedHash === MANAGED ||
    recordedHash === baseHash;
  const projectEqualsBase = projectHash === baseHash && recordedMatchesBase;
  const mismatchedBase =
    projectHash === recordedHash && recordedHash !== baseHash;

  if (!kit) {
    const file = projectEqualsBase
      ? planned(path, "removed")
      : undecided(path, "changed in the project, deleted in the kit");
    return { file, mismatchedBase };
  }
  if (projectEqualsBase) {
    return {
      file: planned(path, "updated", {
        content: kit.content,
        mode: kit.mode,
      }),
      mismatchedBase,
    };
  }
  if (projectHash === contentHash(path, kit.content)) {
    return UNCHANGED;
  }
  const file = await mergeChanged(path, base.content, project, kit, input);
  if (!file) {
    return UNCHANGED;
  }
  return { file, mismatchedBase };
}

export async function planUpdate(input: PlanInput): Promise<UpdatePlan> {
  const decisions: [string, Decision][] = [];
  for (const [path, base] of input.base.files) {
    decisions.push([
      path,
      await decideExisting(path, base, input.target.files.get(path), input),
    ]);
  }
  for (const [path, kit] of input.target.files) {
    if (!input.base.files.has(path)) {
      decisions.push([path, await decideAdded(path, kit, input)]);
    }
  }
  decisions.sort(([a], [b]) => compareCodePoint(a, b));
  const files: PlannedFile[] = [];
  const mismatchedBase: string[] = [];
  for (const [path, decision] of decisions) {
    if (decision.file) {
      files.push(decision.file);
    }
    if (decision.mismatchedBase) {
      mismatchedBase.push(path);
    }
  }
  return { files, mismatchedBase };
}
