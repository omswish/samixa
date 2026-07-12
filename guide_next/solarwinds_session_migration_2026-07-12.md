# SolarWinds Session Migration - 2026-07-12

## Verified Outcome

This pass completed the SolarWinds session-model migration away from locked Playwright persistent runtime profiles.

Live verification completed on Sunday, July 12, 2026:

- `npm run build` passed for all workspaces.
- `pm2 restart solarwinds-collector --update-env` succeeded.
- `http://localhost:4000/api/status` now shows:
  - `sections.servers.status = ok`
  - `sections.networks.status = ok`
  - `sources.solarwinds.status = ok`
- The first scrape after restart completed successfully at `2026-07-12T10:47:13.444Z`.
- The section/source `lastSuccessAt` timestamps now reflect actual post-completion time, not cycle start time.

## What Changed

### Runtime collector

`collectors/solarwinds/src/index.ts` now:

- launches a normal headless Edge browser instead of `launchPersistentContext`
- creates fresh non-persistent browser contexts per host cycle
- loads session cookies from storage-state JSON files:
  - `collectors/solarwinds/runtime/solarwinds-servers-storage-state.json`
  - `collectors/solarwinds/runtime/solarwinds-networks-storage-state.json`
- saves refreshed storage state back to those files after successful authenticated access
- fails with explicit bootstrap guidance if Orion rejects login or a saved session expires
- reports per-section sync timestamps at completion time so dashboard health does not look stale during a normal long cycle

Operational effect:

- PM2 runtime no longer locks the interactive login bootstrap
- collector restarts are cleaner
- saved authenticated Orion sessions can be refreshed and reused intentionally

### Login/bootstrap tooling

`collectors/solarwinds/src/login.ts` now supports two verified flows:

1. Normal refresh flow

- Command:
  - `npm run login --workspace collectors/solarwinds`
- Opens interactive Edge
- User completes login if needed
- Saves session cookies into storage-state JSON files

2. Legacy profile import flow

- Command:
  - `npm run login --workspace collectors/solarwinds -- --import-legacy-profile`
- Uses the old runtime profile directories only for one-time import
- Exports the existing authenticated Orion session into storage-state JSON
- Requires the running `solarwinds-collector` PM2 process to be stopped first

This import flow was used successfully in this pass.

## Exact Recovery Sequence Used

The following sequence was verified live:

1. Stop only the SolarWinds collector:
   - `pm2 stop solarwinds-collector`
2. Export authenticated sessions from the old profile directories:
   - `npm run login --workspace collectors/solarwinds -- --import-legacy-profile`
3. Restart the collector:
   - `pm2 restart solarwinds-collector --update-env`
4. Verify:
   - `pm2 logs solarwinds-collector --lines 40 --nostream`
   - `Invoke-WebRequest -UseBasicParsing http://localhost:4000/api/status | Select-Object -ExpandProperty Content`

## Current Truthful Live State

### Working

- SolarWinds authenticated session reuse is working again.
- Server and network sections are posting successfully from the new storage-state path.
- The dashboard/gateway health model remains honest:
  - on success, current real data is shown
  - on failure, last good data remains visible with status metadata

### Still incomplete

- `RJIO (ISP1)` and `RailTel (ISP2)` still do not have stable latency/utilization values.
- Node-detail probing can still time out intermittently.
- Verified latest post-migration log issue:
  - `2026-07-12T10:47:44.950Z`
  - `SolarWinds node detail probe failed for N:1417: page.goto: Timeout 15000ms exceeded.`

Operational meaning:

- the SolarWinds source is now session-stable enough to run live again
- the carrier-metric coverage is still partial
- the system remains truthful because those missing values stay null instead of being fabricated

## Which SolarWinds Tools Should Stay Tracked

Keep tracked because they are reusable operational tooling:

- `collectors/solarwinds/src/login.ts`
- `collectors/solarwinds/src/debug_status.ts`
- `collectors/solarwinds/src/debug_net_api.ts`

Reason:

- they help refresh sessions, validate auth behavior, and discover repeatable data sources

Do not treat these as long-term tooling:

- `page_source.html`
- screenshots
- one-off DOM dump scripts

Reason:

- those are evidence artifacts from a specific investigation, not stable maintenance tools

## Recommended Next Work Order

1. Finish carrier-level network data.
   - Use `debug_net_api.ts` to identify a stable source for `RJIO` and `RailTel`.
   - Prefer an Orion AJAX/API source over DOM-only parsing if one exists.

2. Harden server coverage.
   - Confirm whether Orion exposes a fuller server data endpoint than the ranked CPU/memory widgets.
   - Keep current parser only as the truthful minimum path.

3. Reduce node-detail timeout noise.
   - Add targeted timeout handling or a lighter-weight latency source for `N:1417` / `N:1419`.
   - Do not mark the whole source failed when only one node-detail probe times out.

4. Productionize the dashboard runtime later.
   - Collector/data truthfulness is in a better place now.
   - After source coverage is stable, switch PM2 dashboard runtime from `next dev` to `next start`.

## Bottom Line

The important change is complete:

- SolarWinds no longer depends on locked persistent runtime profiles.
- Live collector operation is back on verified saved-session JSON files.
- The system is still honoring the agreed rule: real data only, with last-good data preserved when a source fails.
