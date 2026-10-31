# Changelog

All notable changes use the BlockConnect version scheme.

## v26.0-Alpha.1

Initial pre-release.

### Added

- Chrome/Edge Manifest V3 extension shell with popup and settings.
- One-shot page capture and same-hostname domain recording.
- CDP network response-body capture with per-resource/session limits.
- All-frame DOM snapshots with element inventories and open shadow roots.
<!-- G   i t Hu   b@S   ta   r sail s C   love  r -->

- Canvas rasterization and form/Storage state capture.
- React Fiber, root, component, hook-shape, marker, and source-map analysis.
- IndexedDB session/page/resource persistence.
- Structured ZIP export with assets, routes, DOM NDJSON, network NDJSON, manifest,
  React Atlas, and per-page metadata.
- Standalone inert snapshot viewer with cross-route navigation.
- Optional live replay through a loopback server and captured-network shim.
- HTML, CSS, srcset, iframe, link, script, and favicon URL rewriting.
- Sensitive header and Storage-key redaction.
- Automated unit tests, package scripts, checksums, and CI.

### Verified

- Chromium/Edge domain recording: 2 pages, 8 resources, React detected.
- One-shot capture: 1 page, 7 resources, React detected.
- Snapshot route switching: Home to `next.html`.
- Live offline React interaction: counter state changed; captured API state loaded.
- `npm run typecheck`, `npm run test`, `npm run build`, `npm audit`.
