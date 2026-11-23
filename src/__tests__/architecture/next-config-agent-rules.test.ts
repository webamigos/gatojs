// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("next.config", () => {
  it("turns off the agent rules Next.js writes into the project", () => {
    expect(nextConfig.agentRules).toBe(false);
  });
});
