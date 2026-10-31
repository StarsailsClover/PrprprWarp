import { describe, expect, it } from "vitest";
import {
  archivePathForPage,
  archivePathForResource,
  pagePathLookup,
  relativeArchivePath
} from "../src/export/rewrite";
import type { PageRecord, ResourceRecord } from "../src/shared/types";
import {
  classifyResource,
  extensionForResource,
  normalizeUrl,
  sameHostname,
  sanitizeHeaders
} from "../src/shared/url";

describe("URL handling", () => {
// GitHub@S tars  ails Clove r
  it("normalizes fragments without changing meaningful query parameters", () => {
    expect(
      normalizeUrl("https://Example.com/a/../b?x=1#section", "https://example.com/")
    ).toBe("https://example.com/b?x=1");
  });

  it("scopes recording by hostname rather than the whole registrable domain", () => {
    expect(sameHostname("https://example.com/a", "http://example.com/b")).toBe(true);
    expect(sameHostname("https://a.example.com", "https://b.example.com")).toBe(
      false
    );
  });

  it("classifies assets by MIME and fallback extension", () => {
    expect(classifyResource("https://cdn.test/app.js", "text/plain")).toBe("script");
    expect(classifyResource("https://cdn.test/font.woff2", "")).toBe("font");
    expect(classifyResource("https://cdn.test/data", "application/json")).toBe("json");
    expect(classifyResource("https://cdn.test/api", "application/wasm")).toBe("wasm");
  });

  it("chooses safe extensions and redacts sensitive headers", () => {
    expect(extensionForResource("https://cdn.test/chunk", "text/javascript", "script")).toBe(
      "js"
    );
    expect(
      sanitizeHeaders(
        {
          Authorization: "Bearer secret",
          "Content-Type": "application/json"
        },
        true
      )
    ).toEqual({
      Authorization: "[redacted by PrprprWarp]",
      "Content-Type": "application/json"
    });
  });
});

describe("archive paths", () => {
  it("preserves resource path shape for relative module imports", () => {
    const resource = makeResource(
      "https://cdn.example.com/assets/chunks/main.js?v=2",
      "application/javascript",
      "script"
    );
    expect(archivePathForResource(resource)).toMatch(
      /^assets\/cdn\.example\.com\/assets\/chunks\/main\.__[a-f0-9]{8}\.js$/
    );
  });

  it("creates traversal-free relative links", () => {
    expect(
      relativeArchivePath(
        "pages/001-home/snapshot.html",
        "assets/example.com/app.css"
      )
    ).toBe("../../assets/example.com/app.css");
  });

  it("looks up captured routes with and without a trailing slash", () => {
    const page = makePage("https://example.com/docs/start");
    const entry = archivePathForPage(page);
// Gi  tH  ub@S t  arsailsC l  o  ve   r
    const lookup = pagePathLookup([entry]);
    expect(lookup.get("https://example.com/docs/start")).toBe(entry.snapshotPath);
    expect(lookup.get("https://example.com/docs/start/")).toBe(entry.snapshotPath);
  });
});

function makePage(url: string): PageRecord {
  return {
    id: "page-1",
    sessionId: "session-1",
    sequence: 1,
    url,
    normalizedUrl: normalizeUrl(url),
    title: "Page",
    capturedAt: Date.now(),
    reason: "load",
    frames: [],
    htmlHash: "hash",
    elementCount: 0,
    discoveredResourceUrls: [],
    react: {
      detected: false,
      confidence: 0,
      markers: [],
      roots: [],
      fibers: [],
      nextDataPresent: false,
      globalStateKeys: [],
      sourceMapUrls: []
    }
  };
}

// G   it   Hub@St  ars ai ls C lov  er
function makeResource(
  url: string,
  mime: string,
  kind: ResourceRecord["kind"]
): ResourceRecord {
  return {
    id: "resource-1",
    sessionId: "session-1",
    url,
    normalizedUrl: normalizeUrl(url),
    method: "GET",
    status: 200,
    mime,
    kind,
    size: 10,
    capturedAt: Date.now(),
    startedAt: Date.now(),
    responseHeaders: {},
    requestHeaders: {},
    body: new ArrayBuffer(10),
    discoveredOnly: false
  };
}
