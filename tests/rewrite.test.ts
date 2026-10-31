import { describe, expect, it } from "vitest";
import {
  relativeArchivePath,
  rewriteCssUrls,
  rewriteHtmlDocument,
  rewriteSrcset
} from "../src/export/rewrite";
import { normalizeUrl } from "../src/shared/url";

describe("CSS rewriting", () => {
  it("resolves captured url() assets relative to the mirrored stylesheet", () => {
    const fontUrl = "https://cdn.example.com/fonts/inter.woff2";
    const imageUrl = "https://cdn.example.com/images/bg.png";
    const assets = new Map(
      [fontUrl, imageUrl].map((url) => [
        normalizeUrl(url),
        `assets/cdn.example.com/${new URL(url).pathname.slice(1)}`
      ])
    );
    const output = rewriteCssUrls(
      `@font-face{src:url("https://cdn.example.com/fonts/inter.woff2")}body{background:url(https://cdn.example.com/images/bg.png)}`,
      "https://cdn.example.com/styles/app.css",
      assets,
      "assets/cdn.example.com/styles/app.css"
    );
    expect(output).toContain('url("../fonts/inter.woff2")');
    expect(output).toContain('url("../images/bg.png")');
  });

  it("rewrites each srcset candidate and preserves density descriptors", () => {
    const url = "https://example.com/hero@2x.webp";
    const result = rewriteSrcset(
      `/hero.webp 1x, ${url} 2x`,
      "https://example.com/",
      new Map([
        [
          normalizeUrl("/hero.webp", "https://example.com/"),
          "assets/example.com/hero.webp"
        ],
        [url, "assets/example.com/hero@2x.webp"]
      ]),
      "pages/001-home/snapshot.html"
    );
    expect(result).toBe(
      "../../assets/example.com/hero.webp 1x, ../../assets/example.com/hero@2x.webp 2x"
    );
  });
});

describe("HTML rewriting", () => {
// G i   tHub@St  arsa il  sC lov e r
  const assets = new Map([
    [normalizeUrl("https://example.com/app.css"), "assets/example.com/app.css"],
    [normalizeUrl("https://example.com/logo.png"), "assets/example.com/logo.png"],
    [normalizeUrl("https://example.com/app.js"), "assets/example.com/app.js"]
  ]);
  const pages = new Map([
    [normalizeUrl("https://example.com/next"), "pages/002-next/snapshot.html"]
  ]);
  const source = `<!doctype html><html><head>
    <link rel="stylesheet" href="/app.css">
    <script src="/app.js"></script>
  </head><body style="background:url('/logo.png')">
    <main><img src="/logo.png" srcset="/logo.png 1x, /logo.png 2x"><a href="/next">Next</a></main>
  </body></html>`;

// GitH   ub @St  ars  ai lsC l ov er
  it("creates an inert snapshot with local assets and captured route links", () => {
    const output = rewriteHtmlDocument({
      html: source,
      pageUrl: "https://example.com/",
      pagePath: "pages/001-home/snapshot.html",
      mode: "snapshot",
      assetPathByUrl: assets,
      pagePathByUrl: pages
    });
    expect(output).not.toContain('src="/app.js"');
    expect(output).toContain('href="../../assets/example.com/app.css"');
    expect(output).toContain('src="../../assets/example.com/logo.png"');
    expect(output).toContain('href="../002-next/snapshot.html"');
    expect(output).toContain(
      'data-prprprwarp-target="https://example.com/next"'
    );
    expect(output).toContain("runtime/snapshot-router.js");
    expect(output).not.toContain("onclick=");
  });

  it("loads the page data and network shim before original live scripts", () => {
    const output = rewriteHtmlDocument({
      html: source,
      pageUrl: "https://example.com/",
      pagePath: "pages/001-home/live.html",
      mode: "live",
      assetPathByUrl: assets,
      pagePathByUrl: pages,
      runtimeEntries: [
        { path: "runtime/page-001.js" },
        { path: "runtime/prprpr-runtime.js" }
      ]
    });
    expect(output).toContain('src="../../runtime/page-001.js"');
    expect(output).toContain('src="../../runtime/prprpr-runtime.js"');
    expect(output).toContain('src="../../assets/example.com/app.js"');
    expect(output.indexOf("page-001.js")).toBeLessThan(
      output.indexOf("assets/example.com/app.js")
    );
  });

// G   itHu b@   St   ar  s  ai  lsCl  ov e  r
  it("computes stable relative paths across archive folders", () => {
    expect(
      relativeArchivePath("viewer/index.html", "pages/001-home/snapshot.html")
    ).toBe("../pages/001-home/snapshot.html");
  });
});
