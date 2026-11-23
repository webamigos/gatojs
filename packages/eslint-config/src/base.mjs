import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { gatoRules, ignores } from "./rules.mjs";

export {
  ignores,
  restrictedSyntax,
  rules,
  testFiles,
  typescriptRules,
} from "./rules.mjs";

const base = [
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...gatoRules,
];

export default base;
