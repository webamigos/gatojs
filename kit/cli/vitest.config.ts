import { defineConfig } from "vitest/config";
import { SmallestFileFirstSequencer } from "./vitest.sequencer.js";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    passWithNoTests: true,
    sequence: {
      // WHY: Vitest's default order follows earlier runs in the same process, so under Stryker a mutant that loops
      // in one test file and fails in another got Timeout or Killed depending on which file that process ran first.
      sequencer:
        process.env.STRYKER_MUTATOR_WORKER === undefined
          ? undefined
          : SmallestFileFirstSequencer,
    },
  },
});
