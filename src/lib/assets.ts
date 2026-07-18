const EXTERNAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/** Convert a public-root logical path into the active Vite deployment path. */
export function resolveAssetPath(
  path: string,
  baseUrl: string = import.meta.env.BASE_URL,
): string {
  if (!path || EXTERNAL_URL.test(path)) return path;

  const base = `/${baseUrl.replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");
  const cleanPath = path.replace(/^\.\//, "").replace(/^\/+/, "");
  const resolved = `${base}${cleanPath}`.replace(/\/{2,}/g, "/");
  return path.startsWith(base) ? path : resolved;
}
