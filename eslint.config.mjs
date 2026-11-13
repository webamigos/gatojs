import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const classNameRead =
  ':matches(MemberExpression[object.computed=false][object.property.name="constructor"], MemberExpression[object.meta.name="new"], MemberExpression[object.name=/^[A-Z]/])[computed=false][property.name="name"]';
const errorNameMessage =
  'Ustaw name klasy błędu napisem, np. this.name = "KeyLimitError". Build minifikuje nazwy klas, więc err.type w logach produkcyjnych byłby krótką nazwą w rodzaju "d". Zobacz docs/07b-logi-naglowki-healthcheck.md#logger-typ-bledu w repo webamigos/wa-kit.';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      curly: "error",
      "no-nested-ternary": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: `AssignmentExpression[left.object.type="ThisExpression"][left.computed=false][left.property.name="name"] > ${classNameRead}.right`,
          message: errorNameMessage,
        },
        {
          selector: `PropertyDefinition[computed=false][key.name="name"] > ${classNameRead}.value`,
          message: errorNameMessage,
        },
      ],
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
