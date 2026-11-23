import { defineConfig, globalIgnores } from "eslint/config";
import next from "@gatojs/eslint-config/next";

const eslintConfig = defineConfig([
  ...next,
  globalIgnores([
    "next-env.d.ts",
    "packages/gato-cli/**",
    "packages/create-gato-app/**",
    "kit/**",
    "docs/**",
    ".superpowers/**",
    ".claude/**",
    ".wa/**",
    "src/generated/**",
    "src/modules.generated.ts",
    "src/modules.client.generated.ts",
    "src/i18n/locales.generated.ts",
  ]),
]);

export default eslintConfig;
