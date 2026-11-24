import { errorNameFromClassName, unnamedErrorClass } from "./error-name.mjs";

export const ignores = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/*.min.js",
  "**/playwright-report/**",
  "**/test-results/**",
  "**/blob-report/**",
  "**/playwright/.cache/**",
  "**/.stryker-tmp/**",
  "**/reports/**",
];

// WHY: **/*.test.* alone would make ESLint lint non-code files such as Vitest snapshots *.test.ts.snap.
export const testFiles = [
  "**/__tests__/**",
  "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "e2e/**",
];

const typescriptFiles = ["**/*.{ts,tsx,mts,cts}"];

export const rules = {
  curly: ["error", "all"],
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-console": "error",
  "no-nested-ternary": "error",
};

export const typescriptRules = {
  "@typescript-eslint/consistent-type-imports": [
    "error",
    { prefer: "type-imports", disallowTypeAnnotations: false },
  ],
};

export function restrictedSyntax(extra = []) {
  const anywhere = [...errorNameFromClassName, ...extra];
  return [
    {
      rules: {
        "no-restricted-syntax": ["error", ...anywhere, unnamedErrorClass],
      },
    },
    {
      files: [...testFiles, "**/*.d.ts"],
      rules: { "no-restricted-syntax": ["error", ...anywhere] },
    },
  ];
}

export const gatoRules = [
  { rules },
  { files: typescriptFiles, rules: typescriptRules },
  { files: testFiles, rules: { "no-console": "off" } },
  ...restrictedSyntax(),
];
