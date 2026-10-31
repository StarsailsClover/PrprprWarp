export const RUNTIME_SHIM = String.raw`
(() => {
  "use strict";

  const networkMap = window.__PRPRPR_NETWORK_MAP__ || {};
  const responseMeta = window.__PRPRPR_RESPONSE_META__ || {};
  const originalPageUrl = window.__PRPRPR_ORIGINAL_PAGE_URL__ || document.baseURI;
  const originalFetch = window.fetch.bind(window);
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalSetAttribute = Element.prototype.setAttribute;
  const originalRemoveAttribute = Element.prototype.removeAttribute;

  const normalize = (value, base = originalPageUrl) => {
    try {
      const url = new URL(value, base);
      url.hash = "";
      return url.href;
    } catch {
      return String(value || "");
    }
  };

  const mapUrl = (value) => {
    if (!value) return value;
    const normalized = normalize(value);
    return networkMap[normalized] ? new URL(networkMap[normalized], document.baseURI).href : value;
  };

  const restoreStorage = () => {
    const captured = window.__PRPRPR_STORAGE__ || {};
    for (const [areaName, values] of Object.entries(captured)) {
      const area = areaName === "session" ? sessionStorage : localStorage;
      for (const [key, value] of Object.entries(values || {})) {
        if (value === "[redacted by PrprprWarp]") continue;
        try {
          if (area.getItem(key) === null) area.setItem(key, String(value));
        } catch {}
      }
    }
  };

  restoreStorage();

  window.fetch = async function prprprwarpFetch(input, init) {
    const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const mapped = mapUrl(rawUrl);
    if (mapped !== rawUrl) {
      const meta = responseMeta[normalize(rawUrl)] || {};
      const nativeResponse = await originalFetch(new URL(mapped, document.baseURI).href, {
        ...(init || {}),
        method: "GET",
        credentials: "same-origin",
        cache: "force-cache"
      });
      const headers = new Headers(nativeResponse.headers);
      if (meta.mime) headers.set("content-type", meta.mime);
      return new Response(await nativeResponse.arrayBuffer(), {
        status: Number(meta.status) || nativeResponse.status,
        statusText: nativeResponse.statusText,
        headers
      });
    }
    return originalFetch(input, init);
  };

  XMLHttpRequest.prototype.open = function prprprwarpOpen(method, url, ...rest) {
    const mapped = mapUrl(url);
    if (mapped !== url) {
      this.__prprprwarpOriginalUrl = normalize(url);
      return originalXhrOpen.call(this, "GET", mapped, ...rest);
    }
    return originalXhrOpen.call(this, method, url, ...rest);
  };

  const rewriteAttribute = (element, name, value) => {
    if (!["src", "href", "poster", "data"].includes(String(name).toLowerCase())) return value;
    const mapped = mapUrl(String(value));
    return mapped === value ? value : new URL(mapped, document.baseURI).href;
  };

  Element.prototype.setAttribute = function prprprwarpSetAttribute(name, value) {
    return originalSetAttribute.call(this, name, rewriteAttribute(this, name, value));
  };

  const installUrlProperty = (prototype, property) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (!descriptor || !descriptor.get || !descriptor.set) return;
    Object.defineProperty(prototype, property, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        descriptor.set.call(this, rewriteAttribute(this, property, value));
      }
    });
  };

  for (const [prototype, property] of [
    [HTMLScriptElement.prototype, "src"],
    [HTMLLinkElement.prototype, "href"],
    [HTMLImageElement.prototype, "src"],
    [HTMLMediaElement.prototype, "src"],
    [HTMLSourceElement.prototype, "src"],
    [HTMLIFrameElement.prototype, "src"],
    [HTMLObjectElement.prototype, "data"]
  ]) {
    installUrlProperty(prototype, property);
  }

  void originalRemoveAttribute;
})();
`;

export const SNAPSHOT_ROUTER = String.raw`
(() => {
  "use strict";
  if (window.parent === window) return;
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("a[href],area[href]") : null;
    if (!target) return;
    const href = target.getAttribute("data-prprprwarp-target") || target.href;
    if (!/^https?:/i.test(href)) return;
    window.parent.postMessage({ source: "prprprwarp", type: "navigate", url: href }, "*");
    event.preventDefault();
    event.stopPropagation();
  }, true);
})();
`;

export const OFFLINE_SERVER = String.raw`
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import http.server
import mimetypes
import os
import socketserver
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class ReusableThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class PrprprWarpHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("[PrprprWarp] " + fmt % args)


mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("font/woff2", ".woff2")


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve a PrprprWarp archive locally.")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    with ReusableThreadingServer(("127.0.0.1", args.port), PrprprWarpHandler) as server:
        url = f"http://127.0.0.1:{args.port}/viewer/"
        print(f"PrprprWarp offline mirror: {url}")
        print("Press Ctrl+C to stop.")
        if not args.no_browser:
            webbrowser.open(url)
        server.serve_forever()


if __name__ == "__main__":
    main()
`;

export const VIEWER_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PrprprWarp Archive</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101214;
      --panel: #171a1d;
      --panel-2: #1e2226;
      --line: rgba(255,255,255,.1);
      --text: #f3f4f2;
      --muted: #9aa1a8;
      --accent: #f06a3a;
      --teal: #36b7a5;
      --radius: 8px;
      --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --mono: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); font-family: var(--sans); }
    body { height: 100dvh; overflow: hidden; }
    button, input { font: inherit; }
    button { color: inherit; }
    .shell { display: grid; grid-template-columns: 286px minmax(0,1fr); height: 100dvh; }
    .sidebar { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); background: var(--panel); }
    .brand { display: flex; align-items: center; gap: 10px; padding: 18px 16px 14px; }
    .mark { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid rgba(240,106,58,.55); border-radius: 7px; color: var(--accent); font-weight: 800; font-family: var(--mono); }
    .brand strong { font-size: 14px; letter-spacing: .02em; }
    .brand span { color: var(--muted); font-size: 11px; }
    .meta { margin: 0 16px 14px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2); }
    .domain { overflow: hidden; text-overflow: ellipsis; font-family: var(--mono); font-size: 12px; white-space: nowrap; }
    .stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 11px; }
    .stat strong { display: block; font-size: 13px; }
    .stat span { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
    .search { margin: 0 16px 10px; position: relative; }
    .search input { width: 100%; min-height: 36px; border: 1px solid var(--line); border-radius: 7px; background: #121518; color: var(--text); padding: 0 10px 0 32px; outline: none; }
    .search input:focus { border-color: rgba(240,106,58,.65); }
    .search svg { position: absolute; left: 10px; top: 10px; color: var(--muted); }
    .routes { overflow: auto; padding: 0 8px 14px; }
    .route { width: 100%; min-height: 48px; display: grid; grid-template-columns: 28px minmax(0,1fr); align-items: center; gap: 8px; border: 0; border-radius: 7px; padding: 7px 8px; background: transparent; text-align: left; cursor: pointer; }
    .route:hover { background: rgba(255,255,255,.045); }
    .route[aria-current="true"] { background: rgba(240,106,58,.12); box-shadow: inset 2px 0 0 var(--accent); }
    .route-index { color: var(--muted); font-family: var(--mono); font-size: 10px; }
    .route-copy { min-width: 0; }
    .route-title { display: block; overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .route-path { display: block; margin-top: 3px; overflow: hidden; color: var(--muted); font-family: var(--mono); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .workspace { display: flex; min-width: 0; min-height: 0; flex-direction: column; }
    .toolbar { min-height: 58px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid var(--line); background: rgba(16,18,20,.92); }
    .address { min-width: 0; flex: 1; overflow: hidden; color: var(--muted); font-family: var(--mono); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .segmented { display: inline-flex; padding: 3px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
    .segmented button { min-height: 30px; border: 0; border-radius: 6px; padding: 0 11px; background: transparent; color: var(--muted); cursor: pointer; font-size: 11px; }
    .segmented button[aria-pressed="true"] { background: var(--panel-2); color: var(--text); box-shadow: 0 1px 0 rgba(255,255,255,.06); }
    .icon-button { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); cursor: pointer; }
    .icon-button:hover { border-color: rgba(255,255,255,.2); }
    .frame-wrap { flex: 1; min-height: 0; padding: 10px; background: #0b0d0e; }
    iframe { width: 100%; height: 100%; border: 1px solid var(--line); border-radius: 7px; background: #fff; }
    .empty { height: 100%; display: grid; place-items: center; color: var(--muted); font-size: 13px; }
    .notice { position: fixed; right: 18px; bottom: 18px; max-width: 360px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: #23282d; color: var(--text); box-shadow: 0 12px 36px rgba(0,0,0,.35); font-size: 12px; }
    .reader { display: none; }
    @media (max-width: 760px) {
      .shell { grid-template-columns: 1fr; grid-template-rows: auto minmax(0,1fr); }
      .sidebar { max-height: 44dvh; border-right: 0; border-bottom: 1px solid var(--line); }
      .meta { display: none; }
      .search { margin-top: 10px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="mark">W</div><div><strong>PrprprWarp</strong><br><span id="session-id"></span></div></div>
      <div class="meta">
        <div class="domain" id="domain"></div>
        <div class="stats">
          <div class="stat"><strong id="page-count">0</strong><span>Pages</span></div>
          <div class="stat"><strong id="asset-count">0</strong><span>Assets</span></div>
          <div class="stat"><strong id="react-count">0</strong><span>React</span></div>
        </div>
      </div>
      <label class="search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
        <input id="filter" type="search" placeholder="Filter routes" autocomplete="off">
      </label>
      <nav class="routes" id="routes" aria-label="Captured routes"></nav>
    </aside>
    <section class="workspace">
      <header class="toolbar">
        <div class="address" id="address"></div>
        <div class="segmented" aria-label="View mode">
          <button id="snapshot-mode" type="button" aria-pressed="true">Snapshot</button>
          <button id="live-mode" type="button" aria-pressed="false">Live</button>
        </div>
        <button class="icon-button" id="open-tab" type="button" title="Open in a new tab" aria-label="Open in a new tab">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>
        </button>
      </header>
      <div class="frame-wrap"><iframe id="frame" title="Captured page"></iframe></div>
    </section>
  </main>
  <script id="warp-data" type="application/json">__WARP_DATA__</script>
  <script>
    (() => {
      const data = JSON.parse(document.getElementById("warp-data").textContent || "{}");
      const pages = data.pages || [];
      const routes = document.getElementById("routes");
      const frame = document.getElementById("frame");
      const address = document.getElementById("address");
      const filter = document.getElementById("filter");
      const snapshotMode = document.getElementById("snapshot-mode");
      const liveMode = document.getElementById("live-mode");
      let current = 0;
      let mode = "snapshot";

      document.getElementById("session-id").textContent = data.session?.id?.slice(0, 8) || "archive";
      document.getElementById("domain").textContent = data.session?.domain || "";
      document.getElementById("page-count").textContent = String(data.stats?.pages || pages.length);
      document.getElementById("asset-count").textContent = String(data.stats?.assets || 0);
      document.getElementById("react-count").textContent = String(data.stats?.reactComponents || 0);

      const pathOf = (url) => {
        try { return new URL(url).pathname + new URL(url).search; } catch { return url || "/"; }
      };

      const showNotice = (message) => {
        document.querySelector(".notice")?.remove();
        const notice = document.createElement("div");
        notice.className = "notice";
        notice.textContent = message;
        document.body.appendChild(notice);
        setTimeout(() => notice.remove(), 3200);
      };

      const renderRoutes = () => {
        const query = filter.value.trim().toLowerCase();
        routes.replaceChildren();
        pages.forEach((page, index) => {
          const haystack = (page.title + " " + page.url).toLowerCase();
          if (query && !haystack.includes(query)) return;
          const button = document.createElement("button");
          button.className = "route";
          button.type = "button";
          button.dataset.index = String(index);
          button.setAttribute("aria-current", String(index === current));
          const number = document.createElement("span");
          number.className = "route-index";
          number.textContent = String(index + 1).padStart(2, "0");
          const copy = document.createElement("span");
          copy.className = "route-copy";
          const title = document.createElement("span");
          title.className = "route-title";
          title.textContent = page.title || pathOf(page.url);
          const path = document.createElement("span");
          path.className = "route-path";
          path.textContent = pathOf(page.url);
          copy.append(title, path);
          button.append(number, copy);
          button.addEventListener("click", () => select(index));
          routes.appendChild(button);
        });
      };

      const select = (index) => {
        current = Math.max(0, Math.min(index, pages.length - 1));
        const page = pages[current];
        if (!page) {
          frame.removeAttribute("src");
          return;
        }
        const target = mode === "live" && page.livePath ? page.livePath : page.snapshotPath;
        if (mode === "live" && !page.livePath) {
          showNotice("This route has no live capture.");
        }
        frame.src = target;
        address.textContent = page.url;
        renderRoutes();
      };

      const setMode = (nextMode) => {
        mode = nextMode;
        if (mode === "live" && location.protocol === "file:") {
          mode = "snapshot";
          showNotice("Live mode requires serve.py.");
        }
        snapshotMode.setAttribute("aria-pressed", String(mode === "snapshot"));
        liveMode.setAttribute("aria-pressed", String(mode === "live"));
        select(current);
      };

      snapshotMode.addEventListener("click", () => setMode("snapshot"));
      liveMode.addEventListener("click", () => setMode("live"));
      filter.addEventListener("input", renderRoutes);
      document.getElementById("open-tab").addEventListener("click", () => {
        const page = pages[current];
        if (!page) return;
        window.open(mode === "live" && page.livePath ? page.livePath : page.snapshotPath, "_blank", "noopener");
      });

      window.addEventListener("message", (event) => {
        if (event.data?.source !== "prprprwarp" || event.data?.type !== "navigate") return;
        try {
          const normalized = new URL(event.data.url);
          normalized.hash = "";
          const index = pages.findIndex((page) => new URL(page.url).href.replace(/#.*$/, "") === normalized.href);
          if (index >= 0) select(index);
          else showNotice("Route was not captured.");
        } catch {}
      });

      renderRoutes();
      select(0);
    })();
  </script>
</body>
</html>
`;
