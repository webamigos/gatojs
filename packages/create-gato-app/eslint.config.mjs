import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default defineConfig([
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      curly: "error",
      "no-nested-ternary": "error",
    },
  },
  {
    files: ["**/__tests__/**"],
    rules: { curly: "off" },
  },
  globalIgnores([
    "node_modules/**",
    "dist/**",
    "reports/**",
    ".stryker-tmp/**",
  ]),
]);
