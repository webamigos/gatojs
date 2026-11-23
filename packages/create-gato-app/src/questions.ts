import type { CreateCliArgs, Locale } from "./args.js";
import type { KitModule } from "./kit-modules.js";

export const LOCAL_MINIO_ENDPOINT = "http://localhost:9000";
export const LOCAL_MINIO_KEY = "minioadmin";

export class CancelledError extends Error {
  name = "CancelledError";
}

export type Option<T extends string> = { value: T; label: string; hint?: string };

export type Prompter = {
  multiselect(input: {
    message: string;
    options: Option<string>[];
    initialValues: string[];
  }): Promise<string[]>;
  text(input: {
    message: string;
    defaultValue: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
  password(input: {
    message: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
  select<T extends string>(input: {
    message: string;
    options: Option<T>[];
    initialValue: T;
  }): Promise<T>;
  confirm(input: { message: string; initialValue: boolean }): Promise<boolean>;
};

export type StorageAnswer =
  | { provider: "local" }
  | {
      provider: "s3";
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
      localMinio: boolean;
    };

export type Answers = {
  modules: string[];
  locales: Locale[];
  title: string;
  adminEmail: string | null;
  storage: StorageAnswer | null;
  setup: boolean;
};

export function displayName(slug: string): string {
  throw new Error(`not implemented: ${slug}`);
}

export async function collectAnswers(input: {
  args: CreateCliArgs;
  slug: string;
  modules: KitModule[];
  prompter: Prompter;
}): Promise<Answers> {
  throw new Error(`not implemented: ${input.slug}`);
}
