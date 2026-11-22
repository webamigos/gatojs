import { stat } from "node:fs/promises";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { compareCodePoint } from "./src/compare.js";

export class SmallestFileFirstSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sized = await Promise.all(
      files.map(async (file) => ({
        file,
        size: (await stat(file.moduleId)).size,
      })),
    );
    return sized
      .sort(
        (a, b) =>
          a.size - b.size || compareCodePoint(a.file.moduleId, b.file.moduleId),
      )
      .map(({ file }) => file);
  }
}
