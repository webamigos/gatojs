import { integrationDatabaseUrl } from "./database-url";

Object.assign(process.env, {
  DATABASE_URL: integrationDatabaseUrl(),
  BETTER_AUTH_SECRET: "integration-secret-".padEnd(48, "x"),
  APP_URL: "http://localhost:3000",
  EMAIL_FROM: "WA Test <noreply@example.com>",
  MULTI_ORG: "false",
  AUTH_PUBLIC_SIGNUP: "false",
});
