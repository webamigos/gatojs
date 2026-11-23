import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const classNameRead =
  ':matches(MemberExpression[object.computed=false][object.property.name="constructor"], MemberExpression[object.meta.name="new"], MemberExpression[object.name=/^[A-Z]/])[computed=false][property.name="name"]';
const errorNameMessage =
  'Set the error class name as a string literal, e.g. this.name = "KeyLimitError". The build minifies class names, so err.type in production logs would be a short name like "d". See docs/07b-logi-naglowki-healthcheck.md#logger-typ-bledu in the GatoJS repo.';
// WHY: esquery 1.7 czyta :has(> A > B) jako „podmiot :has to A i ma dziecko B”, a nie „dziecko A ma dziecko B”,
// więc każdy krok w dół drzewa to osobne :has(> …).
const childPath = (...steps) =>
  steps.reduceRight((inner, step) => `${step}:has(> ${inner})`);
const ownNameField = childPath(
  "ClassBody",
  'PropertyDefinition[computed=false][key.type="Identifier"][key.name="name"][value]',
);
const ownNameAssignment = childPath(
  "ClassBody",
  'MethodDefinition[kind="constructor"]',
  "FunctionExpression",
  "BlockStatement",
  "ExpressionStatement",
  'AssignmentExpression[left.object.type="ThisExpression"][left.computed=false][left.property.type="Identifier"][left.property.name="name"]',
);
const restrictedSyntax = [
  {
    selector: `AssignmentExpression[left.object.type="ThisExpression"][left.computed=false][left.property.name="name"] > ${classNameRead}.right`,
    message: errorNameMessage,
  },
  {
    selector: `PropertyDefinition[computed=false][key.name="name"] > ${classNameRead}.value`,
    message: errorNameMessage,
  },
];
const unnamedErrorClass = {
  selector: `:matches(ClassDeclaration, ClassExpression)[superClass.name="Error"]:not(:has(> ${ownNameField})):not(:has(> ${ownNameAssignment}))`,
  message:
    'A class that extends Error directly does not set its own name. Set it as a string literal in a class field (name = "KeyLimitError") or in the constructor (this.name = "KeyLimitError"). Without it, err.type in production logs is a minified class name like "d". See docs/07b-logi-naglowki-healthcheck.md#logger-typ-bledu in the GatoJS repo.',
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      curly: "error",
      "no-nested-ternary": "error",
      "no-restricted-syntax": ["error", ...restrictedSyntax, unnamedErrorClass],
    },
  },
  {
    // WHY: samo **/*.test.* kazałoby ESLint lintować też pliki spoza kodu, np. migawki Vitest *.test.ts.snap.
    files: [
      "**/__tests__/**",
      "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
      "e2e/**",
      "**/*.d.ts",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...restrictedSyntax],
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "next-env.d.ts",
    "packages/gato-cli/**",
    "packages/create-gato-app/**",
    "packages/*/dist/**",
    "kit/**",
    "docs/**",
    ".gato/**",
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
