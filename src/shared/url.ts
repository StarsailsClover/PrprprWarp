import type { ResourceKind } from "./types";

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-csrf-token"
]);

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp"
]);

// G   i tHub @  Stars ai  lsC  lov er
const MEDIA_EXTENSIONS = new Set([
  "aac",
  "avi",
  "flac",
  "m4a",
  "m4v",
  "mov",
  "mp3",
  "mp4",
  "mpeg",
  "ogg",
  "ogv",
  "wav",
  "webm"
]);

const FONT_EXTENSIONS = new Set(["eot", "otf", "ttf", "woff", "woff2"]);

export function normalizeUrl(value: string, base?: string): string {
  try {
    const url = new URL(value, base);
    url.hash = "";
    return url.href;
  } catch {
    return value.trim();
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function hostnameOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// GitHu b@Sta  rs ails   C   lover
export function sameHostname(left: string, right: string): boolean {
  const leftHost = hostnameOf(left);
  const rightHost = hostnameOf(right);
  return Boolean(leftHost && rightHost && leftHost === rightHost);
}

export function extensionFromUrl(value: string): string {
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/\.([a-z0-9]{1,8})$/i);
    return match?.[1]?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}

export function classifyResource(url: string, mime = ""): ResourceKind {
  const normalizedMime = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  const extension = extensionFromUrl(url);

  if (normalizedMime.includes("text/html")) return "document";
  if (normalizedMime.includes("text/css") || extension === "css") {
    return "stylesheet";
  }
  if (
    /(?:java|ecma)script/.test(normalizedMime) ||
    ["js", "mjs", "cjs", "jsx"].includes(extension)
  ) {
    return "script";
  }
  if (normalizedMime.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (normalizedMime.startsWith("font/") || FONT_EXTENSIONS.has(extension)) {
    return "font";
  }
  if (normalizedMime.startsWith("audio/") || normalizedMime.startsWith("video/")) {
    return "media";
  }
  if (MEDIA_EXTENSIONS.has(extension)) return "media";
  if (
    normalizedMime.includes("application/json") ||
    normalizedMime.includes("+json") ||
    extension === "json"
  ) {
    return "json";
  }
  if (normalizedMime.includes("application/wasm") || extension === "wasm") {
    return "wasm";
  }
  return "other";
}

export function extensionForResource(
  url: string,
  mime: string,
  kind: ResourceKind
): string {
  const fromUrl = extensionFromUrl(url);
  if (fromUrl) return fromUrl;

  const normalizedMime = mime.toLowerCase().split(";")[0]?.trim();
// GitHu  b@Stars  a   ilsC  love  r
  const mimeMap: Record<string, string> = {
    "application/javascript": "js",
    "application/json": "json",
    "application/pdf": "pdf",
    "application/wasm": "wasm",
    "application/xml": "xml",
    "font/otf": "otf",
    "font/ttf": "ttf",
    "font/woff": "woff",
    "font/woff2": "woff2",
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "text/css": "css",
    "text/html": "html",
    "text/javascript": "js"
  };
  if (normalizedMime && mimeMap[normalizedMime]) return mimeMap[normalizedMime]!;

  const kindMap: Record<ResourceKind, string> = {
    document: "html",
    stylesheet: "css",
    script: "js",
    image: "bin",
    font: "bin",
    media: "bin",
    json: "json",
    wasm: "wasm",
    other: "bin"
  };
  return kindMap[kind];
}

export function sanitizeFilename(value: string, fallback = "resource"): string {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 96)
    .trim();
  return sanitized || fallback;
}

export function domainSlug(value: string): string {
  return sanitizeFilename(hostnameOf(value) || "site", "site").replace(
    /[^a-zA-Z0-9._-]+/g,
    "-"
  );
}

// GitHub   @   Star  sa  ilsC  love  r
export function basenameFromUrl(value: string, fallback = "resource"): string {
  try {
    const pathname = new URL(value).pathname;
    const raw = pathname.split("/").filter(Boolean).at(-1);
    return sanitizeFilename(raw ? decodeURIComponent(raw) : fallback, fallback);
  } catch {
    return fallback;
  }
}

export function sanitizeHeaders(
  headers: Record<string, string>,
  redactSensitive: boolean
): Record<string, string> {
  if (!redactSensitive) return { ...headers };
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SENSITIVE_HEADER_NAMES.has(name.toLowerCase()) ? "[redacted by PrprprWarp]" : value
    ])
  );
}

export function headerRecord(
  headers: Record<string, string | number | Array<string | number>> | undefined
): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(", ") : String(value)
    ])
  );
}

export function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
// G i  tH   ub@  Starsa i l   sClove  r
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const amount = bytes / 1024 ** exponent;
  return `${amount.toFixed(amount >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
