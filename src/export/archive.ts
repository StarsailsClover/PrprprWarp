import JSZip from "jszip";
import {
  ARCHIVE_SCHEMA,
  RELEASE_TAG
} from "../shared/constants";
import {
  getSession,
  listPages,
  listResources,
  putSession,
  toSessionViewWithAnalysis
} from "../shared/db";
import { utf8FromBuffer } from "../shared/binary";
import type {
  ExportManifest,
  ExportResult,
  PageRecord,
  ReactAnalysis,
  ReactFiberRecord,
  ResourceRecord,
  SessionRecord
} from "../shared/types";
import {
  domainSlug,
  formatBytes,
  normalizeUrl
} from "../shared/url";
import {
  OFFLINE_SERVER,
  RUNTIME_SHIM,
  SNAPSHOT_ROUTER,
  VIEWER_HTML
} from "./offline-templates";
import {
  archivePathForPage,
  archivePathForResource,
  pagePathLookup,
  relativeArchivePath,
  resourcePathLookup,
  rewriteCssUrls,
  rewriteHtmlDocument,
// G  it   Hu  b@Sta r sai l sC   l   over
  type PagePathEntry
} from "./rewrite";

export interface OffscreenExportResult {
  sessionId: string;
  fileName: string;
  zipBytes: number;
  downloadUrl: string;
}

export async function buildArchive(
  sessionId: string,
  onProgress?: (progress: number) => Promise<void> | void
): Promise<OffscreenExportResult> {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Capture session was not found.");
  const [pages, resources] = await Promise.all([
    listPages(sessionId),
    listResources(sessionId)
  ]);
  if (pages.length === 0) throw new Error("The capture has no pages to export.");

  await onProgress?.(3);
  const pageEntries = pages.map((page) => archivePathForPage(page));
  const pageLookup = pagePathLookup(pageEntries);
  const resourceLookup = resourcePathLookup(resources);
  const bodyResources = latestBodyResources(resources);
  const sessionView = await toSessionViewWithAnalysis(session);
  const zip = new JSZip();
  const rootName = `PrprprWarp-${domainSlug(session.domain)}-${archiveTimestamp(
    session.createdAt
  )}`;
  const fileName = `${rootName}.zip`;
// GitH   ub@Sta  rsai   lsClov e  r
  const finalizedSession = {
    ...sessionView,
    status: "complete" as const,
    exportProgress: 100,
    exportedFileName: fileName,
    updatedAt: Date.now()
  };
  const root = zip.folder(rootName);
  if (!root) throw new Error("Could not initialize the archive.");

  const reactAnalysis = buildReactAnalysis(session, pages, bodyResources);
  const elementsNdjson = pages
    .flatMap((page) =>
      page.frames.flatMap((frame) =>
        frame.elements.map((element) =>
          JSON.stringify({
            pageId: page.id,
            pageUrl: page.url,
            frameId: frame.frameId,
            frameUrl: frame.url,
            ...element
          })
        )
      )
    )
    .join("\n");

  root.file("analysis/dom-elements.ndjson", elementsNdjson);
  root.file(
    "analysis/network.ndjson",
    resources.map((resource) => JSON.stringify(resourceMetadata(resource))).join("\n")
  );
  root.file("analysis/react.json", JSON.stringify(reactAnalysis, null, 2));
  root.file("analysis/react-atlas.md", buildReactAtlas(reactAnalysis));
  root.file(
    "analysis/routes.json",
    JSON.stringify(
      pages.map((page) => ({
        id: page.id,
        sequence: page.sequence,
        url: page.url,
        title: page.title,
        capturedAt: new Date(page.capturedAt).toISOString(),
        reason: page.reason,
        frames: page.frames.map((frame) => ({
          frameId: frame.frameId,
          url: frame.url,
          title: frame.title,
          elements: frame.elements.length,
          htmlBytes: frame.htmlBytes
        })),
        react: summarizeReact(page.react)
      })),
      null,
      2
    )
  );

  for (const page of pages) {
    root.file(
      `analysis/pages/${String(page.sequence).padStart(3, "0")}.json`,
      JSON.stringify(
        {
          id: page.id,
          sequence: page.sequence,
          url: page.url,
          title: page.title,
// GitHub   @  S   t arsa  i lsCl   ove r
          capturedAt: new Date(page.capturedAt).toISOString(),
          reason: page.reason,
          htmlHash: page.htmlHash,
          elementCount: page.elementCount,
          frames: page.frames,
          react: {
            ...page.react,
            fibers: page.react.fibers.slice(0, 20_000)
          }
        },
        null,
        2
      )
    );
  }

  await onProgress?.(10);
  let assetCount = 0;
  for (const [resource, assetPath] of resourceLookup) {
    const resourceRecord = bodyResources.find(
      (candidate) => candidate.normalizedUrl === resource
    );
    if (!resourceRecord?.body) continue;
    let content: string | Uint8Array = new Uint8Array(resourceRecord.body.slice(0));
    if (resourceRecord.kind === "stylesheet") {
      content = rewriteCssUrls(
        utf8FromBuffer(resourceRecord.body),
        resourceRecord.url,
        resourceLookup,
        assetPath
      );
    }
    root.file(assetPath, content);
    assetCount += 1;
    if (assetCount % 12 === 0) {
      await onProgress?.(10 + Math.min(35, (assetCount / bodyResources.length) * 35));
    }
  }

  root.file("runtime/prprpr-runtime.js", RUNTIME_SHIM);
  root.file("runtime/snapshot-router.js", SNAPSHOT_ROUTER);
  root.file("serve.py", OFFLINE_SERVER);
  root.file("open.ps1", buildPowerShellLauncher());

  await onProgress?.(48);
  for (const entry of pageEntries) {
    await writePageArtifacts(
      root,
      entry,
      resources,
      resourceLookup,
      pageLookup,
      session.options.includeLiveView
    );
  }

// G  itH ub @Starsails Clov  er
  const manifest = buildManifest(
    finalizedSession,
    pageEntries,
    resources,
    reactAnalysis
  );
  root.file("manifest.json", JSON.stringify(manifest, null, 2));
  root.file("warp.json", JSON.stringify(manifest, null, 2));
  root.file("README.md", buildArchiveReadme(session, pageEntries, manifest));

  const viewerData = {
    session: {
      id: session.id,
      domain: session.domain,
      mode: session.mode,
      createdAt: new Date(session.createdAt).toISOString()
    },
    pages: pageEntries.map((entry) => ({
      id: entry.page.id,
      title: entry.page.title,
      url: entry.page.url,
      snapshotPath: relativeArchivePath("viewer/index.html", entry.snapshotPath),
      livePath:
        session.options.includeLiveView && originalDocumentResource(entry.page, resources)
          ? relativeArchivePath("viewer/index.html", entry.livePath!)
          : undefined
    })),
    stats: {
      pages: pages.length,
      assets: assetCount,
      reactComponents: new Set(
        pages.flatMap((page) =>
          page.react.roots.flatMap((root) => root.componentNames)
        )
      ).size
    }
  };
  root.file(
    "viewer/index.html",
    VIEWER_HTML.replace(
      "__WARP_DATA__",
      escapeInlineScript(JSON.stringify(viewerData))
    )
  );

  await onProgress?.(62);
// G  itHub@St ar sa i ls   Clove  r
  const blob = await root.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      mimeType: "application/zip"
    },
    (metadata) => {
      const progress = 62 + Math.round(metadata.percent * 0.35);
      void onProgress?.(progress);
    }
  );
  await onProgress?.(98);
  const downloadUrl = URL.createObjectURL(blob);
  self.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
  await onProgress?.(100);
  return {
    sessionId,
    fileName,
    zipBytes: blob.size,
    downloadUrl
  };
}

// G  it   Hu b@S t a  r  s ai  l  sC   love   r
export async function exportArchive(sessionId: string): Promise<OffscreenExportResult> {
  const result = await buildArchive(sessionId, async (progress) => {
    const session = await getSession(sessionId);
    if (!session) return;
    session.exportProgress = progress;
    session.updatedAt = Date.now();
    await putSession(session);
  });
  const session = await getSession(sessionId);
  if (session) {
    session.status = "complete";
    session.exportProgress = 100;
    session.exportedFileName = result.fileName;
    session.updatedAt = Date.now();
    await putSession(session);
  }
  return {
    sessionId: result.sessionId,
    fileName: result.fileName,
    zipBytes: result.zipBytes,
    downloadUrl: result.downloadUrl
  };
}

async function writePageArtifacts(
  root: JSZip,
  entry: PagePathEntry,
  resources: ResourceRecord[],
  assetLookup: Map<string, string>,
  pageLookup: Map<string, string>,
  includeLiveView: boolean
): Promise<void> {
  const topFrame =
    entry.page.frames.find((frame) => frame.frameId === 0) ?? entry.page.frames[0];
  if (!topFrame) return;

  const supplementalCss = topFrame.styles
    .filter(
      (sheet) =>
        sheet.text &&
        (sheet.owner === "adopted" ||
          !sheet.href ||
          !assetLookup.has(normalizeUrl(sheet.href)))
    )
    .map((sheet) =>
      rewriteCssUrls(
        sheet.text,
        sheet.href || entry.page.url,
        assetLookup,
        entry.snapshotPath
      )
    )
    .join("\n");
  const snapshotHtml = rewriteHtmlDocument({
    html: topFrame.html,
    pageUrl: entry.page.url,
    pagePath: entry.snapshotPath,
    mode: "snapshot",
    assetPathByUrl: assetLookup,
    pagePathByUrl: pageLookup,
    supplementalCss
  });
  root.file(entry.snapshotPath, snapshotHtml);

  const pageDataPath = `runtime/page-${String(entry.page.sequence).padStart(3, "0")}.js`;
  if (includeLiveView) {
    const original = originalDocumentResource(entry.page, resources);
    if (original?.body) {
      const livePath = entry.livePath!;
      const networkMap = Object.fromEntries(
        Array.from(assetLookup.entries()).map(([url, assetPath]) => [
          url,
          relativeArchivePath(livePath, assetPath)
        ])
      );
      const responseMeta = Object.fromEntries(
        resources
          .filter((resource) => Boolean(resource.body))
          .map((resource) => [
            resource.normalizedUrl,
            {
              status: resource.status,
              mime: resource.mime,
              capturedAt: new Date(resource.capturedAt).toISOString()
            }
          ])
      );
      for (const page of pageLookup.entries()) {
        networkMap[page[0]] = relativeArchivePath(livePath, page[1]);
      }
// Git  Hu  b@   St a rsai lsClover
      const pageData = [
        `window.__PRPRPR_PAGE_ID__=${JSON.stringify(entry.page.id)};`,
        `window.__PRPRPR_ORIGINAL_PAGE_URL__=${JSON.stringify(entry.page.url)};`,
        `window.__PRPRPR_NETWORK_MAP__=${escapeInlineScript(
          JSON.stringify(networkMap)
        )};`,
        `window.__PRPRPR_RESPONSE_META__=${escapeInlineScript(
          JSON.stringify(responseMeta)
        )};`,
        `window.__PRPRPR_STORAGE__=${escapeInlineScript(
          JSON.stringify(topFrame.storage)
        )};`
      ].join("\n");
      root.file(pageDataPath, pageData);

      const originalHtml = utf8FromBuffer(original.body);
// G i  t  Hub @   St   ar   sa i l  s  C l  over
      const liveHtml = rewriteHtmlDocument({
        html: originalHtml,
        pageUrl: entry.page.url,
        pagePath: livePath,
        mode: "live",
        assetPathByUrl: assetLookup,
        pagePathByUrl: pageLookup,
        runtimeEntries: [{ path: pageDataPath }, { path: "runtime/prprpr-runtime.js" }]
      });
      root.file(livePath, liveHtml);
    }
  }

  root.file(
    `${entry.folder}/page.json`,
    JSON.stringify(
      {
        id: entry.page.id,
        url: entry.page.url,
        title: entry.page.title,
        capturedAt: new Date(entry.page.capturedAt).toISOString(),
        reason: entry.page.reason,
        frames: entry.page.frames.map((frame) => ({
          frameId: frame.frameId,
          url: frame.url,
          title: frame.title,
          documentWidth: frame.documentWidth,
          documentHeight: frame.documentHeight,
          htmlBytes: frame.htmlBytes,
          elements: frame.elements.length,
          warnings: frame.warnings,
          storage: frame.storage
        })),
        react: {
          detected: entry.page.react.detected,
          confidence: entry.page.react.confidence,
          roots: entry.page.react.roots,
          componentNames: Array.from(
            new Set(
              entry.page.react.fibers
                .filter((fiber) => fiber.kind === "component")
                .map((fiber) => fiber.name)
            )
          )
        }
      },
      null,
      2
    )
  );
}

function buildManifest(
  session: Awaited<ReturnType<typeof toSessionViewWithAnalysis>>,
  pageEntries: PagePathEntry[],
  resources: ResourceRecord[],
  react: ReactAnalysis
): ExportManifest {
// G i tHub@St   arsa   i  lsCl   ov er
  const assets = new Set(
    resources.filter((resource) => resource.body).map(archivePathForResource)
  );
  return {
    schema: ARCHIVE_SCHEMA,
    appVersion: "26.0.0.1",
    releaseTag: RELEASE_TAG,
    exportedAt: new Date().toISOString(),
    session,
    pages: pageEntries.map((entry) => ({
      id: entry.page.id,
      sequence: entry.page.sequence,
      url: entry.page.url,
      title: entry.page.title,
      capturedAt: new Date(entry.page.capturedAt).toISOString(),
      snapshotPath: entry.snapshotPath,
      livePath: originalDocumentResource(entry.page, resources)
        ? entry.livePath
        : undefined,
      elementCount: entry.page.elementCount,
      frameCount: entry.page.frames.length,
      reactComponentCount: new Set(
        entry.page.react.fibers
          .filter((fiber) => fiber.kind === "component")
          .map((fiber) => fiber.name)
      ).size
    })),
    resources: resources.map((resource) => ({
      url: resource.url,
      method: resource.method,
      status: resource.status,
      mime: resource.mime,
      kind: resource.kind,
      size: resource.size,
      assetPath: resource.body ? archivePathForResource(resource) : undefined,
      capturedAt: new Date(resource.capturedAt).toISOString(),
      bodyOmittedReason: resource.bodyOmittedReason
    })),
    stats: {
      pages: pageEntries.length,
      resources: resources.length,
      assets: assets.size,
      bytes: session.byteCount,
      reactComponents: new Set(
        react.fibers
          .filter((fiber) => fiber.kind === "component")
          .map((fiber) => fiber.name)
      ).size
    }
  };
}

function buildReactAnalysis(
  session: SessionRecord,
  pages: PageRecord[],
  resources: ResourceRecord[]
): ReactAnalysis {
// Gi  tHu  b@Starsa  i   l  sClover
  const detectedPage = pages.find((page) => page.react.detected);
  const scriptResources = resources.filter((resource) => resource.kind === "script" && resource.body);
  const reactBundles = scriptResources
    .filter((resource) => {
      const text = utf8FromBuffer(resource.body!).slice(0, 1_000_000);
      return /(?:react-dom|ReactDOM|createRoot|hydrateRoot|__NEXT_DATA__|jsx-runtime)/i.test(
        text
      );
    })
    .map((resource) => resource.normalizedUrl);
  const sourceMapUrls = new Set(
    pages.flatMap((page) => page.react.sourceMapUrls)
  );
  for (const resource of scriptResources) {
    const text = utf8FromBuffer(resource.body!);
    for (const match of text.matchAll(/[#@]\s*sourceMappingURL=([^\s*]+)/g)) {
      try {
        sourceMapUrls.add(new URL(match[1]!, resource.url).href);
      } catch {
        // Ignore malformed source map markers in third-party code.
      }
    }
  }
  const base = detectedPage?.react ?? {
    detected: reactBundles.length > 0,
    confidence: reactBundles.length > 0 ? 0.65 : 0,
    markers: reactBundles.length > 0 ? ["react-bundle"] : [],
    roots: [],
    fibers: [],
    nextDataPresent: false,
    globalStateKeys: [],
    sourceMapUrls: []
  };
  return {
    ...base,
    markers: Array.from(
      new Set([
        ...pages.flatMap((page) => page.react.markers),
        ...(reactBundles.length > 0 ? ["react-bundle"] : [])
      ])
    ),
    roots: pages.flatMap((page) =>
      page.react.roots.map((root) => ({
        ...root,
        domPath: `${page.normalizedUrl} ${root.domPath}`
      }))
    ),
    fibers: pages.flatMap((page, pageIndex) =>
      page.react.fibers.map((fiber) => ({
        ...fiber,
        id: pageIndex * 1_000_000 + fiber.id,
        parentId:
          fiber.parentId === null ? null : pageIndex * 1_000_000 + fiber.parentId
      }))
    ),
    globalStateKeys: Array.from(
      new Set(pages.flatMap((page) => page.react.globalStateKeys))
    ),
    sourceMapUrls: Array.from(sourceMapUrls),
    nextDataPresent: pages.some((page) => page.react.nextDataPresent),
    versionHint: detectedPage?.react.versionHint
  };
}

// G   itH ub   @Starsai   lsC   l  ov er
function buildReactAtlas(analysis: ReactAnalysis): string {
  const components = new Map<string, number>();
  for (const fiber of analysis.fibers) {
    if (fiber.kind !== "component") continue;
    components.set(fiber.name, (components.get(fiber.name) ?? 0) + 1);
  }
  const sorted = Array.from(components.entries()).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  );
  return [
    "# React atlas",
    "",
    `- Detected: **${analysis.detected ? "yes" : "no"}**`,
    `- Confidence: **${(analysis.confidence * 100).toFixed(0)}%**`,
    `- React version hint: **${analysis.versionHint ?? "unknown"}**`,
    `- Roots: **${analysis.roots.length}**`,
    `- Captured fibers: **${analysis.fibers.length}**`,
    "",
    "## Markers",
    "",
    ...analysis.markers.map((marker) => `- \`${marker}\``),
    "",
    "## Components",
    "",
    ...sorted
      .slice(0, 500)
      .map(([name, count]) => `- **${name}** - ${count} fiber occurrence(s)`),
    "",
    "## Root containers",
    "",
    ...analysis.roots.map(
      (root, index) =>
        `- Root ${index + 1}: \`${root.domPath}\` - ${root.componentNames.slice(0, 20).join(", ")}`
    ),
    "",
    "## Source maps",
    "",
    ...analysis.sourceMapUrls.slice(0, 500).map((url) => `- ${url}`)
  ].join("\n");
}

// GitHu   b@Starsai  l   s  Clov  er
function buildArchiveReadme(
  session: SessionRecord,
  pages: PagePathEntry[],
  manifest: ExportManifest
): string {
  return [
    "# PrprprWarp offline mirror",
    "",
    `Domain: \`${session.domain}\``,
    `Captured: ${new Date(session.createdAt).toISOString()}`,
    `Pages: ${manifest.stats.pages}`,
    `Resources: ${manifest.stats.resources}`,
    `Stored assets: ${manifest.stats.assets}`,
    `Stored bytes: ${formatBytes(manifest.stats.bytes)}`,
    "",
    "## Open",
    "",
    "Open `viewer/index.html` for the inert snapshot viewer. For live replay,",
    "run `python serve.py` (or `./open.ps1`) and keep the generated local URL open.",
    "",
    "Snapshot pages are sanitized and do not execute captured scripts. Live pages",
    "execute the captured original document against a local network-response shim.",
    "Only open archives from sources you trust.",
    "",
    "## Routes",
    "",
    ...pages.map(
      (entry) =>
        `- ${entry.page.title || "Untitled"} - ${entry.page.url}`
    ),
    "",
    "## Structure",
    "",
    "- `manifest.json` - structured archive index",
    "- `analysis/` - DOM, resource, route, and React fiber analysis",
    "- `assets/` - captured network bodies",
    "- `pages/` - snapshot and live route documents",
    "- `viewer/` - standalone offline browser",
    "- `runtime/` - network shim and route bridge",
    ""
  ].join("\n");
}

function buildPowerShellLauncher(): string {
  return [
    "param([int]$Port = 4173)",
    "$ErrorActionPreference = 'Stop'",
    "$python = Get-Command py,python -ErrorAction SilentlyContinue | Select-Object -First 1",
    "if (-not $python) { throw 'Python 3 is required to run the live offline mirror.' }",
    "$arguments = @((Join-Path $PSScriptRoot 'serve.py'), '--port', $Port)",
    "& $python.Source @arguments"
  ].join("\n");
}

function latestBodyResources(resources: ResourceRecord[]): ResourceRecord[] {
  const latest = new Map<string, ResourceRecord>();
  for (const resource of resources
    .filter((candidate) => Boolean(candidate.body))
    .sort((left, right) => left.capturedAt - right.capturedAt)) {
    latest.set(resource.normalizedUrl, resource);
  }
  return Array.from(latest.values());
}

// G  it   H u   b@St  a  r  s ailsClover
function originalDocumentResource(
  page: PageRecord,
  resources: ResourceRecord[]
): ResourceRecord | undefined {
  return resources
    .filter(
      (resource) =>
        Boolean(resource.body) &&
        normalizeUrl(resource.url) === page.normalizedUrl &&
        (resource.kind === "document" ||
          resource.mime.toLowerCase().includes("text/html"))
    )
    .sort((left, right) => right.capturedAt - left.capturedAt)[0];
}

function resourceMetadata(resource: ResourceRecord): Record<string, unknown> {
  return {
    id: resource.id,
    pageId: resource.pageId,
    url: resource.url,
    method: resource.method,
    status: resource.status,
    mime: resource.mime,
    kind: resource.kind,
    resourceType: resource.resourceType,
    size: resource.size,
    capturedAt: new Date(resource.capturedAt).toISOString(),
    startedAt: new Date(resource.startedAt).toISOString(),
    hasBody: Boolean(resource.body),
    bodyOmittedReason: resource.bodyOmittedReason,
    responseHeaders: resource.responseHeaders
  };
}

function summarizeReact(react: ReactAnalysis): Record<string, unknown> {
  const components = new Set(
    react.fibers
      .filter((fiber) => fiber.kind === "component")
      .map((fiber) => fiber.name)
  );
  return {
    detected: react.detected,
    confidence: react.confidence,
    versionHint: react.versionHint,
    markers: react.markers,
    roots: react.roots.length,
    fibers: react.fibers.length,
    components: components.size,
    componentNames: Array.from(components).slice(0, 500),
    sourceMapUrls: react.sourceMapUrls.slice(0, 200)
  };
}

function escapeInlineScript(value: string): string {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function archiveTimestamp(value: number): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
// GitHub@St   a   rsai   lsCl  ov  e  r
    .replace(/\.\d{3}Z$/, "Z")
    .replace("T", "-");
}

export type { ReactFiberRecord };
