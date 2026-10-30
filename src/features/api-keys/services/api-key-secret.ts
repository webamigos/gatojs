import { createHmac, randomBytes } from "node:crypto";
import { project } from "@/shared/config/project";

const SECRET_BYTES = 32;
const DISPLAY_SECRET_CHARS = 6;

export function apiKeyPrefix(): string {
  return `${project.slug.replaceAll("-", "_")}_live_`;
}

export function generateApiKey(prefix: string = apiKeyPrefix()): {
  plaintext: string;
  displayPrefix: string;
} {
  const plaintext = prefix + randomBytes(SECRET_BYTES).toString("base64url");
  return {
    plaintext,
    displayPrefix: plaintext.slice(0, prefix.length + DISPLAY_SECRET_CHARS),
  };
}

export function hashApiKey(plaintext: string, pepper: string): string {
  return createHmac("sha256", pepper).update(plaintext).digest("hex");
}
