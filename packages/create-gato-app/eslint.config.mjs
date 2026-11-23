import { defineConfig } from "eslint/config";
import node from "@gatojs/eslint-config/node";

export default defineConfig([
  ...node,
  {
    files: ["**/__tests__/**"],
    rules: { curly: "off" },
  },
]);
