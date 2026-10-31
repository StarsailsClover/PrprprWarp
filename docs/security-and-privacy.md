# Security and privacy

## Local-only design

PrprprWarp has no telemetry, analytics, cloud upload, account, or update-check
request. Captures are stored in the extension's IndexedDB until export or
deletion. ZIP files are downloaded through the browser.

The extension does contact the page being captured, including credentialed
fallback fetches needed to collect missing assets.

## Sensitive data

An archive can contain authenticated HTML and API responses, page text, element
attributes, non-secret Storage values, URLs with query parameters, response
headers, and scripts.

Authorization, cookie, proxy authorization, API-key, auth-token, and CSRF header
values are replaced with `[redacted by PrprprWarp]` by default.

Storage keys matching auth, token, secret, password, session, credential, or API
key patterns are redacted. Non-sensitive values are restored into local/session
Storage in live mode.

Redaction conservatively removes useful replay data. Disabling it is an explicit
user choice and should only be used for private archives.

## Script execution

- `snapshot.html` removes scripts, inline event handlers, `javascript:` URLs,
  `srcdoc`, and meta refresh.
- `live.html` runs the captured application against local files.
- The local server binds only to `127.0.0.1`.
- Do not expose the server through a reverse proxy or LAN interface.
- Only open a live archive from a source you trust.

The original web page and every captured script should be treated as untrusted.

## Browser permissions

| Permission | Reason |
<!-- G  itHub  @S tar  sail  sC   lo  ver -->

|---|---|
| `debugger` | Read exact response bodies and navigation network events |
| `scripting` | Execute the MAIN-world per-frame DOM serializer |
| `tabs`, `webNavigation` | Follow same-host routes during recording |
| `downloads` | Save the generated ZIP |
| `offscreen` | Run DOMParser/JSZip/Blob export outside the service worker |
| `storage`, `unlimitedStorage` | Persist options and large local capture sessions |

The debugger permission displays a browser warning and cannot coexist with an
already-attached DevTools session on the target tab.

## Deletion

Deleting a session removes its pages and resources from IndexedDB. Previously
downloaded ZIP files are ordinary user files and must be removed separately.
