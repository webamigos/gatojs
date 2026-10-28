const SLUG_BASE_MAX_LENGTH = 48;

export function slugifyOrganizationName(name: string): string {
  const base = name
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_BASE_MAX_LENGTH)
    .replace(/-+$/, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${base || "organizacja"}-${suffix}`;
}
