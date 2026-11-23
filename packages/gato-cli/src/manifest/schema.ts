import { z } from "zod";

export const moduleManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  requires: z.array(z.string()).default([]),
  files: z.array(z.string()).default([]),
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
  env: z
    .array(
      z.object({
        name: z.string().min(1),
        example: z.string(),
        required: z.boolean().optional(),
      }),
    )
    .default([]),
  schemaRelations: z
    .array(z.object({ model: z.string().min(1), field: z.string().min(1) }))
    .default([]),
  compose: z.string().nullable().default(null),
  ciSteps: z.string().nullable().default(null),
  workspaces: z.array(z.string()).default([]),
});

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

export const DEFAULT_KIT_REPO = "https://github.com/webamigos/wa-kit.git";

const localesSchema = z
  .array(z.enum(["pl", "en"]))
  .min(1)
  .refine((locales) => locales.includes("pl"), {
    message: 'locales must include "pl"',
  })
  .refine((locales) => new Set(locales).size === locales.length, {
    message: "locales must not contain duplicates",
  });

export const kitStateSchema = z.object({
  kitVersion: z.string(),
  kitRepo: z.string().default(DEFAULT_KIT_REPO),
  project: z
    .object({ name: z.string(), slug: z.string() })
    .default({ name: "WA App", slug: "wa-app" }),
  locales: localesSchema.default(["pl", "en"]),
  modules: z.record(
    z.string(),
    z.object({
      version: z.string(),
      manifest: moduleManifestSchema,
      files: z.record(z.string(), z.string()),
    }),
  ),
  projectModules: z
    .record(z.string(), z.object({ manifest: moduleManifestSchema }))
    .default({}),
});

export type KitState = z.infer<typeof kitStateSchema>;
