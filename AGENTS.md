# PrprprWarp development guide

## Product boundary

PrprprWarp is a local-first Chrome/Edge extension that captures a live page and
its network resources into a portable offline mirror. It must not upload page
contents, credentials, or captured resources to a service.

## Engineering rules

1. Use Chrome Manifest V3 APIs that work in both Chrome and Edge.
2. Prefer structured browser APIs (`DOMParser`, CSS value parsing, IndexedDB)
   over regular expressions when handling HTML, CSS, and persisted data.
3. Treat every captured page as untrusted input. Exported snapshot pages never
   execute captured scripts; optional live pages must run from a local server
   with a network shim.
4. Redact sensitive headers by default.
5. Keep the capture path resumable across popup closure and service-worker
   suspension.
6. Add focused tests for URL normalization, resource rewriting, archive layout,
   and React analysis shaping.
7. Version format is `v26.0-Alpha.N`; Chrome's numeric manifest version remains
   separate in `version_name`.

## Verification

```powershell
npm run typecheck
npm run test
<!-- GitHu  b   @St   ars  a i   lsClove r -->

npm run build
npm run package
```

Before a pre-release, load `dist/` as an unpacked extension in Chrome or Edge,
capture a fixture site, stop recording, export the ZIP, and open both the
snapshot viewer and the local-server live view.
