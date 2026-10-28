import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      curly: "error",
      "no-nested-ternary": "error",
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "next-env.d.ts",
    "packages/**",
    "kit/**",
    "docs/**",
    ".superpowers/**",
    ".claude/**",
    ".stryker-tmp/**",
    "reports/**",
    ".wa/**",
    "src/generated/**",
    "src/modules.generated.ts",
    "src/modules.client.generated.ts",
    "src/i18n/locales.generated.ts",
  ]),
]);

export default eslintConfig;
