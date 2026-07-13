# HSD Runtime Stabilization - 2026-07-12

## Scope

- Focused only on the HSD / Symphony collector path.
- Goal was runtime stability, not UI redesign.

## Problem Verified

- The old Symphony collector used `launchPersistentContext(...)` against `collectors/edge-profile`.
- That caused repeated runtime failures under PM2:
  - profile lock / `ProcessSingleton` errors
  - browser launch timeouts
  - overlapping poll cycles when one run exceeded the 60s interval
- The dashboard was then relying on last good HSD data while the source health flipped into error.

## What Changed

- Symphony runtime now uses a storage-state JSON session instead of a shared persistent browser profile.
- New session path:
  - `collectors/symphony/runtime/symphony-storage-state.json`
- New helper file:
  - `collectors/symphony/src/sessionPaths.ts`
- `collectors/symphony/src/index.ts` now:
  - launches a normal headless browser
  - loads saved storage state when available
  - re-saves storage state after successful auth
  - prevents overlapping cycles
  - separates runtime behavior from debug artifact capture
- `collectors/symphony/src/login.ts` now:
  - supports interactive storage-state bootstrap
  - supports legacy-profile import with:
    - `npm run login --workspace collectors/symphony -- --import-legacy-profile`
- `.gitignore` now ignores:
  - `collectors/symphony/runtime/`

## Live Verification

Verified live on Sunday, July 12, 2026:

- Imported the working legacy Symphony session into the new storage-state file.
- Restarted `symphony-collector` under PM2.
- Confirmed fresh HSD posts to the gateway on the new runtime path.
- Confirmed at least two successful post-import cycles.
- Confirmed `/api/status` shows:
  - `sections.symphony.status = ok`
  - `sources.symphony.status = ok`
  - fresh `lastAttemptAt` / `lastSuccessAt`

Live HSD values observed after stabilization:

- `openIncidents = 1`
- `serviceRequests = 4`
- `workOrders = 0`
- `changeRecords = 1`
- `incidentsResponseSla = 100`
- `incidentsResolutionSla = 100`
- `requestsResponseSla = 98.41`
- `requestsResolutionSla = 100`

## Important Operational Note

- Old PM2 log history still contains the earlier persistent-profile failures.
- Those older errors should not be mistaken for current runtime behavior.
- The post-import storage-state cycles succeeded without creating new profile-lock errors.

## How To Operate It Going Forward

Normal refresh:

- `pm2 restart symphony-collector --update-env`

If the HSD session expires:

- preferred:
  - `npm run login --workspace collectors/symphony`
- if the old legacy profile still contains a valid session and is not in use:
  - `npm run login --workspace collectors/symphony -- --import-legacy-profile`

## Next Best HSD Work

1. Tighten login detection a bit more so transient Microsoft login pages recover more gracefully before failing.
2. If needed, move HSD debug artifacts into named debug commands instead of leaving them in the normal collector file.
3. Only after that, consider deeper HSD extraction improvements such as richer breakdowns if the page exposes them reliably.
