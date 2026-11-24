import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const KIT_COMPOSE = `services:
  db:
    image: postgres:16
    restart: always
    ports:
      - "\${DB_PORT:-5432}:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: wa_app
    volumes:
      - ./volumes/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 3s
      retries: 5
  mail:
    image: axllent/mailpit
    restart: always
    ports:
      - "\${MAILPIT_UI_PORT:-8025}:8025"
      - "\${MAILPIT_SMTP_PORT:-1025}:1025"
  # wa:services:start
  minio:
    image: cgr.dev/chainguard/minio:latest@sha256:3b6e40c30ecd5cea627e382ff0b82ca841f58c52294578787043ee80c8ef7c82
    profiles: ["s3"]
    restart: always
    user: "0:0"
    command: ["server", "/data", "--console-address", ":9001"]
    ports:
      - "\${MINIO_PORT:-9000}:9000"
      - "\${MINIO_CONSOLE_PORT:-9001}:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - ./volumes/minio:/data
  minio-init:
    image: amazon/aws-cli:2.39.2
    profiles: ["s3"]
    depends_on:
      minio:
        condition: service_started
    restart: "no"
    environment:
      AWS_ACCESS_KEY_ID: minioadmin
      AWS_SECRET_ACCESS_KEY: minioadmin
      AWS_DEFAULT_REGION: us-east-1
    entrypoint:
      - sh
      - -c
      - >-
        for _ in $$(seq 1 30); do
        aws --endpoint-url http://minio:9000 s3api head-bucket --bucket wa-app-uploads 2>/dev/null
        || aws --endpoint-url http://minio:9000 s3 mb s3://wa-app-uploads 2>/dev/null
        && exit 0; sleep 2; done; echo "bucket creation failed" >&2; exit 1
  # wa:services:end
`;

export const KIT_NODE_RANGE = "^22.12.0 || ^24.0.0 || ^26.0.0";

export const KIT_MODULE_FILES: Record<string, unknown> = {
  "core.json": { name: "core", version: "0.10.2", description: "Core", requires: [] },
  "uploads.json": {
    name: "uploads",
    version: "0.2.7",
    description: "Organization files on local disk or in S3 storage",
    requires: [],
    files: ["src/features/uploads/**"],
  },
  "api-keys.json": {
    name: "api-keys",
    version: "0.1.0",
    description: "API keys for organizations",
    requires: [],
  },
};

export async function writeKit(
  kitDir: string,
  packageJson: unknown = { name: "gatojs", engines: { node: KIT_NODE_RANGE } },
): Promise<void> {
  await mkdir(join(kitDir, "kit", "modules"), { recursive: true });
  await writeFile(join(kitDir, "package.json"), JSON.stringify(packageJson));
  for (const [file, manifest] of Object.entries(KIT_MODULE_FILES)) {
    await writeFile(join(kitDir, "kit", "modules", file), JSON.stringify(manifest));
  }
}

export function base64Wrapped(text: string): string {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  const lines: string[] = [];
  for (let index = 0; index < encoded.length; index += 60) {
    lines.push(encoded.slice(index, index + 60));
  }
  return `${lines.join("\n")}\n`;
}
