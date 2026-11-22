// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_INSTRUCTIONS_MAX_BYTES,
  checkAgentInstructionsBudget,
  isWithinBudget,
} from "../../../scripts/lib/architecture/agent-instructions-budget";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("isWithinBudget", () => {
  it("limit to 31 744 bajty (32 KiB minus 1 KiB zapasu)", () => {
    expect(AGENT_INSTRUCTIONS_MAX_BYTES).toBe(31744);
  });

  it("dokładnie na limicie mieści się w budżecie", () => {
    expect(isWithinBudget(31744)).toBe(true);
  });

  it("bajt ponad limit przekracza budżet", () => {
    expect(isWithinBudget(31745)).toBe(false);
  });

  it("pusty plik mieści się w budżecie", () => {
    expect(isWithinBudget(0)).toBe(true);
  });
});

describe("checkAgentInstructionsBudget", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("AGENTS.md o rozmiarze równym limitowi przechodzi", () => {
    fs.writeFileSync(path.join(root, "AGENTS.md"), "a".repeat(31744));
    expect(checkAgentInstructionsBudget(root)).toEqual([]);
  });

  it("AGENTS.md o bajt za duży zgłasza rozmiar i limit", () => {
    fs.writeFileSync(path.join(root, "AGENTS.md"), "a".repeat(31745));
    expect(checkAgentInstructionsBudget(root)).toEqual([
      "AGENTS.md: 31745 B, limit 31744 B",
    ]);
  });

  it("liczy bajty UTF-8: 15 872 znaki „ą” to 31 744 B i przechodzi", () => {
    fs.writeFileSync(path.join(root, "AGENTS.md"), "ą".repeat(15872));
    expect(checkAgentInstructionsBudget(root)).toEqual([]);
  });

  it("liczy bajty UTF-8: 15 873 znaki „ą” to 31 746 B i nie przechodzi, choć znaków jest mniej niż limit", () => {
    fs.writeFileSync(path.join(root, "AGENTS.md"), "ą".repeat(15873));
    expect(checkAgentInstructionsBudget(root)).toEqual([
      "AGENTS.md: 31746 B, limit 31744 B",
    ]);
  });
});

describe("AGENTS.md w repo", () => {
  it("mieści się w budżecie instrukcji agentów", () => {
    expect(checkAgentInstructionsBudget(repoRoot)).toEqual([]);
  });
});
