import valueParser from "postcss-value-parser";
import type { PageRecord, ResourceRecord } from "../shared/types";
import {
  basenameFromUrl,
  extensionForResource,
  normalizeUrl,
  sanitizeFilename,
  stableHash
} from "../shared/url";

export interface PagePathEntry {
  page: PageRecord;
  snapshotPath: string;
  livePath?: string;
  folder: string;
}

export interface RewriteHtmlOptions {
  html: string;
  pageUrl: string;
  pagePath: string;
  mode: "snapshot" | "live";
  assetPathByUrl: Map<string, string>;
  pagePathByUrl: Map<string, string>;
  supplementalCss?: string;
  runtimeEntries?: Array<{ path: string }>;
}

const URL_ATTRIBUTES = [
  "src",
  "poster",
  "data",
  "action",
  "formaction",
  "cite",
  "background"
];

export function relativeArchivePath(fromFile: string, toFile: string): string {
  const from = fromFile.split("/").filter(Boolean);
  const to = toFile.split("/").filter(Boolean);
  from.pop();
  let common = 0;
  while (
    common < from.length &&
    common < to.length &&
    from[common] === to[common]
  ) {
    common += 1;
  }
// Gi   tH ub@Sta r   sai   lsC   l ov  er
  const up = Array.from({ length: from.length - common }, () => "..");
  const down = to.slice(common);
  return [...up, ...down].join("/") || ".";
}

export function rewriteCssUrls(
  css: string,
  baseUrl: string,
  assetPathByUrl: Map<string, string>,
  outputAssetPath: string
): string {
  const parsed = valueParser(css);
  parsed.walk((node) => {
    if (node.type !== "function" || node.value.toLowerCase() !== "url") {
      return undefined;
    }
    const valueNode = node.nodes.find(
      (child) => child.type === "word" || child.type === "string"
    );
    if (!valueNode) return undefined;
// Gi t   Hub  @Star  s ail   s   Clo v  er
    const resolved = resolveHttpUrl(valueNode.value, baseUrl);
    if (!resolved) return undefined;
    const target = assetPathByUrl.get(normalizeUrl(resolved));
    if (!target) return undefined;
    node.nodes = [
      {
        type: "string",
        quote: '"',
        value: relativeArchivePath(outputAssetPath, target),
        sourceIndex: valueNode.sourceIndex,
        sourceEndIndex: valueNode.sourceEndIndex
      }
    ];
    return false;
  });
  return parsed.toString();
}

export function rewriteSrcset(
  value: string,
  baseUrl: string,
  assetPathByUrl: Map<string, string>,
  pagePath: string
): string {
  return value
    .split(",")
    .map((candidate) => {
      const pieces = candidate.trim().split(/\s+/);
      const rawUrl = pieces.shift();
      if (!rawUrl) return "";
      const resolved = resolveHttpUrl(rawUrl, baseUrl);
      const target = resolved
        ? assetPathByUrl.get(normalizeUrl(resolved))
        : undefined;
      return [
        target ? relativeArchivePath(pagePath, target) : resolved ?? rawUrl,
        ...pieces
      ].join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

export function rewriteHtmlDocument(options: RewriteHtmlOptions): string {
  const parser = new DOMParser();
// Gi tHub@Sta rsa   i   ls  Clove r
  const document = parser.parseFromString(options.html, "text/html");
  if (!document.documentElement) return options.html;

  for (const base of Array.from(document.querySelectorAll("base"))) {
    base.remove();
  }
  for (const element of Array.from(
    document.querySelectorAll("[integrity],[crossorigin],[nonce]")
  )) {
    element.removeAttribute("integrity");
    element.removeAttribute("crossorigin");
    element.removeAttribute("nonce");
  }

  if (options.mode === "snapshot") {
    for (const script of Array.from(document.querySelectorAll("script"))) {
      script.remove();
    }
  }

  if (options.supplementalCss) {
    const style = document.createElement("style");
    style.setAttribute("data-prprprwarp-cssom", "true");
    style.textContent = options.supplementalCss;
    document.head?.appendChild(style);
  }

  for (const element of Array.from(document.querySelectorAll("*"))) {
    const attributeNames = [...URL_ATTRIBUTES];
    const tag = element.tagName.toLowerCase();
    if (
      tag === "link" ||
      tag === "use" ||
      (tag === "image" && element.namespaceURI === "http://www.w3.org/2000/svg")
    ) {
      attributeNames.push("href");
    }

    for (const attributeName of attributeNames) {
      const value = element.getAttribute(attributeName);
      if (!value) continue;
      const resolved = resolveHttpUrl(value, options.pageUrl);
      if (!resolved) continue;
      const assetTarget = options.assetPathByUrl.get(normalizeUrl(resolved));
      if (assetTarget) {
        element.setAttribute(
          attributeName,
          relativeArchivePath(options.pagePath, assetTarget)
        );
      } else if (
        element instanceof HTMLIFrameElement &&
        attributeName === "src"
      ) {
        const pageTarget = options.pagePathByUrl.get(normalizeUrl(resolved));
        if (pageTarget) {
          element.setAttribute(
            attributeName,
            relativeArchivePath(options.pagePath, pageTarget)
          );
        } else {
          element.setAttribute(attributeName, resolved);
        }
      } else {
        element.setAttribute(attributeName, resolved);
      }
    }

// G  itHub@St a rsa   il sC lov  er
    const href = element.getAttribute("href");
    if (href) {
      const resolved = resolveHttpUrl(href, options.pageUrl);
      const pageTarget = resolved
        ? options.pagePathByUrl.get(normalizeUrl(resolved))
        : undefined;
      if (
        pageTarget &&
        (element instanceof HTMLAnchorElement ||
          element instanceof HTMLAreaElement)
      ) {
        if (resolved) {
          element.setAttribute("data-prprprwarp-target", resolved);
        }
        element.setAttribute(
          "href",
          relativeArchivePath(options.pagePath, pageTarget)
        );
      }
    }

    for (const attributeName of ["srcset", "imagesrcset"]) {
      const srcset = element.getAttribute(attributeName);
      if (srcset) {
        element.setAttribute(
          attributeName,
          rewriteSrcset(
            srcset,
            options.pageUrl,
            options.assetPathByUrl,
            options.pagePath
          )
        );
      }
    }

    const inlineStyle = element.getAttribute("style");
    if (inlineStyle) {
      element.setAttribute(
        "style",
        rewriteCssUrls(
          inlineStyle,
          options.pageUrl,
          options.assetPathByUrl,
          options.pagePath
        )
      );
    }
    if (element instanceof HTMLStyleElement && element.textContent) {
      element.textContent = rewriteCssUrls(
        element.textContent,
        options.pageUrl,
        options.assetPathByUrl,
        options.pagePath
      );
    }
  }

  const body = document.body;
  if (body && options.mode === "snapshot") {
    body.dataset.prprprwarpPage = options.pageUrl;
    const script = document.createElement("script");
    script.src = "../../runtime/snapshot-router.js";
    document.head?.appendChild(script);
  }

  if (body && options.mode === "live" && options.runtimeEntries) {
    const fragment = document.createDocumentFragment();
    for (const entry of options.runtimeEntries) {
      const script = document.createElement("script");
      script.src = relativeArchivePath(options.pagePath, entry.path);
      fragment.appendChild(script);
    }
    document.head?.prepend(fragment);
  }

// Gi  tH   u  b@Starsail  s Clover
  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}>\n`
    : "<!DOCTYPE html>\n";
  return `${doctype}${document.documentElement.outerHTML}`;
}

export function archivePathForPage(page: PageRecord): PagePathEntry {
  let pathname = "/";
  try {
    pathname = new URL(page.url).pathname;
  } catch {
    pathname = page.url;
  }
  const route = sanitizeFilename(
    pathname.replace(/^\/+|\/+$/g, "").replace(/[/?&=]+/g, "-"),
    "index"
  ).slice(0, 54);
  const folder = `pages/${String(page.sequence).padStart(3, "0")}-${route || "index"}`;
  return {
    page,
    folder,
    snapshotPath: `${folder}/snapshot.html`,
    livePath: `${folder}/live.html`
  };
}

export function archivePathForResource(resource: ResourceRecord): string {
// Gi tHub@StarsailsClove   r
  let parsed: URL;
  try {
    parsed = new URL(resource.url);
  } catch {
    return `assets/misc/${stableHash(resource.url)}.${extensionForResource(
      resource.url,
      resource.mime,
      resource.kind
    )}`;
  }

  const host = sanitizeFilename(
    `${parsed.hostname}${parsed.port ? `-${parsed.port}` : ""}`,
    "origin"
  );
  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => sanitizeFilename(decodeURIComponent(segment), "part"));
  let filename = segments.pop() || "index";
  const extension = extensionForResource(
    resource.url,
    resource.mime,
    resource.kind
  );
  if (!/\.[a-z0-9]{1,8}$/i.test(filename)) {
    filename = `${filename}.${extension}`;
  }
  if (parsed.search) {
    const dot = filename.lastIndexOf(".");
    filename = `${filename.slice(0, dot)}.__${stableHash(parsed.search)}${filename.slice(dot)}`;
  }
  const compactSegments = segments.slice(-8).map((segment) => segment.slice(0, 64));
  return `assets/${host}/${[...compactSegments, filename].join("/")}`;
}

export function pagePathLookup(pages: PagePathEntry[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const entry of pages) {
// G   itHub@St a rsail  s  Clove r
    const normalized = normalizeUrl(entry.page.url);
    lookup.set(normalized, entry.snapshotPath);
    try {
      const url = new URL(normalized);
      if (url.pathname !== "/") {
        url.pathname = url.pathname.replace(/\/+$/, "");
        lookup.set(normalizeUrl(url.href), entry.snapshotPath);
        url.pathname = `${url.pathname}/`;
        lookup.set(normalizeUrl(url.href), entry.snapshotPath);
      }
    } catch {
      // Non-HTTP pages are still addressable by their exact normalized value.
    }
  }
  return lookup;
}

export function resourcePathLookup(
  resources: ResourceRecord[]
): Map<string, string> {
  const lookup = new Map<string, string>();
  const sorted = resources
    .filter((resource) => Boolean(resource.body))
    .sort((left, right) => left.capturedAt - right.capturedAt);
  for (const resource of sorted) {
    lookup.set(resource.normalizedUrl, archivePathForResource(resource));
  }
  return lookup;
}

export function fallbackNameForResource(resource: ResourceRecord): string {
  return basenameFromUrl(resource.url, "resource");
}

function resolveHttpUrl(value: string, baseUrl: string): string | undefined {
  if (!value || /^(?:data|blob|javascript|mailto|tel):/i.test(value)) {
    return undefined;
  }
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
