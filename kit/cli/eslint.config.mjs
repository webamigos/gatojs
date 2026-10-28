import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  tseslint.configs.recommended,
  {
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
    "reports/**",
    ".stryker-tmp/**",
    "src/__tests__/fixtures/**",
  ]),
]);
