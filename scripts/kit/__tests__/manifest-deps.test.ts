import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  bumpPatch,
  formatReport,
  parseSyncArgs,
  syncManifestDependencies,
  type RepoFile,
  type SyncResult,
} from "../manifest-deps";

type Pins = Record<string, string>;

type ManifestShape = {
  name: string;
  version: string;
  dependencies: Pins;
  devDependencies: Pins;
};

const UPLOADS_PATH = "kit/modules/uploads.json";
const CORE_PATH = "kit/modules/core.json";
const API_KEYS_PATH = "kit/modules/api-keys.json";
const ENCRYPTION_PATH = "kit/modules/encryption.json";
const ENV_PACKAGE_PATH = "packages/env/package.json";
const CRYPTO_PACKAGE_PATH = "packages/crypto/package.json";
const GATO_CLI_PACKAGE_PATH = "packages/gato-cli/package.json";

const UPLOADS_AT_BASE = `{
  "name": "uploads",
  "version": "0.2.6",
  "description": "Organization files on disk or in S3 storage",
  "requires": [],
  "files": [
    "prisma/schema/uploads.prisma",
    "src/features/uploads/**",
    "src/app/api/uploads/**",
    "docker/uploads.compose.yml"
  ],
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1173.0",
    "file-type": "^22.3.0",
    "sharp": "^0.35.5"
  },
  "devDependencies": {},
  "env": [
    {
      "name": "STORAGE_PROVIDER",
      "example": "local",
      "required": false
    }
  ],
  "schemaRelations": [
    { "model": "User", "field": "uploads Upload[]" },
    { "model": "Organization", "field": "uploads Upload[]" }
  ],
  "compose": "docker/uploads.compose.yml",
  "workspaces": []
}
`;

const UPLOADS_SYNCED = `{
  "name": "uploads",
  "version": "0.2.7",
  "description": "Organization files on disk or in S3 storage",
  "requires": [],
  "files": [
    "prisma/schema/uploads.prisma",
    "src/features/uploads/**",
    "src/app/api/uploads/**",
    "docker/uploads.compose.yml"
  ],
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1173.0",
    "file-type": "^22.3.0",
    "sharp": "^0.35.6"
  },
  "devDependencies": {},
  "env": [
    {
      "name": "STORAGE_PROVIDER",
      "example": "local",
      "required": false
    }
  ],
  "schemaRelations": [
    { "model": "User", "field": "uploads Upload[]" },
    { "model": "Organization", "field": "uploads Upload[]" }
  ],
  "compose": "docker/uploads.compose.yml",
  "workspaces": []
}
`;

const UPLOADS_BUMPED_BUT_STALE = `{
  "name": "uploads",
  "version": "0.2.7",
  "description": "Organization files on disk or in S3 storage",
  "requires": [],
  "files": [
    "prisma/schema/uploads.prisma",
    "src/features/uploads/**",
    "src/app/api/uploads/**",
    "docker/uploads.compose.yml"
  ],
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1173.0",
    "file-type": "^22.3.0",
    "sharp": "^0.35.5"
  },
  "devDependencies": {},
  "env": [
    {
      "name": "STORAGE_PROVIDER",
      "example": "local",
      "required": false
    }
  ],
  "schemaRelations": [
    { "model": "User", "field": "uploads Upload[]" },
    { "model": "Organization", "field": "uploads Upload[]" }
  ],
  "compose": "docker/uploads.compose.yml",
  "workspaces": []
}
`;

const UPLOADS_SYNCED_WITHOUT_BUMP = `{
  "name": "uploads",
  "version": "0.2.6",
  "description": "Organization files on disk or in S3 storage",
  "requires": [],
  "files": [
    "prisma/schema/uploads.prisma",
    "src/features/uploads/**",
    "src/app/api/uploads/**",
    "docker/uploads.compose.yml"
  ],
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1173.0",
    "file-type": "^22.3.0",
    "sharp": "^0.35.6"
  },
  "devDependencies": {},
  "env": [
    {
      "name": "STORAGE_PROVIDER",
      "example": "local",
      "required": false
    }
  ],
  "schemaRelations": [
    { "model": "User", "field": "uploads Upload[]" },
    { "model": "Organization", "field": "uploads Upload[]" }
  ],
  "compose": "docker/uploads.compose.yml",
  "workspaces": []
}
`;

const API_KEYS_AT_BASE = `{
  "name": "api-keys",
  "version": "0.1.2",
  "description": "Organization API keys: ApiKey model, peppered secret and scopes",
  "requires": [],
  "files": [
    "prisma/schema/api-keys.prisma",
    "src/features/api-keys/**",
    "src/app/api/v1/organization/**",
    "src/app/[locale]/(app)/api-keys/**"
  ],
  "dependencies": {
    "@noble/hashes": "^2.0.0"
  },
  "devDependencies": {},
  "env": [
    {
      "name": "API_KEY_PEPPER",
      "example": "dev-only-api-key-pepper-change-me-0123456789",
      "required": true,
      "generate": "secret-32"
    }
  ],
  "schemaRelations": [
    { "model": "User", "field": "createdApiKeys ApiKey[]" },
    { "model": "Organization", "field": "apiKeys ApiKey[]" }
  ],
  "compose": null,
  "workspaces": []
}
`;

const API_KEYS_SYNCED = `{
  "name": "api-keys",
  "version": "0.1.3",
  "description": "Organization API keys: ApiKey model, peppered secret and scopes",
  "requires": [],
  "files": [
    "prisma/schema/api-keys.prisma",
    "src/features/api-keys/**",
    "src/app/api/v1/organization/**",
    "src/app/[locale]/(app)/api-keys/**"
  ],
  "dependencies": {
    "@noble/hashes": "^2.0.1"
  },
  "devDependencies": {},
  "env": [
    {
      "name": "API_KEY_PEPPER",
      "example": "dev-only-api-key-pepper-change-me-0123456789",
      "required": true,
      "generate": "secret-32"
    }
  ],
  "schemaRelations": [
    { "model": "User", "field": "createdApiKeys ApiKey[]" },
    { "model": "Organization", "field": "apiKeys ApiKey[]" }
  ],
  "compose": null,
  "workspaces": []
}
`;

const QUOTED_DESCRIPTION_AT_BASE = `{
  "name": "uploads",
  "version": "0.2.6",
  "description": "Files \\"on disk\\" or in S3 storage",
  "requires": [],
  "files": ["src/features/uploads/**"],
  "dependencies": {
    "sharp": "^0.35.5"
  },
  "devDependencies": {},
  "env": [],
  "schemaRelations": [],
  "compose": null,
  "workspaces": []
}
`;

const QUOTED_DESCRIPTION_SYNCED = `{
  "name": "uploads",
  "version": "0.2.7",
  "description": "Files \\"on disk\\" or in S3 storage",
  "requires": [],
  "files": ["src/features/uploads/**"],
  "dependencies": {
    "sharp": "^0.35.6"
  },
  "devDependencies": {},
  "env": [],
  "schemaRelations": [],
  "compose": null,
  "workspaces": []
}
`;

const DESCRIPTION_NAMED_DEPENDENCIES_AT_BASE = `{
  "name": "uploads",
  "version": "0.2.6",
  "description": "dependencies",
  "requires": [],
  "files": ["src/features/uploads/**"],
  "dependencies": {
    "sharp": "^0.35.5"
  },
  "devDependencies": {},
  "env": [],
  "schemaRelations": [],
  "compose": null,
  "workspaces": []
}
`;

const DESCRIPTION_NAMED_DEPENDENCIES_SYNCED = `{
  "name": "uploads",
  "version": "0.2.7",
  "description": "dependencies",
  "requires": [],
  "files": ["src/features/uploads/**"],
  "dependencies": {
    "sharp": "^0.35.6"
  },
  "devDependencies": {},
  "env": [],
  "schemaRelations": [],
  "compose": null,
  "workspaces": []
}
`;

const DESCRIPTION_NAMED_VERSION_AT_BASE = `{
  "name": "uploads",
  "description": "version",
  "version": "0.2.6",
  "requires": [],
  "files": ["src/features/uploads/**"],
  "dependencies": {
    "sharp": "^0.35.5"
  },
  "devDependencies": {},
  "env": [],
  "schemaRelations": [],
  "compose": null,
  "workspaces": []
}
`;

const DESCRIPTION_NAMED_VERSION_SYNCED = `{
  "name": "uploads",
  "description": "version",
  "version": "0.2.7",
  "requires": [],
  "files": ["src/features/uploads/**"],
  "dependencies": {
    "sharp": "^0.35.6"
  },
  "devDependencies": {},
  "env": [],
  "schemaRelations": [],
  "compose": null,
  "workspaces": []
}
`;

function rootPackageJson(dependencies: Pins, devDependencies: Pins): string {
  return `${JSON.stringify(
    {
      name: "gatojs",
      version: "0.0.0",
      private: true,
      workspaces: ["packages/*", "apps/*"],
      scripts: { dev: "next dev", build: "next build", test: "vitest run" },
      dependencies,
      devDependencies,
    },
    null,
    2,
  )}\n`;
}

function coreManifest(
  version: string,
  dependencies: Pins,
  devDependencies: Pins,
): string {
  return `${JSON.stringify(
    {
      name: "core",
      version,
      description:
        "GatoJS core: auth, organizations, users, account, dashboard",
      requires: [],
      files: [
        "package-lock.json",
        "package.json",
        "packages/env/**",
        "packages/observability/**",
        "scripts/**",
        "src/shared/**",
      ],
      dependencies,
      devDependencies,
      env: [],
      schemaRelations: [],
      compose: null,
      workspaces: [],
    },
    null,
    2,
  )}\n`;
}

function encryptionManifest(
  version: string,
  files: string[] = [
    "packages/crypto/**",
    "prisma/schema/encryption.prisma",
    "src/features/encryption/**",
  ],
): string {
  return `${JSON.stringify(
    {
      name: "encryption",
      version,
      description:
        "Per-organization envelope encryption (AES-256-GCM) with data keys wrapped by a master key",
      requires: [],
      files,
      dependencies: {},
      devDependencies: {},
      env: [
        {
          name: "ENCRYPTION_PROVIDER",
          example: "local",
          required: false,
        },
      ],
      schemaRelations: [
        { model: "Organization", field: "dataKey OrganizationDataKey?" },
      ],
      compose: null,
      workspaces: [],
    },
    null,
    2,
  )}\n`;
}

function workspacePackage(
  name: string,
  dependencies: Pins,
  version = "0.1.0",
  description = "Workspace package for GatoJS projects",
): string {
  return `${JSON.stringify(
    {
      name,
      version,
      private: true,
      description,
      exports: { ".": "./src/index.ts" },
      dependencies,
    },
    null,
    2,
  )}\n`;
}

function workspacePackageWithSections(
  name: string,
  sections: Record<string, Pins>,
): string {
  return `${JSON.stringify(
    {
      name,
      version: "0.1.0",
      private: true,
      description: "Workspace package for GatoJS projects",
      exports: { ".": "./src/index.ts" },
      ...sections,
    },
    null,
    2,
  )}\n`;
}

function uploadsManifestWithPins(entries: [string, string][]): string {
  return `${JSON.stringify(
    {
      name: "uploads",
      version: "0.2.6",
      description: "Organization files on disk or in S3 storage",
      requires: [],
      files: ["prisma/schema/uploads.prisma", "src/features/uploads/**"],
      dependencies: Object.fromEntries(entries),
      devDependencies: {},
      env: [],
      schemaRelations: [],
      compose: null,
      workspaces: [],
    },
    null,
    2,
  )}\n`;
}

function readBaseFrom(texts: Record<string, string>) {
  const byPath = new Map(Object.entries(texts));
  return (path: string): string | null => byPath.get(path) ?? null;
}

function fileText(result: SyncResult, path: string): string | undefined {
  return result.files.find((file) => file.path === path)?.text;
}

function parsedFile(result: SyncResult, path: string): ManifestShape {
  const text = fileText(result, path);
  if (text === undefined) {
    throw new Error(`${path} is not in result.files`);
  }
  return JSON.parse(text) as ManifestShape;
}

function rejectionMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the call to throw");
}

function expectValidationError(action: () => unknown) {
  const message = rejectionMessage(action);
  expect(message).not.toMatch(/not implemented/);
  expect(message.length).toBeGreaterThan(0);
}

function paths(files: RepoFile[]): string[] {
  return files.map((file) => file.path).sort();
}

const CORE_DEPENDENCIES_AT_BASE: Pins = {
  next: "16.4.6",
  react: "19.3.1",
  zod: "^4.3.6",
};

const CORE_DEV_DEPENDENCIES_AT_BASE: Pins = {
  typescript: "^5.9.3",
  vitest: "^4.1.2",
};

const UPLOADS_ROOT_DEPENDENCIES: Pins = {
  "@aws-sdk/client-s3": "^3.1173.0",
  "file-type": "^22.3.0",
};

describe("syncManifestDependencies: pins from the root package.json", () => {
  it("copies the newer root dependencies version into the manifest and bumps the module version by a patch", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { ...UPLOADS_ROOT_DEPENDENCIES, sharp: "^0.35.6" },
        {},
      ),
      manifests: [{ path: UPLOADS_PATH, text: UPLOADS_AT_BASE }],
      workspacePackages: [],
      readBase: readBaseFrom({ [UPLOADS_PATH]: UPLOADS_AT_BASE }),
    });

    expect(result.files).toEqual([
      { path: UPLOADS_PATH, text: UPLOADS_SYNCED },
    ]);
    expect(result.updates).toEqual([
      {
        module: "uploads",
        path: UPLOADS_PATH,
        section: "dependencies",
        name: "sharp",
        from: "^0.35.5",
        to: "^0.35.6",
      },
    ]);
    expect(result.bumps).toEqual([
      { module: "uploads", path: UPLOADS_PATH, from: "0.2.6", to: "0.2.7" },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("two changed dependencies of one module give two updates and one version bump", () => {
    const coreAtBase = coreManifest(
      "0.13.0",
      CORE_DEPENDENCIES_AT_BASE,
      CORE_DEV_DEPENDENCIES_AT_BASE,
    );
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { next: "16.4.7", react: "19.3.1", zod: "^4.4.0" },
        CORE_DEV_DEPENDENCIES_AT_BASE,
      ),
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [],
      readBase: readBaseFrom({ [CORE_PATH]: coreAtBase }),
    });

    expect(result.bumps).toEqual([
      { module: "core", path: CORE_PATH, from: "0.13.0", to: "0.13.1" },
    ]);
    expect(result.updates).toHaveLength(2);
    expect(result.updates).toEqual(
      expect.arrayContaining([
        {
          module: "core",
          path: CORE_PATH,
          section: "dependencies",
          name: "next",
          from: "16.4.6",
          to: "16.4.7",
        },
        {
          module: "core",
          path: CORE_PATH,
          section: "dependencies",
          name: "zod",
          from: "^4.3.6",
          to: "^4.4.0",
        },
      ]),
    );
    const core = parsedFile(result, CORE_PATH);
    expect(core.version).toBe("0.13.1");
    expect(core.dependencies).toEqual({
      next: "16.4.7",
      react: "19.3.1",
      zod: "^4.4.0",
    });
    expect(core.devDependencies).toEqual(CORE_DEV_DEPENDENCIES_AT_BASE);
  });

  it("a manifest that matches the root stays out of files and bumps when another manifest changes", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        {
          ...UPLOADS_ROOT_DEPENDENCIES,
          sharp: "^0.35.6",
          "@noble/hashes": "^2.0.0",
        },
        {},
      ),
      manifests: [
        { path: API_KEYS_PATH, text: API_KEYS_AT_BASE },
        { path: UPLOADS_PATH, text: UPLOADS_AT_BASE },
      ],
      workspacePackages: [],
      readBase: readBaseFrom({
        [API_KEYS_PATH]: API_KEYS_AT_BASE,
        [UPLOADS_PATH]: UPLOADS_AT_BASE,
      }),
    });

    expect(paths(result.files)).toEqual([UPLOADS_PATH]);
    expect(result.bumps.map((bump) => bump.module)).toEqual(["uploads"]);
    expect(result.updates.map((update) => update.module)).toEqual(["uploads"]);
  });

  it("when the root, manifests and versions match the base, the result is empty", () => {
    const coreAtBase = coreManifest(
      "0.13.0",
      CORE_DEPENDENCIES_AT_BASE,
      CORE_DEV_DEPENDENCIES_AT_BASE,
    );
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        {
          ...CORE_DEPENDENCIES_AT_BASE,
          ...UPLOADS_ROOT_DEPENDENCIES,
          sharp: "^0.35.5",
        },
        CORE_DEV_DEPENDENCIES_AT_BASE,
      ),
      manifests: [
        { path: CORE_PATH, text: coreAtBase },
        { path: UPLOADS_PATH, text: UPLOADS_AT_BASE },
      ],
      workspacePackages: [
        {
          path: ENV_PACKAGE_PATH,
          text: workspacePackage("@gatojs/env", { zod: "^4.3.6" }),
        },
      ],
      readBase: readBaseFrom({
        [CORE_PATH]: coreAtBase,
        [UPLOADS_PATH]: UPLOADS_AT_BASE,
        [ENV_PACKAGE_PATH]: workspacePackage("@gatojs/env", { zod: "^4.3.6" }),
      }),
    });

    expect(result).toEqual({ files: [], updates: [], bumps: [], warnings: [] });
  });

  it("the second run on the output of the first changes nothing", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { ...UPLOADS_ROOT_DEPENDENCIES, sharp: "^0.35.6" },
        {},
      ),
      manifests: [{ path: UPLOADS_PATH, text: UPLOADS_SYNCED }],
      workspacePackages: [],
      readBase: readBaseFrom({ [UPLOADS_PATH]: UPLOADS_AT_BASE }),
    });

    expect(result.files).toEqual([]);
    expect(result.bumps).toEqual([]);
    expect(result.updates).toEqual([]);
  });

  it("version already bumped against the base: the pin is updated, the version stays", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { ...UPLOADS_ROOT_DEPENDENCIES, sharp: "^0.35.6" },
        {},
      ),
      manifests: [{ path: UPLOADS_PATH, text: UPLOADS_BUMPED_BUT_STALE }],
      workspacePackages: [],
      readBase: readBaseFrom({ [UPLOADS_PATH]: UPLOADS_AT_BASE }),
    });

    expect(result.files).toEqual([
      { path: UPLOADS_PATH, text: UPLOADS_SYNCED },
    ]);
    expect(result.bumps).toEqual([]);
    expect(result.updates).toEqual([
      {
        module: "uploads",
        path: UPLOADS_PATH,
        section: "dependencies",
        name: "sharp",
        from: "^0.35.5",
        to: "^0.35.6",
      },
    ]);
  });

  it("pins that match the root but differ from the base with an unchanged version: bumps the version without updates", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { ...UPLOADS_ROOT_DEPENDENCIES, sharp: "^0.35.6" },
        {},
      ),
      manifests: [{ path: UPLOADS_PATH, text: UPLOADS_SYNCED_WITHOUT_BUMP }],
      workspacePackages: [],
      readBase: readBaseFrom({ [UPLOADS_PATH]: UPLOADS_AT_BASE }),
    });

    expect(result.files).toEqual([
      { path: UPLOADS_PATH, text: UPLOADS_SYNCED },
    ]);
    expect(result.updates).toEqual([]);
    expect(result.bumps).toEqual([
      { module: "uploads", path: UPLOADS_PATH, from: "0.2.6", to: "0.2.7" },
    ]);
  });

  it("updates a dev dependency in the manifest devDependencies", () => {
    const coreAtBase = coreManifest(
      "0.13.0",
      CORE_DEPENDENCIES_AT_BASE,
      CORE_DEV_DEPENDENCIES_AT_BASE,
    );
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(CORE_DEPENDENCIES_AT_BASE, {
        typescript: "^5.9.3",
        vitest: "^4.1.3",
      }),
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [],
      readBase: readBaseFrom({ [CORE_PATH]: coreAtBase }),
    });

    expect(result.updates).toEqual([
      {
        module: "core",
        path: CORE_PATH,
        section: "devDependencies",
        name: "vitest",
        from: "^4.1.2",
        to: "^4.1.3",
      },
    ]);
    const core = parsedFile(result, CORE_PATH);
    expect(core.devDependencies).toEqual({
      typescript: "^5.9.3",
      vitest: "^4.1.3",
    });
    expect(core.dependencies).toEqual(CORE_DEPENDENCIES_AT_BASE);
    expect(core.version).toBe("0.13.1");
  });

  it("a pin in manifest devDependencies does not take the version from root dependencies", () => {
    const coreAtBase = coreManifest(
      "0.13.0",
      CORE_DEPENDENCIES_AT_BASE,
      CORE_DEV_DEPENDENCIES_AT_BASE,
    );
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { ...CORE_DEPENDENCIES_AT_BASE, vitest: "^5.0.0" },
        { typescript: "^5.9.3" },
      ),
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [],
      readBase: readBaseFrom({ [CORE_PATH]: coreAtBase }),
    });

    expect(result.files).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.bumps).toEqual([]);
  });

  it("a pin in manifest dependencies does not take the version from root devDependencies", () => {
    const coreAtBase = coreManifest(
      "0.13.0",
      CORE_DEPENDENCIES_AT_BASE,
      CORE_DEV_DEPENDENCIES_AT_BASE,
    );
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { next: "16.4.6", react: "19.3.1" },
        { ...CORE_DEV_DEPENDENCIES_AT_BASE, zod: "^4.4.0" },
      ),
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [],
      readBase: readBaseFrom({ [CORE_PATH]: coreAtBase }),
    });

    expect(result.files).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.bumps).toEqual([]);
  });

  it("when the root has a dependency in both sections at different versions, each manifest section takes the version from its own section", () => {
    const coreAtBase = coreManifest(
      "0.13.0",
      CORE_DEPENDENCIES_AT_BASE,
      CORE_DEV_DEPENDENCIES_AT_BASE,
    );
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { ...CORE_DEPENDENCIES_AT_BASE, zod: "^4.4.0", vitest: "^9.9.9" },
        { ...CORE_DEV_DEPENDENCIES_AT_BASE, zod: "^8.8.8", vitest: "^4.1.3" },
      ),
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [],
      readBase: readBaseFrom({ [CORE_PATH]: coreAtBase }),
    });

    const core = parsedFile(result, CORE_PATH);
    expect(core.dependencies.zod).toBe("^4.4.0");
    expect(core.devDependencies.vitest).toBe("^4.1.3");
    expect(core.dependencies.vitest).toBeUndefined();
    expect(core.devDependencies.zod).toBeUndefined();
  });

  it("a manifest dependency missing from the root stays unchanged and causes no bump", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(UPLOADS_ROOT_DEPENDENCIES, {}),
      manifests: [{ path: UPLOADS_PATH, text: UPLOADS_AT_BASE }],
      workspacePackages: [],
      readBase: readBaseFrom({ [UPLOADS_PATH]: UPLOADS_AT_BASE }),
    });

    expect(result.files).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.bumps).toEqual([]);
  });

  it("keeps the hand formatting of the manifest: one-line objects stay, only the value lines change", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson({ "@noble/hashes": "^2.0.1" }, {}),
      manifests: [{ path: API_KEYS_PATH, text: API_KEYS_AT_BASE }],
      workspacePackages: [],
      readBase: readBaseFrom({ [API_KEYS_PATH]: API_KEYS_AT_BASE }),
    });

    expect(result.files).toEqual([
      { path: API_KEYS_PATH, text: API_KEYS_SYNCED },
    ]);
  });

  it("the same name and value in both manifest sections: only the entry of the section that changed in the root changes", () => {
    const coreAtBase = coreManifest(
      "0.13.0",
      { ...CORE_DEPENDENCIES_AT_BASE, dotenv: "^17.3.1" },
      { ...CORE_DEV_DEPENDENCIES_AT_BASE, dotenv: "^17.3.1" },
    );
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { ...CORE_DEPENDENCIES_AT_BASE, dotenv: "^17.3.1" },
        { ...CORE_DEV_DEPENDENCIES_AT_BASE, dotenv: "^17.4.0" },
      ),
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [],
      readBase: readBaseFrom({ [CORE_PATH]: coreAtBase }),
    });

    const core = parsedFile(result, CORE_PATH);
    expect(core.dependencies.dotenv).toBe("^17.3.1");
    expect(core.devDependencies.dotenv).toBe("^17.4.0");
    expect(result.updates).toEqual([
      {
        module: "core",
        path: CORE_PATH,
        section: "devDependencies",
        name: "dotenv",
        from: "^17.3.1",
        to: "^17.4.0",
      },
    ]);
  });

  it("a module absent at the base gets updated pins but no version bump", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { ...UPLOADS_ROOT_DEPENDENCIES, sharp: "^0.35.6" },
        {},
      ),
      manifests: [{ path: UPLOADS_PATH, text: UPLOADS_AT_BASE }],
      workspacePackages: [],
      readBase: readBaseFrom({}),
    });

    expect(result.bumps).toEqual([]);
    expect(result.updates).toEqual([
      {
        module: "uploads",
        path: UPLOADS_PATH,
        section: "dependencies",
        name: "sharp",
        from: "^0.35.5",
        to: "^0.35.6",
      },
    ]);
    const uploads = parsedFile(result, UPLOADS_PATH);
    expect(uploads.version).toBe("0.2.6");
    expect(uploads.dependencies.sharp).toBe("^0.35.6");
  });

  it("syncs a manifest with an escaped quote in a string value", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson({ sharp: "^0.35.6" }, {}),
      manifests: [{ path: UPLOADS_PATH, text: QUOTED_DESCRIPTION_AT_BASE }],
      workspacePackages: [],
      readBase: readBaseFrom({ [UPLOADS_PATH]: QUOTED_DESCRIPTION_AT_BASE }),
    });

    expect(result.files).toEqual([
      { path: UPLOADS_PATH, text: QUOTED_DESCRIPTION_SYNCED },
    ]);
  });

  it.each([
    [
      "dependencies",
      DESCRIPTION_NAMED_DEPENDENCIES_AT_BASE,
      DESCRIPTION_NAMED_DEPENDENCIES_SYNCED,
    ],
    [
      "version",
      DESCRIPTION_NAMED_VERSION_AT_BASE,
      DESCRIPTION_NAMED_VERSION_SYNCED,
    ],
  ])(
    "a top-level string value %j is not mistaken for a key: the real section and version change",
    (_value, atBase, synced) => {
      const result = syncManifestDependencies({
        rootPackageJson: rootPackageJson({ sharp: "^0.35.6" }, {}),
        manifests: [{ path: UPLOADS_PATH, text: atBase }],
        workspacePackages: [],
        readBase: readBaseFrom({ [UPLOADS_PATH]: atBase }),
      });

      expect(result.files).toEqual([{ path: UPLOADS_PATH, text: synced }]);
    },
  );

  it("manifest pins equal to the base in a different key order cause no bump", () => {
    const atBase = uploadsManifestWithPins([
      ["@aws-sdk/client-s3", "^3.1173.0"],
      ["file-type", "^22.3.0"],
      ["sharp", "^0.35.5"],
    ]);
    const reordered = uploadsManifestWithPins([
      ["sharp", "^0.35.5"],
      ["@aws-sdk/client-s3", "^3.1173.0"],
      ["file-type", "^22.3.0"],
    ]);
    const result = syncManifestDependencies({
      rootPackageJson: rootPackageJson(
        { ...UPLOADS_ROOT_DEPENDENCIES, sharp: "^0.35.5" },
        {},
      ),
      manifests: [{ path: UPLOADS_PATH, text: reordered }],
      workspacePackages: [],
      readBase: readBaseFrom({ [UPLOADS_PATH]: atBase }),
    });

    expect(result.bumps).toEqual([]);
    expect(result.files).toEqual([]);
  });

  test.prop([
    fc.shuffledSubarray(
      [
        ["@aws-sdk/client-s3", "^3.1173.0"],
        ["file-type", "^22.3.0"],
        ["sharp", "^0.35.5"],
        ["zod", "^4.3.6"],
      ] satisfies [string, string][],
      { minLength: 4, maxLength: 4 },
    ),
  ])(
    "any key order of pins equal to the base and the root changes nothing",
    (shuffled) => {
      const atBase = uploadsManifestWithPins([
        ["@aws-sdk/client-s3", "^3.1173.0"],
        ["file-type", "^22.3.0"],
        ["sharp", "^0.35.5"],
        ["zod", "^4.3.6"],
      ]);
      const result = syncManifestDependencies({
        rootPackageJson: rootPackageJson(
          {
            ...UPLOADS_ROOT_DEPENDENCIES,
            sharp: "^0.35.5",
            zod: "^4.3.6",
          },
          {},
        ),
        manifests: [
          { path: UPLOADS_PATH, text: uploadsManifestWithPins(shuffled) },
        ],
        workspacePackages: [],
        readBase: readBaseFrom({ [UPLOADS_PATH]: atBase }),
      });

      expect(result.bumps).toEqual([]);
      expect(result.files).toEqual([]);
    },
  );
});

describe("syncManifestDependencies: workspace packages", () => {
  const coreAtBase = coreManifest(
    "0.13.0",
    { ...CORE_DEPENDENCIES_AT_BASE, zod: "^4.4.0" },
    CORE_DEV_DEPENDENCIES_AT_BASE,
  );
  const rootWithNewZod = rootPackageJson(
    { ...CORE_DEPENDENCIES_AT_BASE, zod: "^4.4.0" },
    CORE_DEV_DEPENDENCIES_AT_BASE,
  );

  it("changed dependencies of a workspace package bump the module that owns it, without pin updates", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootWithNewZod,
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [
        {
          path: ENV_PACKAGE_PATH,
          text: workspacePackage("@gatojs/env", { zod: "^4.4.0" }),
        },
      ],
      readBase: readBaseFrom({
        [CORE_PATH]: coreAtBase,
        [ENV_PACKAGE_PATH]: workspacePackage("@gatojs/env", { zod: "^4.3.6" }),
      }),
    });

    expect(result.bumps).toEqual([
      { module: "core", path: CORE_PATH, from: "0.13.0", to: "0.13.1" },
    ]);
    expect(result.updates).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(paths(result.files)).toEqual([CORE_PATH]);
    expect(parsedFile(result, CORE_PATH).version).toBe("0.13.1");
  });

  it("a workspace package change bumps only its owner, not other modules", () => {
    const encryptionAtBase = encryptionManifest("0.1.1");
    const result = syncManifestDependencies({
      rootPackageJson: rootWithNewZod,
      manifests: [
        { path: CORE_PATH, text: coreAtBase },
        { path: ENCRYPTION_PATH, text: encryptionAtBase },
      ],
      workspacePackages: [
        {
          path: CRYPTO_PACKAGE_PATH,
          text: workspacePackage("@gatojs/crypto", {
            "@noble/ciphers": "^2.0.0",
          }),
        },
        {
          path: ENV_PACKAGE_PATH,
          text: workspacePackage("@gatojs/env", { zod: "^4.4.0" }),
        },
      ],
      readBase: readBaseFrom({
        [CORE_PATH]: coreAtBase,
        [ENCRYPTION_PATH]: encryptionAtBase,
        [CRYPTO_PACKAGE_PATH]: workspacePackage("@gatojs/crypto", {
          "@noble/ciphers": "^1.3.0",
        }),
        [ENV_PACKAGE_PATH]: workspacePackage("@gatojs/env", { zod: "^4.4.0" }),
      }),
    });

    expect(result.bumps).toEqual([
      {
        module: "encryption",
        path: ENCRYPTION_PATH,
        from: "0.1.1",
        to: "0.1.2",
      },
    ]);
    expect(paths(result.files)).toEqual([ENCRYPTION_PATH]);
  });

  it("a changed workspace package without an owner bumps nothing", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootWithNewZod,
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [
        {
          path: GATO_CLI_PACKAGE_PATH,
          text: workspacePackage("@gatojs/cli", { "fast-glob": "^3.3.4" }),
        },
      ],
      readBase: readBaseFrom({
        [CORE_PATH]: coreAtBase,
        [GATO_CLI_PACKAGE_PATH]: workspacePackage("@gatojs/cli", {
          "fast-glob": "^3.3.3",
        }),
      }),
    });

    expect(result.bumps).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it("a workspace package absent at the base does not bump its owner", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootWithNewZod,
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [
        {
          path: ENV_PACKAGE_PATH,
          text: workspacePackage("@gatojs/env", { zod: "^4.4.0" }),
        },
      ],
      readBase: readBaseFrom({ [CORE_PATH]: coreAtBase }),
    });

    expect(result.bumps).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it("a workspace package change outside the dependency sections does not bump its owner", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootWithNewZod,
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [
        {
          path: ENV_PACKAGE_PATH,
          text: workspacePackage(
            "@gatojs/env",
            { zod: "^4.4.0" },
            "0.2.0",
            "Typed environment",
          ),
        },
      ],
      readBase: readBaseFrom({
        [CORE_PATH]: coreAtBase,
        [ENV_PACKAGE_PATH]: workspacePackage("@gatojs/env", { zod: "^4.4.0" }),
      }),
    });

    expect(result.bumps).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it("a workspace package with a stale pin of a synced dependency gives a warning and stays out of files", () => {
    const coreWithOldZod = coreManifest(
      "0.13.0",
      CORE_DEPENDENCIES_AT_BASE,
      CORE_DEV_DEPENDENCIES_AT_BASE,
    );
    const staleEnv = workspacePackage("@gatojs/env", { zod: "^4.3.6" });
    const result = syncManifestDependencies({
      rootPackageJson: rootWithNewZod,
      manifests: [{ path: CORE_PATH, text: coreWithOldZod }],
      workspacePackages: [{ path: ENV_PACKAGE_PATH, text: staleEnv }],
      readBase: readBaseFrom({
        [CORE_PATH]: coreWithOldZod,
        [ENV_PACKAGE_PATH]: staleEnv,
      }),
    });

    expect(result.warnings).toEqual([
      "packages/env/package.json pins zod ^4.3.6; package.json has ^4.4.0",
    ]);
    expect(paths(result.files)).toEqual([CORE_PATH]);
    expect(result.bumps).toEqual([
      { module: "core", path: CORE_PATH, from: "0.13.0", to: "0.13.1" },
    ]);
  });

  it.each(["devDependencies", "peerDependencies", "optionalDependencies"])(
    "a workspace package whose only change is in %s bumps its owner",
    (section) => {
      const result = syncManifestDependencies({
        rootPackageJson: rootWithNewZod,
        manifests: [{ path: CORE_PATH, text: coreAtBase }],
        workspacePackages: [
          {
            path: ENV_PACKAGE_PATH,
            text: workspacePackageWithSections("@gatojs/env", {
              dependencies: { zod: "^4.4.0" },
              [section]: { typescript: "^5.9.4" },
            }),
          },
        ],
        readBase: readBaseFrom({
          [CORE_PATH]: coreAtBase,
          [ENV_PACKAGE_PATH]: workspacePackageWithSections("@gatojs/env", {
            dependencies: { zod: "^4.4.0" },
            [section]: { typescript: "^5.9.3" },
          }),
        }),
      });

      expect(result.bumps).toEqual([
        { module: "core", path: CORE_PATH, from: "0.13.0", to: "0.13.1" },
      ]);
    },
  );

  it("a files glob with a wildcard inside a segment owns the matching workspace package", () => {
    const encryptionAtBase = encryptionManifest("0.1.1", [
      "packages/cr*/**",
      "src/features/encryption/**",
    ]);
    const result = syncManifestDependencies({
      rootPackageJson: rootWithNewZod,
      manifests: [{ path: ENCRYPTION_PATH, text: encryptionAtBase }],
      workspacePackages: [
        {
          path: CRYPTO_PACKAGE_PATH,
          text: workspacePackage("@gatojs/crypto", {
            "@noble/ciphers": "^2.0.0",
          }),
        },
      ],
      readBase: readBaseFrom({
        [ENCRYPTION_PATH]: encryptionAtBase,
        [CRYPTO_PACKAGE_PATH]: workspacePackage("@gatojs/crypto", {
          "@noble/ciphers": "^1.3.0",
        }),
      }),
    });

    expect(result.bumps).toEqual([
      {
        module: "encryption",
        path: ENCRYPTION_PATH,
        from: "0.1.1",
        to: "0.1.2",
      },
    ]);
  });

  it("workspace dependencies equal to the base in a different key order do not bump the owner", () => {
    const result = syncManifestDependencies({
      rootPackageJson: rootWithNewZod,
      manifests: [{ path: CORE_PATH, text: coreAtBase }],
      workspacePackages: [
        {
          path: ENV_PACKAGE_PATH,
          text: workspacePackage("@gatojs/env", {
            zod: "^4.4.0",
            dotenv: "^17.3.1",
          }),
        },
      ],
      readBase: readBaseFrom({
        [CORE_PATH]: coreAtBase,
        [ENV_PACKAGE_PATH]: workspacePackage("@gatojs/env", {
          dotenv: "^17.3.1",
          zod: "^4.4.0",
        }),
      }),
    });

    expect(result.bumps).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it("an update gives no warning for workspace packages that do not pin the old version", () => {
    const coreWithOldZod = coreManifest(
      "0.13.0",
      CORE_DEPENDENCIES_AT_BASE,
      CORE_DEV_DEPENDENCIES_AT_BASE,
    );
    const observability = workspacePackage("@gatojs/observability", {
      "@opentelemetry/api-logs": "^0.218.0",
    });
    const freshEnv = workspacePackage("@gatojs/env", { zod: "^4.4.0" });
    const result = syncManifestDependencies({
      rootPackageJson: rootWithNewZod,
      manifests: [{ path: CORE_PATH, text: coreWithOldZod }],
      workspacePackages: [
        { path: ENV_PACKAGE_PATH, text: freshEnv },
        { path: "packages/observability/package.json", text: observability },
      ],
      readBase: readBaseFrom({
        [CORE_PATH]: coreWithOldZod,
        [ENV_PACKAGE_PATH]: freshEnv,
        "packages/observability/package.json": observability,
      }),
    });

    expect(result.updates).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });
});

describe("bumpPatch", () => {
  it("bumps only the patch part", () => {
    expect(bumpPatch("0.2.9")).toBe("0.2.10");
    expect(bumpPatch("1.0.0")).toBe("1.0.1");
    expect(bumpPatch("0.13.0")).toBe("0.13.1");
  });

  it.each(["1.0", "1.0.0-rc.1", "v1.0.0", "1.0.0.0", ""])(
    "rejects a version outside the a.b.c format: %j",
    (version) => {
      expectValidationError(() => bumpPatch(version));
    },
  );

  test.prop([fc.nat(), fc.nat(), fc.nat()])(
    "for any a.b.c returns a.b.(c+1)",
    (major, minor, patch) => {
      expect(bumpPatch(`${major}.${minor}.${patch}`)).toBe(
        `${major}.${minor}.${patch + 1}`,
      );
    },
  );

  test.prop([
    fc.nat(),
    fc.nat(),
    fc.nat(),
    fc.stringMatching(/^[0-9A-Za-z.]{1,12}$/),
  ])(
    "rejects every version with a pre-release suffix",
    (major, minor, patch, tag) => {
      expectValidationError(() =>
        bumpPatch(`${major}.${minor}.${patch}-${tag}`),
      );
    },
  );
});

describe("parseSyncArgs", () => {
  it("without arguments: base origin/main, write mode", () => {
    expect(parseSyncArgs([])).toEqual({ base: "origin/main", check: false });
  });

  it("accepts --check and --base with the value in a separate argument", () => {
    expect(parseSyncArgs(["--check", "--base", "origin/dev"])).toEqual({
      base: "origin/dev",
      check: true,
    });
  });

  it("accepts --base=value", () => {
    expect(parseSyncArgs(["--base=x"])).toEqual({ base: "x", check: false });
  });

  it("rejects an unknown flag", () => {
    expectValidationError(() => parseSyncArgs(["--force"]));
  });

  it("rejects --base without a value", () => {
    expectValidationError(() => parseSyncArgs(["--base"]));
    expect(rejectionMessage(() => parseSyncArgs(["--base"]))).toContain(
      "--base",
    );
  });

  it.each([[["--force", "x"]], [["--base", "--check"]], [["--base="]]])(
    "rejects %j",
    (argv) => {
      expectValidationError(() => parseSyncArgs(argv));
    },
  );
});

describe("formatReport", () => {
  const twoModules: SyncResult = {
    files: [
      { path: UPLOADS_PATH, text: UPLOADS_SYNCED },
      { path: CORE_PATH, text: "{}\n" },
    ],
    updates: [
      {
        module: "uploads",
        path: UPLOADS_PATH,
        section: "dependencies",
        name: "sharp",
        from: "^0.35.5",
        to: "^0.35.6",
      },
      {
        module: "core",
        path: CORE_PATH,
        section: "dependencies",
        name: "zod",
        from: "^4.3.6",
        to: "^4.4.0",
      },
    ],
    bumps: [
      { module: "uploads", path: UPLOADS_PATH, from: "0.2.6", to: "0.2.7" },
      { module: "core", path: CORE_PATH, from: "0.13.0", to: "0.13.1" },
    ],
    warnings: [
      "packages/env/package.json pins zod ^4.3.6; package.json has ^4.4.0",
    ],
  };

  it("lists each module bump with its updates under it, then the warnings", () => {
    expect(formatReport(twoModules)).toBe(
      [
        "kit/modules/uploads.json 0.2.6 -> 0.2.7",
        "  sharp ^0.35.5 -> ^0.35.6",
        "kit/modules/core.json 0.13.0 -> 0.13.1",
        "  zod ^4.3.6 -> ^4.4.0",
        "warning: packages/env/package.json pins zod ^4.3.6; package.json has ^4.4.0",
      ].join("\n"),
    );
  });

  it("a result with only a bump lists just the bump line", () => {
    expect(
      formatReport({
        files: [],
        updates: [],
        bumps: [
          {
            module: "core",
            path: "kit/modules/core.json",
            from: "0.13.0",
            to: "0.13.1",
          },
        ],
        warnings: [],
      }),
    ).toBe("kit/modules/core.json 0.13.0 -> 0.13.1");
  });

  it("a result with only an update lists the manifest path and the update under it", () => {
    expect(
      formatReport({
        files: [],
        updates: [
          {
            module: "uploads",
            path: "kit/modules/uploads.json",
            section: "dependencies",
            name: "sharp",
            from: "^0.35.5",
            to: "^0.35.6",
          },
        ],
        bumps: [],
        warnings: [],
      }),
    ).toBe("kit/modules/uploads.json\n  sharp ^0.35.5 -> ^0.35.6");
  });

  it("an empty result reports that the manifests already follow package.json", () => {
    expect(
      formatReport({ files: [], updates: [], bumps: [], warnings: [] }),
    ).toBe("Manifests already follow package.json.");
  });
});
