# Collector Runtime Follow-Up - 2026-07-12

## What Changed

The project is now enforcing the agreed operational rule:

- No synthetic values in normal operation.
- On collector failure, the dashboard keeps the last good data.
- Each section/source now carries its own last-attempt, last-success, and error state.

Implemented in this pass:

- `api-gateway` moved from flat JSON persistence to SQLite-backed state storage.
- Legacy JSON state is migrated into SQLite on startup.
- Gateway state now includes:
  - `sections.nutanix`
  - `sections.servers`
  - `sections.networks`
  - `sections.symphony`
  - derived `sources.nutanix`
  - derived `sources.solarwinds`
  - derived `sources.symphony`
- Nutanix collector no longer fabricates disk percentages.
- Symphony collector no longer emits mock/random data in the normal path.
- SolarWinds collector no longer emits random server or network data.
- SolarWinds collector now runs one cycle at a time instead of overlapping poll runs.
- SolarWinds collector now reuses persistent per-host Edge session profiles.
- SolarWinds now has an interactive bootstrap command: `npm run login --workspace collectors/solarwinds`
- Dashboard labels are now state-driven instead of hardcoded as "all operational".

## Live State Verified

Verification performed on Sunday, July 12, 2026 after rebuilding and restarting the PM2 stack.

### Nutanix

- Live and healthy.
- Posting successfully every cycle.
- Gateway shows fresh `sections.nutanix.status = ok`.

### SolarWinds

- The original `networkidle` timeout problem is removed.
- The collector now posts honest partial/error states instead of fake values.
- Network summary scraping is working for the SD-WAN widget enough to update:
  - `sw-net-3`
  - `sw-net-4`
- `RJIO` / `RailTel` still do not have reliable latency values yet.
- SolarWinds login/session behavior is intermittent in PM2 runtime.
- Current verified issue: fresh credential-based login is being rejected by Orion with `There was a problem authorizing the specified Windows Account.`
- Current verified issue: the server portal exposes ranked CPU and memory widgets, not the old combined row shape, and session-backed access still needs full coverage hardening.

Operational meaning:

- SolarWinds data is now truthful, but not yet stable enough to consider complete.
- The dashboard will show last good values plus visible SolarWinds error state when login or parsing fails.
- A valid interactive SolarWinds session is currently more reliable than raw credential login.

### Symphony

- Random fallback behavior is removed from normal runtime.
- Counts can be read from the live dashboard.
- SLA percentages are now being derived from the inline FusionCharts center-label data instead of fragile SVG text.
- Gateway verification now shows fresh `sections.symphony.status = ok`.

Operational meaning:

- Symphony section is now truthful and live again.
- The main remaining risk on Symphony is portal/session availability, not fake-data logic.

## Important Current Gaps

### 1. SolarWinds server section is not stable enough

What is verified:

- `http://10.36.91.45/Orion/SummaryView.aspx?ViewID=1` exposes real ranked widgets:
  - `NODE MEMORY USED`
  - `NODE AVERAGE CPU LOAD`
- This is enough to recover some real CPU/memory values.
- It is not yet a reliable full-coverage source for all 16 servers.

Why this matters:

- The section may have correct values for some nodes while others stay on last-good or null.
- That is honest, but not operationally complete.

### 2. SolarWinds login/session needs hardening

Verified runtime issue:

- PM2 runs hit `SolarWinds login did not complete` and later explicit Windows-account authorization failures on both `10.36.91.45` and `10.36.91.46`.
- Direct live probe of the login page now returns:
  - `There was a problem authorizing the specified Windows Account.`

Best next move:

- Use the new `npm run login --workspace collectors/solarwinds` bootstrap flow to seed valid authenticated session profiles.
- Confirm whether the current `SW_USER` / `SW_PASS` are still valid for both Orion hosts.

### 3. SolarWinds network coverage is still partial

Verified runtime issue:

- `sw-net-3` and `sw-net-4` are updating from the SD-WAN summary widget.
- `RJIO` and `RailTel` still do not have a stable latency/utilization path.

Best next move:

- Use the authenticated API/network probes already discovered in `debug_net_api.ts` to finish the missing carrier-level metrics.

## Recommended Next Work Order

### 1. Stabilize SolarWinds authentication first

Target:

- Keep one reusable authenticated session per host.
- Only fall back to re-login when the session is invalid.

Why first:

- It removes the largest source of runtime churn for both server and network sections.

### 2. Finish SolarWinds server coverage

Target:

- Parse the live ranked CPU and memory widgets intentionally.
- Then find either:
  - a full server table/query widget, or
  - a repeatable AJAX source behind those widgets.

Success condition:

- All 16 monitored servers update from SolarWinds without fabricated values.

### 3. Promote only the right SolarWinds debug tooling

Keep tracked:

- `collectors/solarwinds/src/debug_status.ts`
- `collectors/solarwinds/src/debug_net_api.ts`
- `collectors/solarwinds/src/login.ts`

Reason:

- They are repeatable investigation tools for live selector/API discovery.

Do not track as normal tooling:

- raw HTML dumps
- screenshots
- one-off page snapshots like `page_source.html`

Reason:

- They are evidence artifacts, not reusable tooling.

### 4. Productionize the dashboard PM2 process after collector fidelity is stable

Current state:

- `dashboard-ui` still runs `next dev` under PM2.

Next change later:

- switch PM2 to `next start`
- keep `npm run build` as the deployment prerequisite

## Practical Operator Rule Going Forward

Until SolarWinds is hardened further:

- Treat Nutanix as the strongest live source.
- Treat SolarWinds as partially integrated but now honest.
- Treat Symphony as live again, with source health now surfaced honestly if the portal fails.
- Do not add any UI polish that hides source instability.

## Bottom Line

This pass improved operational truthfulness substantially.

The system now prefers:

- stale-but-real last data
- visible error state

instead of:

- fresh-looking fabricated data

The next value is not broad refactoring. It is finishing SolarWinds session stability and completing SolarWinds server/network coverage.
