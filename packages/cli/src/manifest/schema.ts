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
  workspaces: z.array(z.string()).default([]),
});

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

export const kitStateSchema = z.object({
  kitVersion: z.string(),
  modules: z.record(
    z.string(),
    z.object({
      version: z.string(),
      manifest: moduleManifestSchema,
      files: z.record(z.string(), z.string()),
    }),
  ),
});

export type KitState = z.infer<typeof kitStateSchema>;
