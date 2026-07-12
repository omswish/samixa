# Project State Audit - 2026-07-12

## Scope

This note captures the current state of the repository as observed on July 12, 2026.

- No application code was changed during this audit.
- Evidence comes from source review, git history, workspace status, and a full workspace build.
- The only new artifact from this audit is this document.

## Executive Summary

The project is moving in the right direction and the base architecture is already in place:

- The repo is a single npm workspace with five packages: `api-gateway`, `collectors/nutanix`, `collectors/solarwinds`, `collectors/symphony`, and `dashboard`.
- The central data flow is already implemented: collectors post to `api-gateway`, the gateway persists merged state, and the dashboard consumes that state over WebSockets.
- The dashboard builds successfully, and all TypeScript packages compile successfully.

The main caveat is that the implementation is not equally mature across all sources:

- Nutanix is the most real and the closest to production use.
- SolarWinds is still partly a scaffold and currently falls back to generated values when scraping is not working.
- Symphony has a workable login/session approach, but the collector still writes debug artifacts and can fall back to mock values.
- The deployment and storage story is only partially aligned with the docs. The code still uses a JSON state file, not SQLite.

## What Was Verified

### Workspace State

- Current branch: `main`
- Upstream: `origin/main`
- Current tracked history is only three commits deep.
- Current untracked files are limited to SolarWinds debug scripts:
  - `collectors/solarwinds/src/debug_net.ts`
  - `collectors/solarwinds/src/debug_net_api.ts`
  - `collectors/solarwinds/src/debug_page_source.ts`
  - `collectors/solarwinds/src/debug_status.ts`
  - `collectors/solarwinds/src/debug_widget_content.ts`

Root-level Symphony screenshots and HTML dumps are present in the workspace but ignored by git through `.gitignore`.

### Build Check

The following command succeeded end-to-end:

```bash
npm run build
```

This compiled:

- `api-gateway`
- `collectors/nutanix`
- `collectors/solarwinds`
- `collectors/symphony`
- `dashboard`

The dashboard also completed a production Next.js build successfully.

## Architecture As Implemented

### Root Workspace

The repo is set up as an npm workspace monorepo in [package.json](../package.json).

Packages:

- `api-gateway`
- `collectors/nutanix`
- `collectors/solarwinds`
- `collectors/symphony`
- `dashboard`

### API Gateway

The gateway is implemented in [api-gateway/src/index.ts](../api-gateway/src/index.ts) and [api-gateway/src/db.ts](../api-gateway/src/db.ts).

Current behavior:

- Receives collector payloads at `POST /api/update` (`api-gateway/src/index.ts:79`)
- Serves full state at `GET /api/status` (`api-gateway/src/index.ts:70`)
- Pushes `FULL_STATE` and `METRIC_UPDATE` messages over WebSockets (`api-gateway/src/index.ts:27`, `api-gateway/src/index.ts:54`)
- Persists a single merged state object to disk through `saveStateAtomically()` (`api-gateway/src/db.ts:139`)

Important reality check:

- The code persists JSON state, not SQLite.
- `dbPath` defaults to `../data/db.json` when `DB_PATH` is not set (`api-gateway/src/db.ts:4`).
- The PM2 file sets `DB_PATH` to `../data/itdash.db` (`ecosystem.config.js:8`), but the gateway still writes JSON content, so the file extension and the implementation do not match.

### Dashboard

The frontend is a Next.js app in `dashboard/`.

Current behavior in [dashboard/src/app/page.tsx](../dashboard/src/app/page.tsx):

- Connects to the gateway over WebSockets using `NEXT_PUBLIC_API_URL` (`dashboard/src/app/page.tsx:98`)
- Reconnects automatically when the socket closes (`dashboard/src/app/page.tsx:121`)
- Renders Nutanix, network, and Symphony data from the merged gateway state
- Shows the latest sync timestamp from `lastUpdate` (`dashboard/src/app/page.tsx:355`)

Current behavior in [dashboard/src/components/UptimeChart.tsx](../dashboard/src/components/UptimeChart.tsx):

- Uses an auto-scaling Y-axis (`dashboard/src/components/UptimeChart.tsx:23`)
- Uses a thicker stroke for the sparkline (`dashboard/src/components/UptimeChart.tsx:34`)

### Nutanix Collector

The Nutanix collector is implemented in [collectors/nutanix/src/index.ts](../collectors/nutanix/src/index.ts).

What it already does:

- Uses the Prism REST API over HTTPS (`collectors/nutanix/src/index.ts:28`)
- Pulls cluster data from the v2 endpoint
- Pulls VM data from the v1 endpoint (`collectors/nutanix/src/index.ts:56`)
- Computes logical memory usage (`collectors/nutanix/src/index.ts:52`, `collectors/nutanix/src/index.ts:100`)
- Posts merged Nutanix payloads to the gateway every 30 seconds (`collectors/nutanix/src/index.ts:162`)

Important caveat:

- If per-VM disk stats are missing, it currently synthesizes a disk percentage using `Math.random()` (`collectors/nutanix/src/index.ts:83`).
- TLS verification is globally disabled for this process (`collectors/nutanix/src/index.ts:8`), which is pragmatic for an internal self-signed appliance but still a deliberate security tradeoff.

### SolarWinds Collector

The SolarWinds collector is implemented in [collectors/solarwinds/src/index.ts](../collectors/solarwinds/src/index.ts).

What it already does:

- Launches headless Edge through Playwright (`collectors/solarwinds/src/index.ts:22`)
- Attempts to log into the servers portal
- Looks for `table.NeedsZebraStripes` to parse server metrics (`collectors/solarwinds/src/index.ts:55`)
- Posts data to the gateway every 30 seconds (`collectors/solarwinds/src/index.ts:159`)

Current maturity level:

- If the expected table is not found, it generates synthetic server CPU, memory, and status values (`collectors/solarwinds/src/index.ts:81` to `collectors/solarwinds/src/index.ts:94`).
- The network portion currently generates fallback link data directly (`collectors/solarwinds/src/index.ts:115` to `collectors/solarwinds/src/index.ts:121`).

Interpretation:

- SolarWinds is not yet at a point where the dashboard values can be trusted as source-of-truth operational metrics.
- The untracked debug scripts strongly suggest the current implementation effort is focused on discovering stable selectors or AJAX sources for the network widgets.

### Symphony Collector

The Symphony collector is implemented in [collectors/symphony/src/index.ts](../collectors/symphony/src/index.ts), with a session bootstrap helper in [collectors/symphony/src/login.ts](../collectors/symphony/src/login.ts).

What it already does:

- Uses a persistent Edge profile (`collectors/symphony/src/index.ts:21`, `collectors/symphony/src/index.ts:24`)
- Supports interactive session initialization and MFA capture through `npm run login` (`collectors/symphony/src/login.ts:14` to `collectors/symphony/src/login.ts:42`)
- Attempts to parse Angular-bound counters and SVG chart text from the dashboard
- Posts results every 60 seconds (`collectors/symphony/src/index.ts:250`)

Current caveats:

- It writes screenshots during login and runtime analysis (`collectors/symphony/src/index.ts:44`, `collectors/symphony/src/index.ts:93`, `collectors/symphony/src/index.ts:233`)
- It dumps page HTML to disk on each run (`collectors/symphony/src/index.ts:98`)
- On parse failure it falls back to hard-coded mock values (`collectors/symphony/src/index.ts:176`)
- If the dashboard cannot be read, it generates randomized ticket and SLA values (`collectors/symphony/src/index.ts:196` to `collectors/symphony/src/index.ts:208`)

Interpretation:

- The login/session persistence path is a real asset.
- The scraping path still needs hardening before the data should be treated as authoritative.

## Git History: How The Project Progressed

### Commit 1 - `bc70a4b`

Message:

```text
Initial commit: NOC Dashboard and background collectors
```

What landed:

- Entire workspace scaffold
- API gateway
- Three collectors
- Dashboard
- PM2 ecosystem file
- Architecture notes in `guide_next/`

Interpretation:

- Most of the project was created in one large initial delivery rather than being incrementally built in many small commits.
- The first checkpoint established the full target shape quickly.

### Commit 2 - `7ba695c`

Message:

```text
feat: implement dynamic VM metrics collection, logical capacity indicators, and threshold alert colors on Nutanix card
```

What changed:

- `collectors/nutanix/src/index.ts`
- `api-gateway/src/db.ts`
- `dashboard/src/app/page.tsx`

Interpretation:

- The first focused refinement after scaffolding was Nutanix.
- This aligns with the code reality: Nutanix is the most advanced data source in the repo today.

### Commit 3 - `9e3edf6`

Message:

```text
style: dynamic auto-scaling y-axis and thicker line path for sparklines
```

What changed:

- `dashboard/src/components/UptimeChart.tsx`

Interpretation:

- After the Nutanix enhancement, the next pass was pure presentation polish.
- This suggests the UI layer is already stable enough that the remaining risk is mostly in collector fidelity and deployment hardening.

## Strengths Confirmed

- The repo is small, coherent, and easy to reason about.
- The central architecture is already wired correctly: collector -> gateway -> WebSocket -> dashboard.
- TypeScript compilation passes in every package.
- The dashboard production build passes.
- Nutanix data handling is materially ahead of the other integrations.
- The git history, while short, is directionally consistent and not chaotic.
- The untracked debug scripts look purposeful rather than random; they are consistent with active SolarWinds reverse-engineering work.

## Gaps And Risks Confirmed

### 1. Storage implementation does not match the architecture docs

- Docs talk about SQLite.
- The actual gateway still uses a JSON file (`api-gateway/src/db.ts:4`, `api-gateway/src/db.ts:139`).
- `ecosystem.config.js` uses a `.db` filename for that JSON payload (`ecosystem.config.js:8`).

This is the biggest documentation-to-code mismatch in the repo.

### 2. SolarWinds data is not yet trustworthy

- Synthetic server metrics are generated when the DOM parse fails (`collectors/solarwinds/src/index.ts:81` to `collectors/solarwinds/src/index.ts:94`).
- Network metrics are currently generated as fallback data in the normal flow (`collectors/solarwinds/src/index.ts:115` to `collectors/solarwinds/src/index.ts:121`).

This means the dashboard can look healthy even when the SolarWinds scrape is not actually working.

### 3. Symphony data still blends runtime diagnostics with collector behavior

- Screenshots and HTML dumps are part of the normal collector path (`collectors/symphony/src/index.ts:93`, `collectors/symphony/src/index.ts:98`).
- Mock and random fallback values are still present (`collectors/symphony/src/index.ts:176`, `collectors/symphony/src/index.ts:196`).

This is acceptable during active reverse engineering, but not as a steady production path.

### 4. Some dashboard status text is static rather than derived

- Footer text always says `SYSTEM STATUS: ALL OPERATIONAL` (`dashboard/src/app/page.tsx:418`)
- Footer integration labels are also static (`dashboard/src/app/page.tsx:421`, `dashboard/src/app/page.tsx:422`)
- The network card always shows `4 Links Active` even if live data says otherwise (`dashboard/src/components/UnifiedNetworkCard.tsx:37` to `dashboard/src/components/UnifiedNetworkCard.tsx:39`)

This creates a mismatch between real system state and operator-facing status messaging.

### 5. PM2 runtime mode is still development-oriented

- The dashboard app is started with `next dev` in `ecosystem.config.js` (`ecosystem.config.js:36`)

For a long-running operator console, that should eventually become a production start path after build outputs are trusted.

### 6. Tracked example environment data should be sanitized

- `.env.example` currently contains real-looking internal hosts, usernames, and password-shaped defaults (`.env.example:1` to `.env.example:16`)

Even if this is only an internal repo, it is not a clean example file.

## Recommended Next Work Order

### 1. Decide whether collectors are allowed to fail open or must fail closed

This is the most important product decision before more coding.

Two valid modes exist:

- Demo mode: keep synthetic fallbacks so the screen is never empty
- Ops mode: never fabricate metrics; show stale, unavailable, or error states explicitly

Right now the repo mixes both modes.

### 2. Finish the SolarWinds reverse-engineering pass

This is clearly the current implementation frontier.

Recommended actions:

- Use the untracked debug scripts as the basis for a tracked investigation workflow
- Identify stable selectors or background JSON/AJAX endpoints
- Replace generated network values with actual parsed values
- Make failed scraping visible in payload status instead of silently substituting data

### 3. Separate Symphony debug instrumentation from normal collection

Recommended actions:

- Keep the persistent profile login flow
- Gate screenshots and HTML dumps behind an explicit debug flag
- Remove random fallback values from the default runtime path
- Preserve a clear "session invalid" or "parse failed" signal in the gateway payload

### 4. Resolve the storage direction

Choose one of these and commit to it:

- Short-term pragmatic path: keep JSON state, rename the PM2 path accordingly, and document it honestly
- Architecture path: replace `api-gateway/src/db.ts` with real SQLite as planned

Do not leave the code in the current mixed state where the filename suggests SQLite but the implementation is JSON.

### 5. Make the dashboard operator messages state-driven

Recommended actions:

- Derive footer health text from actual collector freshness and payload validity
- Surface last successful scrape time per source
- Replace hard-coded `active` labels with real status

### 6. Add a minimal smoke-check layer

There are no tests right now beyond compilation.

A practical next step would be:

- one schema validation layer for incoming collector payloads
- one smoke test for the gateway state update path
- one build or start script that proves the expected PM2 production flow

## Clarity Needed Before The Next Major Pass

These are the only questions that materially affect implementation direction:

1. Should this dashboard ever fabricate values in normal operation, or should collectors report explicit failure/staleness instead?
2. Do you want to keep the current JSON-backed gateway for now, or should the next backend pass move it to real SQLite?
3. Should the SolarWinds debug scripts be promoted into tracked tooling, or should they remain local investigation files until the scrape is stable?

## Suggested Working Rule For Future Tasks

Until the above three points are decided, the safest rule is:

- Treat Nutanix as the strongest implemented source
- Treat SolarWinds and Symphony as active integration work
- Avoid UI-only polish that could hide collector uncertainty
- Prioritize source fidelity, error signaling, and deployment truthfulness over visual additions

## Bottom Line

The project is genuinely on track.

What exists today is not random scaffolding. The monorepo shape, runtime wiring, WebSocket flow, and dashboard shell are already working. The next meaningful progress is not broad refactoring. It is tightening the truthfulness of the collectors, aligning storage/deployment with reality, and making operator-facing status derived from verified source health.
