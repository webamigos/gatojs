import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const classNameRead =
  ':matches(MemberExpression[object.computed=false][object.property.name="constructor"], MemberExpression[object.meta.name="new"], MemberExpression[object.name=/^[A-Z]/])[computed=false][property.name="name"]';
const errorNameMessage =
  'Ustaw name klasy błędu napisem, np. this.name = "KeyLimitError". Build minifikuje nazwy klas, więc err.type w logach produkcyjnych byłby krótką nazwą w rodzaju "d". Zobacz docs/07b-logi-naglowki-healthcheck.md#logger-typ-bledu w repo webamigos/wa-kit.';
// WHY: esquery 1.7 nigdy nie dopasowuje łańcucha :has(> A > B), bo wiąże ">" z ostatnim krokiem,
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
    'Klasa dziedzicząca wprost po Error nie ustawia własnego name. Wpisz je napisem w polu klasy (name = "KeyLimitError") albo w konstruktorze (this.name = "KeyLimitError"). Bez tego err.type w logach produkcyjnych to zminifikowana nazwa klasy w rodzaju "d". Zobacz docs/07b-logi-naglowki-healthcheck.md#logger-typ-bledu w repo webamigos/wa-kit.',
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
