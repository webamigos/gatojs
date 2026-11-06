import "@testing-library/jest-dom/vitest";
import { fc } from "@fast-check/vitest";
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

// WHY: @fast-check/vitest puts the seed in each property test's name and Stryker picks a mutant's tests by
// the names from its dry run, so a seed drawn anew in every Stryker process would keep property tests from running.
if (process.env.STRYKER_MUTATOR_WORKER !== undefined) {
  fc.configureGlobal({ seed: 42 });
}
