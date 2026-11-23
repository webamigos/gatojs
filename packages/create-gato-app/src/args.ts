export type Locale = "pl" | "en";

export type StorageProvider = "local" | "s3";

export type CreateCliArgs = {
  kind: "create";
  target: string;
  kitVersion: string | null;
  kitPath: string | null;
  modules: string[] | null;
  locales: Locale[] | null;
  title: string | null;
  adminEmail: string | null;
  yes: boolean;
  setup: boolean;
  install: boolean;
  docker: boolean;
  git: boolean;
  cliSource: string | null;
  storage: StorageProvider | null;
  s3Endpoint: string | null;
  s3AccessKeyId: string | null;
  s3SecretAccessKey: string | null;
};

export type CliArgs = { kind: "help" } | { kind: "version" } | CreateCliArgs;

export const USAGE = "not implemented";

export function parseCliArgs(argv: string[]): CliArgs {
  throw new Error(`not implemented: ${argv.join(" ")}`);
}
