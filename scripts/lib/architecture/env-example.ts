import { checkEnv } from "@/shared/lib/env";
import { parseDotenv } from "./dotenv";
import { readRepoFile } from "./repo-files";

const ENV_EXAMPLE_FILE = ".env.example";

export function checkEnvExample(root: string): string[] {
  const source = {
    ...parseDotenv(readRepoFile(root, ENV_EXAMPLE_FILE)),
    NODE_ENV: "development",
  };
  const result = checkEnv(source);
  if (result.ok) {
    return [];
  }
  return result.issues.map(
    ({ name, message }) => `${ENV_EXAMPLE_FILE}: ${name}: ${message}`,
  );
}
