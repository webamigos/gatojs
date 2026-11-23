import { basename } from "node:path";

export type ProjectNames = { name: string; slug: string; snake: string };

const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,49}$/;

function displayName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function projectNames(
  target: string,
  title: string | null,
): ProjectNames {
  const slug = basename(target);
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Project name "${slug}": use lowercase letters, digits and hyphens, start with a letter, 2–50 characters`,
    );
  }
  return {
    name: title ?? displayName(slug),
    slug,
    snake: slug.replaceAll("-", "_"),
  };
}
