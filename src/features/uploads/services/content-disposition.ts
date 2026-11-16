export function contentDisposition(
  fileName: string,
  disposition: "inline" | "attachment",
): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]|[";\x5c]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
