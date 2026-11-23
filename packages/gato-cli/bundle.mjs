import { readFileSync } from "node:fs";
import { build } from "esbuild";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

const shared = {
  entryPoints: ["src/bin.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire } from "node:module";',
      "const require = createRequire(import.meta.url);",
    ].join("\n"),
  },
  legalComments: "none",
};

const outputs = [
  { name: "wa", outfile: "../../.wa/bin/wa.mjs" },
  { name: "gato", outfile: "dist/gato.mjs" },
];

await Promise.all(
  outputs.map(({ name, outfile }) =>
    build({
      ...shared,
      outfile,
      define: {
        __CLI_NAME__: JSON.stringify(name),
        __CLI_VERSION__: JSON.stringify(version),
      },
    }),
  ),
);
