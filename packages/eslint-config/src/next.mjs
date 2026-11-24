import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { gatoRules, ignores } from "./rules.mjs";

// WHY: eslint-config-next/typescript brings its own typescript-eslint plugin, so this variant does not spread
// base (which registers the same plugin name again).
const next = [
  { ignores },
  js.configs.recommended,
  ...nextVitals,
  ...nextTs,
  ...gatoRules,
];

export default next;
