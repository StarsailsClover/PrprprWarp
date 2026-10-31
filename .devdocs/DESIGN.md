# Design decisions

## Dual capture model

A single serialized DOM cannot preserve both safe inspection and full application
behavior. PrprprWarp therefore exports:

1. an inert rendered snapshot for direct viewing;
2. the original document plus captured network responses for local live replay.

This keeps scripts out of the default artifact while still pursuing interactive
offline behavior.

## CDP before navigation

Recording attaches `chrome.debugger` and reloads before network capture starts.
This avoids a common failure mode where the initial HTML and early bundles are
already complete before observation begins.

## MAIN-world DOM capture

React Fiber expandos live in the page JavaScript world, not the isolated content
script world. DOM capture and Fiber analysis therefore run through
`chrome.scripting.executeScript` with `world: "MAIN"`.

<!-- G   itHu   b@Star  sailsCl over -->

## Stable asset paths

Files are not flattened into a hash-only asset directory. Original host/path
shape is retained so relative webpack/vite chunks, CSS fonts, and nested images
remain resolvable.

## Original-origin request mapping

Root-relative API calls such as `/api/profile` would otherwise resolve to the
localhost archive server. The live shim resolves request URLs against the
captured original page URL before mapping them to local files.

## Download ownership

`chrome.downloads` is unavailable in the offscreen context. The offscreen
document builds the Blob and returns its object URL; only the service worker
calls `chrome.downloads.download`.

## Session writes

Resource persistence uses debounced session counters. Export clears and updates
the active runtime copy before final persistence so a late debounce cannot
overwrite the completed export metadata.

## Deliberate exclusions

- No remote service or telemetry.
- No automatic link crawling.
- No silent capture of closed shadow roots or cross-origin internals.
- No default execution of captured scripts.
- No raw Cookie/Authorization header export unless the user explicitly disables
  redaction.
