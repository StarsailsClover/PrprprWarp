# Archive format

The archive schema identifier is `prprprwarp.archive/v1`.

## Root files

| Path | Meaning |
|---|---|
| `manifest.json` | Complete route and resource index |
| `warp.json` | Duplicate of the manifest for convenience |
| `README.md` | Human-readable archive summary |
| `serve.py` | Loopback live-replay server |
| `open.ps1` | PowerShell launcher for `serve.py` |

## Analysis

`analysis/react.json` contains the merged React model:

- `detected` and `confidence`;
- `markers`, including DevTools hooks, Fiber DOM keys, and Next data;
- `versionHint`;
- `roots` with DOM paths and component names;
- `fibers` with parent IDs, props keys, hook shapes, host tag, and DOM path;
- global state keys and source-map URLs.

`analysis/react-atlas.md` is a readable component and root summary.

`analysis/routes.json` is the route graph with frame dimensions, frame URLs,
element counts, capture reason, and per-page React summary.

`analysis/dom-elements.ndjson` contains one JSON object per element. Every row
includes page ID, frame ID, tag, ID, classes, role, accessible name, text,
attributes, bounds, visibility, and whether an open shadow root exists.

`analysis/network.ndjson` contains request/resource metadata and whether a body
was stored or omitted.

## Pages

Each page directory contains:

| File | Meaning |
|---|---|
| `snapshot.html` | Inert rendered DOM with rewritten local assets |
| `live.html` | Original document with runtime shim, when available |
| `page.json` | Page metadata, frame summaries, Storage, and React outline |

## Assets

Assets preserve host, path, and filename shape under `assets/`. This is deliberate:
relative JavaScript chunks and CSS assets continue to resolve without rewriting
the application's module loader.

When a query string would cause a collision, the filename receives a stable
query hash before the extension.

## Live runtime

Each page has a `runtime/page-NNN.js` file containing:

- original page URL;
- original URL to local asset map;
- response status/MIME metadata;
- captured local/session Storage.

`runtime/prprpr-runtime.js` restores safe Storage values and patches `fetch`,
<!-- G  i  tHu  b@ Stars ailsClove   r -->

`XMLHttpRequest`, URL-bearing element properties, and `setAttribute`.

`runtime/snapshot-router.js` can only communicate a route selection to the
parent viewer. Snapshot HTML itself does not load application code.
