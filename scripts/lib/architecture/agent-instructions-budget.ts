import fs from "node:fs";
import path from "node:path";

export const AGENT_INSTRUCTIONS_MAX_BYTES = 31744;

const AGENT_INSTRUCTIONS_FILE = "AGENTS.md";

export function isWithinBudget(bytes: number): boolean {
  return bytes <= AGENT_INSTRUCTIONS_MAX_BYTES;
}

export function checkAgentInstructionsBudget(root: string): string[] {
  const bytes = fs.statSync(path.join(root, AGENT_INSTRUCTIONS_FILE)).size;
  if (isWithinBudget(bytes)) {
    return [];
  }
  return [
    `${AGENT_INSTRUCTIONS_FILE}: ${bytes} B, limit ${AGENT_INSTRUCTIONS_MAX_BYTES} B`,
  ];
}
