import { project } from "@/shared/config/project";
import { integrationDatabaseUrl } from "./database-url";

Object.assign(process.env, {
  DATABASE_URL: integrationDatabaseUrl(),
  BETTER_AUTH_SECRET: "integration-secret-".padEnd(48, "x"),
  APP_URL: "http://localhost:3000",
  EMAIL_FROM: "WA Test <noreply@example.com>",
  API_KEY_PEPPER: "integration-pepper-".padEnd(48, "x"),
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: process.env.INTEGRATION_S3_ENDPOINT ?? "http://localhost:9000",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_BUCKET: process.env.INTEGRATION_S3_BUCKET ?? `${project.slug}-uploads`,
  S3_FORCE_PATH_STYLE: "true",
  MULTI_ORG: "false",
  AUTH_PUBLIC_SIGNUP: "false",
});
