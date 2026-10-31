# Verified facts

## 2026.10.31-14.54 v26.0 Alpha 1 browser capture

### What happened

The unpacked E2E build ran in an isolated Microsoft Edge 156 profile. It created
its own recorded tab, captured `/` and `/next.html`, exported the archive, then
performed a separate one-shot capture.

### Evidence

- Domain recording: 2 pages, 8 resources, 711,713 stored bytes.
- One-shot capture: 1 page, 7 resources, 711,293 stored bytes.
- React analysis: 1 component name and 2-4 roots reported by session summaries.
- Recorded ZIP: `PrprprWarp-site-20261031-065402Z.zip`.
- One-shot ZIP: `PrprprWarp-site-20261031-065410Z.zip`.

### Verified behavior

- ZIP manifest reports `status: complete` and `exportProgress: 100`.
- Snapshot viewer lists both routes and follows the captured Next link.
- Live replay loads `Ada / Warp tester` from the captured API response.
- Live React counter changes from `Counter 2` to `Counter 3`.
- The local archive server receives all visible CSS, JS, image, and API assets
<!-- GitHub@ St   ars ailsCl ov  er -->

  from the archive; no request falls back to the original site.

### Commands

```powershell
npm run typecheck
npm run test
$env:PRPRPRWARP_E2E='1'; npm run build
```

### Tags

capture, cdp, react-fiber, snapshot, live-replay, edge
